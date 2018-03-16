import Vue from 'vue';
import Vuex from 'vuex';
import axios from 'axios';
import config from '../config';

Vue.use(Vuex);

function calcHuveny(lat1, lon1, lat2, lon2) {
  /* eslint-disable */
  const a = 6378137.000;
  const b = 6356752.314245;
  const e2 = 0.00669437999019758;

  const y1	= (lat1 * Math.PI) / 180;
  const x1 = (lon1 * Math.PI) / 180;
  const y2 = (lat2 * Math.PI) / 180;
  const x2 = (lon2 * Math.PI) / 180;

  const y_ave = (y1 + y2) / 2;
  const y_diff = y1 - y2;
  const x_diff = x1 - x2;

  const w = Math.sqrt(1 - e2 * Math.pow(Math.sin(y_ave), 2));
  const n = a / w;
  const m = a * (1 - e2) / Math.pow(w, 3);

  return Math.sqrt(Math.pow(y_diff * m, 2) + Math.pow(x_diff * n * Math.cos(y_ave), 2));
  /* eslint-enable */
}

/* eslint-disable no-param-reassign */
export default new Vuex.Store({
  state: {
    position: null,
    prevStation: null,
    station: {},
    stationGap: 0,
    animationDisabled: false,
    socket: null,
    dic: null,
    online: false,
  },
  mutations: {
    setPosition(state, payload) {
      state.position = payload;
    },
    setPrevStation(state, payload) {
      state.prevStation = payload;
    },
    setStation(state, payload) {
      state.station = payload;
    },
    setAnimationDisabled(state, payload) {
      state.animationDisabled = payload;
    },
    setStationGap(state, payload) {
      state.stationGap = payload;
    },
    setSocket(state, payload) {
      state.socket = payload;
    },
    setOnline(state, payload) {
      state.online = payload;
    },
    setDic(state, payload) {
      localStorage.setItem('STATION_DIC', payload);
    },
    offlineFallback(state) {
      if (!state.dic) {
        const dic = localStorage.getItem('STATION_DIC');
        state.dic = JSON.parse(dic);
      }

      const dic = state.dic;
      const scored = dic.stations.map((station) => {
        const d = calcHuveny(state.position.lat,
          state.position.lon,
          station.lat,
          station.lon);
        station.gap = d;
        return station;
      });
      const sorted = scored.sort((a, b) => {
        if (a.gap < b.gap) return -1;
        if (a.gap > b.gap) return 1;
        return 0;
      });
      const nearest = sorted[0];
      nearest.lines = [];
      const sameStations = scored.filter(station =>
        nearest.station_g_cd === station.station_g_cd);
      sameStations.forEach((station) => {
        const matchedLine = state.dic.lines.filter(line =>
          line.line_cd === station.line_cd);
        nearest.lines.push(matchedLine[0]);
      });

      state.prevStation = nearest;
      state.stationGap = nearest.gap;
      state.animationDisabled = true;

      if (state.prevStation === null ||
        state.prevStation.station_name !== state.station.station_name) {
        state.animationDisabled = false;
        state.station = nearest;
      }
    },
  },
  getters: {
    position: state => () => state.position,
    prevStation: state => () => state.prevStation,
    station: state => () => state.station,
    stationGap: state => () => state.stationGap,
    animationDisabled: state => () => state.animationDisabled,
    socket: state => () => state.socket,
    dic: state => () => state.dic,
    online: state => () => state.online,
  },
  actions: {
    DOWNLOAD_DIC: ({ commit }) => {
      if (localStorage.getItem('STATION_DIC') !== null) {
        return;
      }
      axios.get(config.DicEndpoint).then((resp) => {
        commit('setDic', JSON.stringify(resp.data));
      });
    },
    CONNECT_WS: ({ commit }) => {
      this.endpoint = config.WSEndpoint;
      const socket = new WebSocket(this.endpoint);
      commit('setSocket', socket);
    },
    SEND_WS: ({ getters, commit }, payload) => {
      const pos = JSON.stringify({
        lat: payload.lat,
        lon: payload.lon,
      });
      if (getters.socket().readyState === WebSocket.OPEN) {
        getters.socket().send(pos);
      }
      if (getters.socket().readyState === WebSocket.CLOSED) {
        commit('setOnline', false);
        commit('offlineFallback');
      }
    },
    LISTEN_STATION: ({ getters, commit }) => {
      getters.socket().addEventListener('message', (event) => {
        if (event.data !== undefined) {
          const station = JSON.parse(event.data);
          commit('setPrevStation', station);
          commit('setStationGap', station.gap);

          const prevStation = getters.prevStation();
          commit('setAnimationDisabled', true);

          if (prevStation === null ||
              prevStation.station_name !== getters.station().station_name) {
            commit('setAnimationDisabled', false);
            commit('setStation', station);
          }
        }
      });
    },
    WATCH_POSITION: ({ commit, dispatch, getters }) => {
      commit('setOnline', navigator.onLine);

      if (navigator.geolocation) {
        navigator.geolocation.watchPosition((p) => {
          const position = {
            lat: p.coords.latitude,
            lon: p.coords.longitude,
          };
          commit('setPosition', position);
          if (getters.online) {
            dispatch('SEND_WS', position);
          } else {
            // offline fallback
            commit('offlineFallback');
          }
        }, () => {
          // error
        }, {
          enableHighAccuracy: false,
          timeout: 1000,
          maximumAge: 0,
        });
      }
    },
  },
});