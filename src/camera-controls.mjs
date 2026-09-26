export function edgeScrollStrength(position, size, zone) {
  if (position < zone) return -1 + Math.max(0, position) / zone;
  if (position > size - zone) return 1 - Math.max(0, size - position) / zone;
  return 0;
}

export function edgeScrollDirection(x, y, width, height, zone) {
  let directionX = edgeScrollStrength(x, width, zone);
  let directionY = edgeScrollStrength(y, height, zone);
  const length = Math.hypot(directionX, directionY);
  if (length > 1) {
    directionX /= length;
    directionY /= length;
  }
  return { x: directionX, y: directionY };
}

export function edgeScrollCameraDelta(directionX, directionY, pixels, unitsPerPixel) {
  // Edge direction describes camera travel. The ground moves the other way,
  // so invert the screen delta used by a grab-pan.
  const pan = cameraPanDeltaFromScreen({
    dx: -directionX * pixels,
    dy: -directionY * pixels,
    unitsPerPixel,
  });
  return pan;
}

const CAMERA_RIGHT_GROUND_X = Math.SQRT1_2;
const CAMERA_RIGHT_GROUND_Z = -Math.SQRT1_2;
const CAMERA_UP_GROUND = -1.12 / Math.hypot(0.78, 1.12, 0.78) / Math.SQRT2;

/** Return the target movement that makes the ground follow a screen-space drag. */
export function cameraPanDeltaFromScreen({ dx, dy, viewportHeight, baseFrustum, zoom, unitsPerPixel }) {
  const scale = Number.isFinite(unitsPerPixel)
    ? unitsPerPixel
    : baseFrustum / (Math.max(1, viewportHeight) * zoom);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(scale) || scale <= 0) {
    return { x: 0, z: 0 };
  }

  // Screen right projects onto the ground as (+x, -z), while screen up
  // projects equally onto (-x, -z). Invert that 2D projection, then move the
  // camera in the opposite direction so terrain follows the pointer.
  const dxWorld = dx * scale;
  const dyWorld = dy * scale;
  const determinant = -2 * CAMERA_RIGHT_GROUND_X * CAMERA_UP_GROUND;
  const screenMotionWorldX = (-CAMERA_UP_GROUND * dxWorld
    - CAMERA_RIGHT_GROUND_Z * dyWorld) / determinant;
  const screenMotionWorldZ = (CAMERA_UP_GROUND * dxWorld
    + CAMERA_RIGHT_GROUND_X * dyWorld) / determinant;
  return { x: -screenMotionWorldX, z: -screenMotionWorldZ };
}

export function cameraDepthSafePlanes({
  halfX, halfZ, targetX = 0, targetZ = 0, cameraOffsetX, cameraOffsetZ,
}) {
  const extent = Math.abs(cameraOffsetX) * (halfX + Math.abs(targetX))
    + Math.abs(cameraOffsetZ) * (halfZ + Math.abs(targetZ));
  const distance = Math.max(125, extent + 12);
  return { distance, far: Math.max(300, distance + extent + 24), extent };
}

export function canEdgeScroll({
  pointerType,
  buttons,
  insideViewport,
  mapAvailable,
  pageVisible,
  selectionDragging,
  manualPan,
  targetOrder,
  buildPlacement,
  mapStudioOpen,
  dialogOpen,
  hudPanelOpen,
  hudControlHovered,
  hudControlFocused,
}) {
  return pointerType === 'mouse' && buttons === 0 && insideViewport && mapAvailable && pageVisible
    && !selectionDragging && !manualPan && !targetOrder && !buildPlacement && !mapStudioOpen
    && !dialogOpen && !hudPanelOpen && !hudControlHovered && !hudControlFocused;
}

export function shouldBlockEdgeScrollForFocus({ editable, keyboardFocusedControl }) {
  return Boolean(editable || keyboardFocusedControl);
}

function clampCameraAxis(target, halfMap, offset, margin) {
  const minTarget = -halfMap + offset - margin;
  const maxTarget = halfMap + offset + margin;
  return Math.min(maxTarget, Math.max(minTarget, target));
}

export function clampCameraTargetToGroundBounds({
  x, z, halfX, halfZ, margin = 6, anchorOffset = { x: 0, z: 0 },
}) {
  return {
    x: clampCameraAxis(x, halfX, anchorOffset.x, margin),
    z: clampCameraAxis(z, halfZ, anchorOffset.z, margin),
  };
}

export function cameraTargetForZoomAnchor(target, beforeZoom, afterZoom) {
  return {
    x: target.x + beforeZoom.x - afterZoom.x,
    z: target.z + beforeZoom.z - afterZoom.z,
  };
}
