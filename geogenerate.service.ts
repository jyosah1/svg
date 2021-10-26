import {Injectable} from '@angular/core';
import {Subject} from 'rxjs';

import {MapService} from './map.service';
import {R6ApiServices} from '../../services/r6api.service';
import {connectableObservableDescriptor} from 'rxjs/internal/observable/ConnectableObservable';

declare const L;
declare const skpix;
declare const Raphael;

@Injectable({
  providedIn: 'root'
})
export class GeoGenerateService {
  map;
  referenceLotLayer;
  referenceLot = new Subject();
  lotSummaryList;
  calibratedSvg;

  constructor(
    private r6apiServices: R6ApiServices
  ) {
  }

  removeCalibratedSvg() {
    // this.calibratedSvg
    this.map.removeLayer(this.referenceLotLayer);
  }

  parseSvg(svgconfig, lotsummarylist, map) {
    this.map = map;
    this.map.setZoom(19, {animate: false});
    this.lotSummaryList = lotsummarylist;
    let cc = 0;

    if (!this.lotSummaryList && this.lotSummaryList.length === 0) {
      return;
    }

    const svgBounds = [[svgconfig.neLatBound, svgconfig.neLongBound], [svgconfig.swLatBound, svgconfig.swLongBound]];

    return fetch(svgconfig.svgFileUrl).then(res => {
      // return fetch('assets/b.svg').then(res => {
      return res.text();
    }).then(text => {
      const el = document.getElementById('svg-content');
      el.innerHTML = text;

      const chi = el.firstElementChild.children;
      for (let k = 0; k < chi.length; k++) {
        if (chi[k].getAttribute('id') !== 'lot_shapes') {
          chi[k].innerHTML = '';
        }
      }

      const svgAttr = el.firstElementChild.getAttribute('viewBox');

      const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svgElement.setAttribute('viewBox', svgAttr);
      svgElement.id = 'calibratelots';

      const foundLots = [];
      const lotEls = document.getElementById('lot_shapes').children;
      for (let z = 0; z < lotEls.length; z++) {
        const lotEl = lotEls[z];
        const lotElId = lotEl.getAttribute('id');
        const lotGEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        lotGEl.setAttribute('id', 'g_' + lotElId);
        svgElement.appendChild(lotGEl);
        const productname = lotElId;
        const path = lotEl;
        if (path) {
          foundLots.push(lotElId);
          if (path.nodeName === 'path') {
            const pat = path.getAttribute('d').replace(' ', ',');
            const len = Raphael.getTotalLength(pat);

            const cur = Raphael.parsePathString(pat);

            const points = [[cur[0][1], cur[0][2]]];
            let lastpoint = points[0];
            for (let pi = 1; pi < cur.length; pi++) {
              if (cur[pi][0] === 'l') {
                const newPoint = [lastpoint[0] + cur[pi][1], lastpoint[1] + cur[pi][2]];
                points.push(newPoint);
                lastpoint = newPoint;
              }

              if (cur[pi][0] === 'L') {
                const newPoint = [cur[pi][1], cur[pi][2]];
                lastpoint = newPoint;
                points.push(newPoint);
              }

              if (cur[pi][0] === 'v') {
                const newPoint = [lastpoint[0], lastpoint[1] - cur[pi][1]];
                points.push(newPoint);
                lastpoint = newPoint;
              }

              if (cur[pi][0] === 'V') {
                const newPoint = [lastpoint[0], cur[pi][1]];
                points.push(newPoint);
                lastpoint = newPoint;
              }

              if (cur[pi][0] === 'S' || cur[pi][0] === 'A' || cur[pi][0] === 'C') {
                const tempPath = 'M' + lastpoint[0] + ' ' + lastpoint[1] + ',' + cur[pi].join(' ');
                const newLen = Raphael.getTotalLength(tempPath);
                for (let c = 0; c <= newLen; c += 20) {
                  const p = Raphael.getPointAtLength(tempPath, c);
                  points.push([p.x, p.y]);
                }

                const lastp = Raphael.getPointAtLength(tempPath, newLen);
                lastpoint = [lastp.x, lastp.y];
                points.push(lastpoint);
              }

              if (cur[pi][0] === 's' || cur[pi][0] === 'a' || cur[pi][0] === 'c') {
                const tempPath = 'M' + lastpoint[0] + ' ' + lastpoint[1] + ',' + cur[pi].join(' ');
                const newLen = Raphael.getTotalLength(tempPath);
                const segLen = newLen / 5;
                for (let c = 0; c <= newLen; c += segLen) {
                  const p = Raphael.getPointAtLength(tempPath, c);
                  points.push([p.x, p.y]);
                }
                // for (let c = 0; c <= newLen; c += 20) {
                //   const p = Raphael.getPointAtLength(tempPath, c);
                //   points.push([p.x, p.y]);
                // }

                const lastp = Raphael.getPointAtLength(tempPath, newLen);
                lastpoint = [lastp.x, lastp.y];
                points.push(lastpoint);
              }

              if (cur[pi][0] === 'z' || cur[pi][0] === 'Z') {
                points.push(points[0]);
              }
            }

            points.forEach(point => {
              const circleA = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
              circleA.setAttribute('cx', point[0]);
              circleA.setAttribute('cy', point[1]);
              circleA.setAttribute('fill', 'red');
              circleA.setAttribute('r', '0');
              lotGEl.appendChild(circleA);
            });
          }
        }

        cc += 1;

        if (cc === lotEls.length) {
          const svg = L.svgOverlay(svgElement, svgBounds, {
            interactive: true
          }).addTo(this.map);
          el.innerHTML = '';
          this.highlightPaths(foundLots, svg);
        }
      }
    });
  }

  highlightPaths(lots, svg) {
    const states = {
      type: 'FeatureCollection',
      features: []
    };

    const paneEl = document.getElementsByClassName('leaflet-map-pane')[0];
    const paneRect = paneEl.getBoundingClientRect();

    lots.forEach(lot => {
      const polygons = {
        type: 'Feature',
        properties: {
          lotName: lot
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[]]
        }
      };
      const lotG = document.getElementById('g_' + lot);
      if (lotG) {
        const childEl = lotG.children;
        for (let i = 0; i < childEl.length; i++) {
          const n = childEl[i];
          const rect = n.getBoundingClientRect();
          const point = L.point(rect.x - paneRect.x, rect.y - paneRect.y);
          const ltlng = this.map.layerPointToLatLng(point);
          const index = polygons.geometry.coordinates[0].findIndex(item => {
            return item[0].toString() === ltlng.lng.toString() && item[1].toString() === ltlng.lat.toString();
          });
          if (index < 0) {
            polygons.geometry.coordinates[0].push([ltlng.lng, ltlng.lat]);
          }
        }

        polygons.geometry.coordinates[0].push(polygons.geometry.coordinates[0][0]);
        states.features.push(polygons);
      }
    });

    if (states.features.length > 0) {
      this.createFile(states);
      this.referenceLotLayer = L.geoJSON(states, {
        style: {
          color: '#ff0000',
          weight: 1,
          opacity: 0.65
        },
        onEachFeature: (feature, layer) => {
          layer.on('click', () => {
            this.referenceLot.next(feature);
          });
        }
      });
      this.map.addLayer(this.referenceLotLayer);
      this.map.fitBounds(this.referenceLotLayer.getBounds());
    } else {
      alert('no reference lot found');
    }
    this.map.removeLayer(svg);
  }

  createFile(content) {
    const download = document.createElement('a');
    download.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(content)));
    download.setAttribute('download', 'reference.json');
    download.style.display = 'none';
    document.body.appendChild(download);
    download.click();
    document.body.removeChild(download);
  }

  // highlightcalibratelot(lot, svg) {
  //   const paneEl = document.getElementsByClassName('leaflet-map-pane')[0];
  //   const paneRect = paneEl.getBoundingClientRect();
  //   const states = {
  //     type: 'FeatureCollection',
  //     features: []
  //   };
  //   const polygons = {
  //     type: 'Feature',
  //     properties: {
  //       name: lot.productname
  //     },
  //     geometry: {
  //       type: 'Polygon',
  //       coordinates: [[]]
  //     }
  //   };
  //
  //   const lotpaths = document.getElementById('calibratelots').children;
  //   for (let i = 0; i < lotpaths.length; i++) {
  //     const path = lotpaths[i];
  //     const rect = path.getBoundingClientRect();
  //     const point = L.point(rect.x - paneRect.x, rect.y - paneRect.y);
  //     // const point = L.point(rect.x, rect.y);
  //     const ltlng = this.map.layerPointToLatLng(point);
  //     const index = polygons.geometry.coordinates[0].findIndex(item => {
  //       return item[0].toString() === ltlng.lng.toString() && item[1].toString() === ltlng.lat.toString();
  //     });
  //     if (index < 0) {
  //       polygons.geometry.coordinates[0].push([ltlng.lng, ltlng.lat]);
  //     }
  //   }
  //
  //   polygons.geometry.coordinates[0].push(polygons.geometry.coordinates[0][0]);
  //   states.features.push(polygons);
  //   this.referenceLotLayer = L.geoJSON(states, {
  //     style: {
  //       color: '#ff0000',
  //       weight: 1,
  //       opacity: 0.65
  //     },
  //     onEachFeature: (feature, layer) => {
  //       layer.on('click', () => {
  //         this.referenceLot.next(feature);
  //       });
  //     }
  //   });
  //
  //   this.map.addLayer(this.referenceLotLayer);
  //   this.map.fitBounds(this.referenceLotLayer.getBounds());
  //   this.map.removeLayer(svg);
  // }

  createLotBoundaries(svg, lot, front, left, rear, right) {
    const states = {
      type: 'FeatureCollection',
      features: []
    };
    const paneEl = document.getElementsByClassName('leaflet-map-pane')[0];
    const paneRect = paneEl.getBoundingClientRect();

    if (front && left && rear && right) {
      const lotpaths = [front, left, rear, right];
      const coords = [];
      let pX;
      let pY;
      for (let i = 0; i < lotpaths.length; i++) {
        const path = lotpaths[i];
        const nodename = path.nodeName;

        if (nodename === 'path') {
          const dattribute = path.getAttribute('d');
          if (dattribute) {
            const attribute = dattribute.split('l');
            path.setAttribute('d', attribute[0]);
          }
        }
        if (nodename === 'line') {
          const xAttribute = path.getAttribute('x1');
          const yAttribute = path.getAttribute('y1');
          const x1Attribute = path.getAttribute('x2');
          const y1Attribute = path.getAttribute('y2');


          if (xAttribute && yAttribute) {
            if (pX === xAttribute && pY === yAttribute) {
              pX = x1Attribute;
              pY = y1Attribute;
              path.setAttribute('x1', x1Attribute);
              path.setAttribute('y1', y1Attribute);
            } else {
              pX = xAttribute;
              pY = yAttribute;
              path.setAttribute('x2', xAttribute);
              path.setAttribute('y2', yAttribute);
            }
          }
        }

        if (nodename === 'polyline') {
        }
      }

      const polygons = {
        type: 'Feature',
        properties: {
          name: lot.productname
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[]]
        }
      };

      for (let i = 0; i < lotpaths.length; i++) {
        const path = lotpaths[i];
        const rect = path.getBoundingClientRect();
        const point = L.point(rect.x - paneRect.x, rect.y - paneRect.y);
        const ltlng = this.map.layerPointToLatLng(point);
        polygons.geometry.coordinates[0].push([ltlng.lat, ltlng.lng]);
      }

      polygons.geometry.coordinates[0].push(polygons.geometry.coordinates[0][0]);
      states.features.push(polygons);
    }

    this.referenceLotLayer = L.geoJSON(states, {
      style: {
        color: '#ff7800',
        weight: 0,
        opacity: 0.65
      },
      onEachFeature: (feature, layer) => {
        layer.on('click', () => {
          this.referenceLot.next(feature);
        });
      }
    });

    this.map.addLayer(this.referenceLotLayer);
    // this.map.fitBounds(states.features[0].geometry.coordinates[0]);
    // this.map.removeLayer(svg);
  }

  // createLotBoundaries(svg) {
  //   const states = {
  //     type: 'FeatureCollection',
  //     features: []
  //   };
  //   const paneEl = document.getElementsByClassName('leaflet-map-pane')[0];
  //   const paneRect = paneEl.getBoundingClientRect();
  //   let found = false;
  //   this.lotSummaryList.forEach(lot => {
  //     if (found) {
  //       return;
  //     }
  //     let productname = lot.productname.split('-');
  //     if (productname.length > 1) {
  //       productname = productname[1];
  //     } else {
  //       productname = productname[0];
  //     }
  //     const front = document.getElementById('lot_' + productname + '_front');
  //     const left = document.getElementById('lot_' + productname + '_left');
  //     const rear = document.getElementById('lot_' + productname + '_back');
  //     const right = document.getElementById('lot_' + productname + '_right');
  //
  //     if (front && left && rear && right) {
  //       found = true;
  //       const lotpaths = [front, left, rear, right];
  //       const coords = [];
  //       let pX;
  //       let pY;
  //       for (let i = 0; i < lotpaths.length; i++) {
  //         const path = lotpaths[i];
  //         const nodename = path.nodeName;
  //
  //         if (nodename === 'path') {
  //           const dattribute = path.getAttribute('d');
  //           if (dattribute) {
  //             const attribute = dattribute.split('l');
  //             path.setAttribute('d', attribute[0]);
  //           }
  //         }
  //         if (nodename === 'line') {
  //           const xAttribute = path.getAttribute('x1');
  //           const yAttribute = path.getAttribute('y1');
  //           const x1Attribute = path.getAttribute('x2');
  //           const y1Attribute = path.getAttribute('y2');
  //           if (xAttribute && yAttribute) {
  //             if (pX === xAttribute && pY === yAttribute) {
  //               pX = x1Attribute;
  //               pY = y1Attribute;
  //               path.setAttribute('x1', x1Attribute);
  //               path.setAttribute('y1', y1Attribute);
  //             } else {
  //               pX = xAttribute;
  //               pY = yAttribute;
  //               path.setAttribute('x2', xAttribute);
  //               path.setAttribute('y2', yAttribute);
  //             }
  //           }
  //         }
  //
  //         if (nodename === 'polyline') {
  //         }
  //       }
  //
  //       const polygons = {
  //         type: 'Feature',
  //         properties: {
  //           name: lot.productname
  //         },
  //         geometry: {
  //           type: 'Polygon',
  //           coordinates: [[]]
  //         }
  //       };
  //
  //       for (let i = 0; i < lotpaths.length; i++) {
  //         const path = lotpaths[i];
  //         const rect = path.getBoundingClientRect();
  //         const point = L.point(rect.x - paneRect.x, rect.y - paneRect.y);
  //         const ltlng = this.map.layerPointToLatLng(point);
  //         polygons.geometry.coordinates[0].push([ltlng.lat, ltlng.lng]);
  //       }
  //
  //       polygons.geometry.coordinates[0].push(polygons.geometry.coordinates[0][0]);
  //       states.features.push(polygons);
  //     }
  //   });
  //
  //   this.referenceLotLayer = L.geoJSON(states, {
  //     style: {
  //       color: '#ff7800',
  //       weight: 0,
  //       opacity: 0.65
  //     },
  //     onEachFeature: (feature, layer) => {
  //       layer.on('click', () => {
  //         this.referenceLot.next(feature);
  //       });
  //     }
  //   });
  //
  //   this.map.addLayer(this.referenceLotLayer);
  //   // this.map.fitBounds(states.features[0].geometry.coordinates[0]);
  //   // this.map.removeLayer(svg);
  // }

  getReferenceLot() {
    return this.referenceLot;
  }

  calibirateMasterplan(referece) {
    const config = {
      lotName: referece.properties.name,
      geoJson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              type: 'Anchor',
              lotName: referece.properties.name,
            },
            geometry: {
              type: 'Polygon',
              coordinates: referece.geometry.coordinates
            }
          }
        ]
      }
    };
    this.map.removeLayer(this.referenceLotLayer);
    // return config;
    this.r6apiServices.caliberateEstate(config).subscribe(res => {
      console.log(res);
    });
  }
}
