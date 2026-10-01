import { mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { CAMERA_VIEW_DIRECTION } from '../src/camera-controls.mjs';

const destination = new URL('../docs/art-direction/environment-camera-v1/', import.meta.url);
await mkdir(destination, { recursive: true });
const direction = new THREE.Vector3(...CAMERA_VIEW_DIRECTION).normalize();
const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, .1, 100);
camera.position.copy(direction).multiplyScalar(10);
camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
const scale = 150;
const project = point => {
  const p = new THREE.Vector3(...point).project(camera);
  return [p.x * 4 * scale, -p.y * 3 * scale];
};
const yawPoint = (point, degrees) => new THREE.Vector3(...point)
  .applyAxisAngle(new THREE.Vector3(0, 1, 0), degrees * Math.PI / 180).toArray();
const unit = { x: project([1,0,0]), y: project([0,1,0]), z: project([0,0,1]) };
const elevation = Math.atan2(direction.y, Math.hypot(direction.x, direction.z)) * 180 / Math.PI;
const azimuth = Math.atan2(direction.x, direction.z) * 180 / Math.PI;
const screenRoll = Math.atan2(unit.y[0], -unit.y[1]) * 180 / Math.PI;
const measurements = { cameraViewDirection: CAMERA_VIEW_DIRECTION, azimuthDegrees: azimuth,
  elevationDegrees: elevation, screenRollDegrees: screenRoll, pixelsPerProjectedWorldUnit: scale,
  projectedUnitAxesPx: unit, groundCircleMinorMajorRatio: Math.sin(elevation*Math.PI/180),
  physicalVerticalProjectionRatio: Math.cos(elevation*Math.PI/180),
  headingsDegrees: Array.from({length:8},(_,i)=>i*45),
  note: 'Orthographic source construction reference. Does not calibrate existing painted assets or supply production sprite directions.' };
await writeFile(new URL('measurements.json', destination), JSON.stringify(measurements,null,2)+'\n');
const line = (points, color='#a5b7bf', width=2) => `<polyline points="${points.map(p=>project(p).map(v=>v.toFixed(4)).join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
const dot = (point,color='#f1bd76',radius=4) => { const [x,y]=project(point);return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}"/>`; };
const text = (x,y,value,size=16,color='#d9e2e5') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${value}</text>`;
const box = (center, size, yaw=0, color='#a5b7bf') => {
  const vertices=[];
  for(let i=0;i<8;i++)vertices.push(yawPoint(center.map((v,a)=>v+((i>>a)&1?1:-1)*size[a]/2),yaw));
  let result='';for(let i=0;i<8;i++)for(let a=0;a<3;a++)if(!(i&(1<<a)))result+=line([vertices[i],vertices[i|(1<<a)]],color);
  return result;
};
const tile = () => line([[-.5,0,-.5],[.5,0,-.5],[.5,0,.5],[-.5,0,.5],[-.5,0,-.5]],'#667c88');
const svg = (width,height,body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#202d35"/><g font-family="Arial,sans-serif">${body}</g></svg>\n`;
let body=text(36,42,'Vaelora · fixed camera construction guide',26);
body+=text(36,75,`Azimuth ${azimuth.toFixed(4)}° · elevation ${elevation.toFixed(4)}° · world Y up · screen roll ${screenRoll.toFixed(4)}°`);
body+=`<g transform="translate(235,330)">${tile()}${box([0,.5,0],[1,1,1])}${dot([0,0,0])}</g>`;
body+=text(80,465,'Unit cube / 1 × 1 ground tile');
const circle=Array.from({length:65},(_,i)=>[Math.cos(i*Math.PI/32)*.65,0,Math.sin(i*Math.PI/32)*.65]);
body+=`<g transform="translate(615,330)">${line(circle,'#83b5a4')}${line([[0,0,0],[0,1,0]],'#f1bd76',3)}${dot([0,0,0])}</g>`;
body+=text(470,465,'Ground circle / upright one-unit stem');
body+=text(850,180,`Ground circle ratio: ${measurements.groundCircleMinorMajorRatio.toFixed(6)}`);
body+=text(850,215,`Vertical projection: ${measurements.physicalVerticalProjectionRatio.toFixed(6)}`);
body+=text(850,260,'Root anchor = orange point');
body+=text(850,295,'No perspective convergence');
body+=text(36,535,'Use for 3D source construction. A camera-facing runtime card uses its own image height.',16);
body+=text(36,565,'Existing painted sources remain approximate; this diagram is not new game art.',16);
await writeFile(new URL('camera-construction.svg',destination),svg(1280,600,body));
body=text(36,42,'Eight object rotations · one fixed camera',26);
body+=text(36,73,'Same asymmetric calibration object in every panel. Rotations are around world Y; root remains fixed.');
for(let i=0;i<8;i++){
  const yaw=i*45,x=170+(i%4)*310,y=310+Math.floor(i/4)*320;
  let panel=tile()+box([0,.5,0],[.15,1,.15],yaw);
  panel+=box([.4,.75,.05],[.3,.25,.2],yaw,'#f1bd76');
  panel+=box([-.15,.45,.35],[.2,.2,.3],yaw,'#99b9d7');
  panel+=line([[0,0,0],[0,0,.8]].map(p=>yawPoint(p,yaw)),'#83b5a4',3)+dot([0,0,0]);
  body+=`<g transform="translate(${x},${y})">${panel}</g>`+text(x-35,y+105,`${yaw}°`);
}
body+=text(36,770,'Render or construct the same source object across headings; mirroring a sprite is not an extra measured view.');
await writeFile(new URL('heading-registration.svg',destination),svg(1280,810,body));
console.log(JSON.stringify(measurements));
