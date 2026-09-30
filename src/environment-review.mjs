import * as THREE from 'three';
import { CAMERA_VIEW_DIRECTION } from './camera-controls.mjs';
import { createEnvironmentPilot } from './environment-pilot.mjs';

const stage = document.querySelector('#stage');
const status = document.querySelector('#status');
let assetFailed = false;
THREE.DefaultLoadingManager.onLoad = () => {
  if (!assetFailed) status.textContent = '8 captured views · 30 credits · color + per-pixel depth';
};
THREE.DefaultLoadingManager.onError = (url) => {
  assetFailed = true;
  status.textContent = `Could not load ${url.split('/').pop()}. Reload to retry.`;
};
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label', 'Current cliff on the left, Meshy pilot on the right, three joined pieces below');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x505b43);
const camera = new THREE.OrthographicCamera(-12, 12, 8, -8, 0.1, 100);
const elevation = Math.atan2(CAMERA_VIEW_DIRECTION[1], Math.hypot(CAMERA_VIEW_DIRECTION[0], CAMERA_VIEW_DIRECTION[2]));
const pilot = createEnvironmentPilot();
const specimen = pilot.create(5, -3);
scene.add(specimen);
const joined = [-4, 0, 4].map(x => pilot.create(x, 4));
scene.add(...joined);
const loader = new THREE.TextureLoader();
const grass = loader.load('./assets/environment/frontier-v1/meadow.webp');
grass.colorSpace = THREE.SRGBColorSpace;
grass.wrapS = grass.wrapT = THREE.MirroredRepeatWrapping;
grass.repeat.set(5, 5);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ map: grass, color: 0xd2d4bd }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.025;
scene.add(ground);
const oldTexture = loader.load('./assets/environment/frontier-v1/cliff.webp');
oldTexture.colorSpace = THREE.SRGBColorSpace;
const old = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.6).translate(0, 2.3, 0),
  new THREE.MeshBasicMaterial({ map: oldTexture, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, toneMapped: false }));
old.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(
  new THREE.Vector3(...CAMERA_VIEW_DIRECTION), new THREE.Vector3(), new THREE.Vector3(0, 1, 0),
));
scene.add(old);
function label(text, detail) {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 112;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1d291be8'; ctx.fillRect(0, 0, 640, 112);
  ctx.textAlign = 'center'; ctx.fillStyle = '#ecebd7'; ctx.font = 'bold 30px system-ui'; ctx.fillText(text, 320, 44);
  ctx.fillStyle = '#bdc5af'; ctx.font = '21px system-ui'; ctx.fillText(detail, 320, 84);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, toneMapped: false }));
  sprite.scale.set(6, 1.05, 1); sprite.renderOrder = 10; scene.add(sprite); return sprite;
}
const oldLabel = label('CURRENT CLIFF', 'Existing single-view illustration');
const newLabel = label('MESHY PILOT', 'Eight views · per-pixel depth');
const probes = [0, 1].map(() => {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.48, 6), new THREE.MeshBasicMaterial({color:0x5aa7d7}));
  body.position.y = 0.24;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13), new THREE.MeshBasicMaterial({color:0xb9dcf2}));
  head.position.y = 0.58; group.add(body, head); scene.add(group); return group;
});
let yawIndex = 0, close = false, moving = true, phase = 0;
function frame() {
  const azimuth = (yawIndex + 1) * Math.PI / 4;
  const radial = new THREE.Vector3(Math.sin(azimuth), 0, Math.cos(azimuth));
  const right = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth));
  const target = new THREE.Vector3(0, 0.8, 0);
  camera.position.copy(target).add(new THREE.Vector3(radial.x * Math.cos(elevation), Math.sin(elevation), radial.z * Math.cos(elevation)).multiplyScalar(30));
  camera.lookAt(target); camera.updateMatrixWorld();
  const row = radial.clone().multiplyScalar(-3.4);
  old.position.copy(row).addScaledVector(right, -4.7);
  specimen.position.copy(row).addScaledVector(right, 4.7);
  oldLabel.position.copy(old.position); oldLabel.position.y = 5;
  newLabel.position.copy(specimen.position); newLabel.position.y = 4;
  joined.forEach((mesh, index) => mesh.position.copy(radial).multiplyScalar(3.8).add(new THREE.Vector3((index - 1) * 4, 0, 0)));
  pilot.update(camera, yawIndex);
  document.querySelector('#angle').textContent = `VIEW ${String((yawIndex + 1) % 8 + 1).padStart(2, '0')} · ${((yawIndex + 1) % 8) * 45}°`;
  const width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight), aspect = width / height;
  const span = Math.max(14, 23 / aspect) / (close ? 1.3 : 1);
  camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
  camera.top = span / 2; camera.bottom = -span / 2; camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
function turn(step) { yawIndex = (yawIndex + step + 8) % 8; frame(); }
document.querySelector('#previous').addEventListener('click', () => turn(-1));
document.querySelector('#next').addEventListener('click', () => turn(1));
document.querySelector('#zoom').addEventListener('click', event => {
  close = !close; event.currentTarget.setAttribute('aria-pressed', String(close)); frame();
});
document.querySelector('#motion').addEventListener('click', event => {
  moving = !moving; event.currentTarget.setAttribute('aria-pressed', String(moving));
  event.currentTarget.textContent = moving ? 'Pause probes' : 'Resume probes';
});
window.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (event.key.toLowerCase() === 'q') turn(-1);
  if (event.key.toLowerCase() === 'e') turn(1);
});
new ResizeObserver(frame).observe(stage);
frame();
let previous = performance.now();
renderer.setAnimationLoop(now => {
  if (moving) phase += Math.min((now - previous) / 1000, 0.1) * 0.45;
  previous = now;
  probes.forEach((probe, index) => {
    const angle = phase + index * Math.PI;
    probe.position.set(joined[1].position.x + Math.cos(angle) * 6.4, 0,
      joined[1].position.z + Math.sin(angle) * 1.6);
  });
  renderer.render(scene, camera);
});
