import { Component, OnInit } from '@angular/core';
import { LineModel } from '../models/line-model';
import { StationService } from '../services/station/station.service';
import { Subject } from 'rxjs/Subject';
import { Wsmodel } from '../models/wsmodel';
import { AfterViewInit } from '@angular/core/src/metadata/lifecycle_hooks';
import { StationModel } from '../models/station-model';

import * as html2canvas from 'html2canvas';
import { UploadService } from '../services/upload/upload.service';
import { DomSanitizer } from '@angular/platform-browser';
import { SafeUrl } from '@angular/platform-browser/src/security/dom_sanitization_service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-station',
  templateUrl: './station.component.html',
  styleUrls: ['./station.component.scss']
})
export class StationComponent implements OnInit, AfterViewInit {

  lines: LineModel[];
  station: StationModel = null;

  initialized =  false;

  private sub: Subject<any>;

  panelClasses = 'panel animated slideInRight';
  lineClasses = 'line animated slideInRight';

  constructor(
    private stationSvc: StationService,
    private uploadSvc: UploadService,
    private sanitizer: DomSanitizer
  ) { }

  ngOnInit() {
    this.connectWS();
  }

  ngAfterViewInit() {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition((pos: Position) => {
        const msg: Wsmodel = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        };
        this.sub.next(msg);
      }, (err: PositionError) => {
        // nothing to do
      }, {
        enableHighAccuracy: true,
        timeout: 1000,
        maximumAge: 0
      });
    }
  }

   connectWS() {
    this.sub = this.stationSvc.connect();

    this.sub.subscribe((resp: StationModel) => {
      if (!this.initialized) {
        this.lines = resp.lines;
        this.station = resp;
      }
      if (this.station.station_name !== resp.station_name) {
        this.lines = resp.lines;
        this.station = resp;
      }
      this.station.gap = resp.gap;
      this.initialized = true;
    });
   }


   capture(event) {
     if (this.station === null) {
      event.preventDefault();
      return;
    }
     const win = window.open('', '_blank');
     win.document.body.innerHTML = 'loading...';
    // Animate.cssを使うとキャプチャが取れないため、一旦外す
     this.panelClasses = 'panel';
     this.lineClasses = 'line';
     setTimeout(() => {
      // キャプチャし画像化
      html2canvas(document.querySelector('.wrapper') as HTMLCanvasElement).then(canvas => {
        canvas.toBlob((blob) => {
          this.uploadSvc.uploadImageToImgur(blob)
            .subscribe((url: string) => {
              const msg = `私は今、${this.station.station_name}駅付近にいます。 ${url} https://near.tinykitten.me/ %23KittenNearStation&via=tinykitten8`;
              const popupUrl = `http://twitter.com/intent/tweet?text=${msg}`;
              win.location.href = popupUrl;
            }, (err: HttpErrorResponse) => {
              win.close();
              alert('シェアに失敗しました。');
            });
        });
      });
    }, 100);
    // 戻す
    setTimeout(() => {
      this.panelClasses = 'panel animated slideInRight';
      this.lineClasses = 'line animated slideInRight';
    }, 100);
  }
}
