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
  const scale = pixels * unitsPerPixel * 0.7;
  return {
    x: (directionX - directionY * 0.65) * scale,
    z: (-directionX - directionY * 0.65) * scale,
  };
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
}) {
  return pointerType === 'mouse' && buttons === 0 && insideViewport && mapAvailable && pageVisible
    && !selectionDragging && !manualPan && !targetOrder && !buildPlacement && !mapStudioOpen
    && !dialogOpen && !hudPanelOpen && !hudControlHovered;
}

function clampCameraAxis(target, halfMap, groundMin, groundMax) {
  const minTarget = -halfMap - (groundMin - target);
  const maxTarget = halfMap - (groundMax - target);
  if (minTarget > maxTarget) return 0;
  return Math.min(maxTarget, Math.max(minTarget, target));
}

export function clampCameraTargetToGroundBounds({ x, z, halfX, halfZ, bounds }) {
  return {
    x: clampCameraAxis(x, halfX, bounds.left, bounds.right),
    z: clampCameraAxis(z, halfZ, bounds.top, bounds.bottom),
  };
}

export function cameraTargetForZoomAnchor(target, beforeZoom, afterZoom) {
  return {
    x: target.x + beforeZoom.x - afterZoom.x,
    z: target.z + beforeZoom.z - afterZoom.z,
  };
}
