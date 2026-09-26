import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cameraDepthSafePlanes,
  cameraTargetForZoomAnchor,
  cameraPanDeltaFromScreen,
  canEdgeScroll,
  clampCameraTargetToGroundBounds,
  edgeScrollCameraDelta,
  edgeScrollDirection,
} from '../src/camera-controls.mjs';

const zone = 40;
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
assert.ok(delta.x < 0 && delta.z < 0, 'top-left edge scroll moves the camera target toward the matching screen quadrant');

const unitsPerPixel = 43 / (720 * 0.91);
const panRight = cameraPanDeltaFromScreen({ dx: 24, dy: 0, unitsPerPixel });
const panDown = cameraPanDeltaFromScreen({ dx: 0, dy: 24, unitsPerPixel });
assert.ok(panRight.x < 0 && panDown.x < 0
  && panRight.z > 0 && panDown.z < 0,
  'grab-pan target movement inverts the projected horizontal/vertical ground basis');

const allowedState = {
  pointerType: 'mouse', buttons: 0, insideViewport: true, mapAvailable: true, pageVisible: true,
  selectionDragging: false, manualPan: false, targetOrder: false, buildPlacement: false,
  mapStudioOpen: false, dialogOpen: false, hudPanelOpen: false, hudControlHovered: false,
  hudControlFocused: false,
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
  { hudControlFocused: true },
]) {
  assert.equal(canEdgeScroll({ ...allowedState, ...blockedState }), false,
    `edge scrolling is disabled when ${Object.keys(blockedState)[0]} blocks it`);
}

const atEastSouthMapEdge = clampCameraTargetToGroundBounds({
  x: 50, z: -50, halfX: 32, halfZ: 32,
});
assert.deepEqual(atEastSouthMapEdge, { x: 38, z: -38 });
const atWestNorthMapEdge = clampCameraTargetToGroundBounds({
  x: -50, z: 50, halfX: 32, halfZ: 32,
});
assert.deepEqual(atWestNorthMapEdge, { x: -38, z: 38 });
const viewLargerThanMap = clampCameraTargetToGroundBounds({
  x: 19, z: -11, halfX: 32, halfZ: 32,
});
assert.deepEqual(viewLargerThanMap, { x: 19, z: -11 });

for (const [name, width, height] of [
  ['Cinder Ridge', 80, 56],
  ['Stone Pass', 64, 64],
  ['Frontier 224', 224, 160],
]) {
  for (const [x, z] of [[-width / 2, -height / 2], [width / 2, -height / 2],
    [-width / 2, height / 2], [width / 2, height / 2]]) {
    const reachable = clampCameraTargetToGroundBounds({ x, z, halfX: width / 2, halfZ: height / 2 });
    assert.deepEqual(reachable, { x, z }, `${name} corner remains reachable at all zoom levels`);
    const clipPlanes = cameraDepthSafePlanes({
      halfX: width / 2,
      halfZ: height / 2,
      targetX: reachable.x,
      targetZ: reachable.z,
      cameraOffsetX: 0.78 / Math.hypot(0.78, 1.12, 0.78),
      cameraOffsetZ: 0.78 / Math.hypot(0.78, 1.12, 0.78),
    });
    assert.ok(clipPlanes.distance - clipPlanes.extent >= 12
      && clipPlanes.far - clipPlanes.distance >= clipPlanes.extent + 24,
    `${name} corner stays between dynamic camera clip planes`);
  }
}

const maxMargin = clampCameraTargetToGroundBounds({ x: 100, z: -100, halfX: 32, halfZ: 32 });
assert.deepEqual(maxMargin, { x: 38, z: -38 }, 'overscroll stays within the explicit six-unit margin');
const hudSafeCorner = clampCameraTargetToGroundBounds({
  x: 42, z: -42, halfX: 32, halfZ: 32, anchorOffset: { x: 4, z: -4 },
});
assert.deepEqual(hudSafeCorner, { x: 42, z: -42 }, 'HUD-safe focus offsets keep map corners reachable');

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
function projectToPixels(point, width, height) {
  const projected = point.clone().project(camera);
  return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
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

for (const nextZoom of [0.48, 0.91, 2.3]) {
  const width = 1366;
  const height = 768;
  const frustum = 43;
  camera.left = -frustum * width / height / 2;
  camera.right = frustum * width / height / 2;
  camera.top = frustum / 2;
  camera.bottom = -frustum / 2;
  camera.zoom = nextZoom;
  camera.updateProjectionMatrix();
  target.set(0, 0, 0);
  placeCamera();
  const anchor = groundUnderPointer();
  const before = projectToPixels(anchor, width, height);
  const drag = { x: 31, y: -17 };
  const pan = cameraPanDeltaFromScreen({
    dx: drag.x,
    dy: drag.y,
    viewportHeight: height,
    baseFrustum: frustum,
    zoom: nextZoom,
  });
  target.x += pan.x;
  target.z += pan.z;
  placeCamera();
  const after = projectToPixels(anchor, width, height);
  assert.ok(Math.abs(after.x - before.x - drag.x) < 1e-8
    && Math.abs(after.y - before.y - drag.y) < 1e-8,
  `grab-pan projection matches the pointer at zoom ${nextZoom}`);

  for (const direction of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 }]) {
    target.set(0, 0, 0);
    placeCamera();
    const mapCenterBefore = projectToPixels(target, width, height);
    const edgeDelta = edgeScrollCameraDelta(direction.x, direction.y, 20, frustum / (height * nextZoom));
    target.x += edgeDelta.x;
    target.z += edgeDelta.z;
    placeCamera();
    const mapCenterAfter = projectToPixels(new THREE.Vector3(0, 0, 0), width, height);
    const movedX = mapCenterBefore.x - mapCenterAfter.x;
    const movedY = mapCenterBefore.y - mapCenterAfter.y;
    assert.ok(Math.abs(movedX - direction.x * 20) < 1e-8
      && Math.abs(movedY - direction.y * 20) < 1e-8
      && Math.abs(Math.hypot(movedX, movedY) - 20) < 1e-8,
      `edge scroll projects to the same speed at zoom ${nextZoom}`);
  }
}

process.stdout.write('Camera controls scenario passed.\n');
