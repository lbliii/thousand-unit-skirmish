import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cameraTargetForZoomAnchor,
  canEdgeScroll,
  clampCameraTargetToGroundBounds,
  edgeScrollCameraDelta,
  edgeScrollDirection,
} from '../src/camera-controls.mjs';

const zone = 28;
const width = 1280;
const height = 720;
const center = edgeScrollDirection(width / 2, height / 2, width, height, zone);
assert.deepEqual(center, { x: 0, y: 0 });
assert.deepEqual(edgeScrollDirection(0, height / 2, width, height, zone), { x: -1, y: 0 });
assert.deepEqual(edgeScrollDirection(width, height / 2, width, height, zone), { x: 1, y: 0 });
assert.deepEqual(edgeScrollDirection(width / 2, 0, width, height, zone), { x: 0, y: -1 });
assert.deepEqual(edgeScrollDirection(width / 2, height, width, height, zone), { x: 0, y: 1 });

const diagonal = edgeScrollDirection(0, 0, width, height, zone);
assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-12,
  'diagonal edge scroll keeps the same total speed as cardinal movement');
assert.ok(Math.abs(diagonal.x + Math.SQRT1_2) < 1e-12);
assert.ok(Math.abs(diagonal.y + Math.SQRT1_2) < 1e-12);
const delta = edgeScrollCameraDelta(diagonal.x, diagonal.y, 20, 0.5);
assert.ok(delta.x < 0 && delta.z > 0, 'top-left screen movement pans toward the matching world quadrant');

const allowedState = {
  pointerType: 'mouse', buttons: 0, insideViewport: true, mapAvailable: true, pageVisible: true,
  selectionDragging: false, manualPan: false, targetOrder: false, buildPlacement: false,
  mapStudioOpen: false, dialogOpen: false, hudPanelOpen: false, hudControlHovered: false,
};
assert.equal(canEdgeScroll(allowedState), true);
for (const blockedState of [
  { pointerType: 'touch' },
  { buttons: 1 },
  { insideViewport: false },
  { mapAvailable: false },
  { pageVisible: false },
  { selectionDragging: true },
  { manualPan: true },
  { targetOrder: true },
  { buildPlacement: true },
  { mapStudioOpen: true },
  { dialogOpen: true },
  { hudPanelOpen: true },
  { hudControlHovered: true },
]) {
  assert.equal(canEdgeScroll({ ...allowedState, ...blockedState }), false,
    `edge scrolling is disabled when ${Object.keys(blockedState)[0]} blocks it`);
}

const atEastSouthMapEdge = clampCameraTargetToGroundBounds({
  x: 50, z: -50, halfX: 32, halfZ: 32,
  bounds: { left: 20, right: 40, top: -40, bottom: -20 },
});
assert.deepEqual(atEastSouthMapEdge, { x: 42, z: -42 });
const atWestNorthMapEdge = clampCameraTargetToGroundBounds({
  x: -50, z: 50, halfX: 32, halfZ: 32,
  bounds: { left: -40, right: -20, top: 20, bottom: 40 },
});
assert.deepEqual(atWestNorthMapEdge, { x: -42, z: 42 });
const viewLargerThanMap = clampCameraTargetToGroundBounds({
  x: 19, z: -11, halfX: 32, halfZ: 32,
  bounds: { left: -40, right: 40, top: -40, bottom: 40 },
});
assert.deepEqual(viewLargerThanMap, { x: 0, z: 0 });

const camera = new THREE.OrthographicCamera(-40, 40, 22.5, -22.5, 0.1, 300);
const cameraOffset = new THREE.Vector3(0.78, 1.12, 0.78).normalize();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0.62, -0.4);
const target = new THREE.Vector3(0, 0, 0);
function placeCamera() {
  camera.position.copy(target).addScaledVector(cameraOffset, 125);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}
function groundUnderPointer() {
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(ground, new THREE.Vector3());
}
placeCamera();
const anchoredPoint = groundUnderPointer();
for (const nextZoom of [1.8, 0.72, 1.2]) {
  camera.zoom = nextZoom;
  camera.updateProjectionMatrix();
  placeCamera();
  const shiftedPoint = groundUnderPointer();
  const anchoredTarget = cameraTargetForZoomAnchor(target, anchoredPoint, shiftedPoint);
  target.set(anchoredTarget.x, 0, anchoredTarget.z);
  placeCamera();
  assert.ok(groundUnderPointer().distanceTo(anchoredPoint) < 1e-9,
    `ground point beneath an off-center pointer remains fixed at zoom ${nextZoom}`);
}
assert.ok(target.length() > 0, 'off-center zoom pans the camera toward its anchor');

process.stdout.write('Camera controls scenario passed.\n');
