import * as THREE from 'three';
import { applyBuildingGroundDepth } from './building-sprites.mjs';

const DEFAULT_MANIFEST_URL = new URL(
  '../assets/buildings/town-center-lifecycle-meshy-v1/lifecycle-grid.json',
  import.meta.url,
).href;
const manifestPromises = new Map();
const imagePromises = new Map();

function asAbsoluteUrl(path, baseUrl) {
  return new URL(path, baseUrl).href;
}

async function loadManifest(manifestUrl) {
  if (!manifestPromises.has(manifestUrl)) {
    const pending = (async () => {
      const response = await fetch(manifestUrl, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Building view manifest returned HTTP ${response.status}`);
      const manifest = await response.json();
      if (manifest.schema !== 'thousand-unit-skirmish.building-lifecycle-reference.v1'
        || !Array.isArray(manifest.camera?.azimuthDegrees)
        || !Array.isArray(manifest.camera?.framePixels)
        || !Array.isArray(manifest.camera?.anchorPixelFromTopLeft)
        || !Array.isArray(manifest.stateOrder)) {
        throw new Error('Building view manifest has an unsupported schema or camera contract');
      }
      return manifest;
    })();
    manifestPromises.set(manifestUrl, pending);
    pending.catch(() => manifestPromises.delete(manifestUrl));
  }
  return manifestPromises.get(manifestUrl);
}

function loadVerifiedImage(path, expectedSha256, manifestUrl) {
  const url = asAbsoluteUrl(path, manifestUrl);
  const cacheKey = `${url}:${expectedSha256}`;
  if (!imagePromises.has(cacheKey)) {
    const pending = (async () => {
      if (!/^[a-f0-9]{64}$/i.test(expectedSha256 || '')) {
        throw new Error(`Building view image has no valid SHA-256 digest: ${path}`);
      }
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable for building view verification');
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      const actual = [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, '0')).join('');
      if (actual !== expectedSha256.toLowerCase()) throw new Error(`${path} SHA-256 differs from its manifest entry`);
      const blob = new Blob([bytes], { type: response.headers.get('content-type') || 'image/webp' });
      const imageUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.decoding = 'async';
      image.src = imageUrl;
      try {
        await image.decode();
        return image;
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    })();
    imagePromises.set(cacheKey, pending);
    pending.catch(() => imagePromises.delete(cacheKey));
  }
  return imagePromises.get(cacheKey);
}

function lifecycleStateName(input, manifest) {
  if (typeof input === 'string') return input;
  if (input?.state && manifest.stateOrder.includes(input.state)) return input.state;

  const mapping = manifest.stateMapping || {};
  const progress = Number.isFinite(input?.progress) ? THREE.MathUtils.clamp(input.progress, 0, 1) : 1;
  const complete = input?.complete === true || progress >= 1;
  if (!complete) {
    const foundationLimit = Number(mapping.construction?.foundationAtOrBelow) || 0.275;
    return progress <= foundationLimit ? 'foundation' : 'frame';
  }

  const maxHp = Number(input?.maxHp);
  const hp = Number(input?.hp);
  if (Number.isFinite(maxHp) && maxHp > 0 && Number.isFinite(hp)) {
    const ratio = THREE.MathUtils.clamp(hp / maxHp, 0, 1);
    const criticalLimit = Number(mapping.health?.criticalAtOrBelow) || 0.3;
    const damagedLimit = Number(mapping.health?.damagedAtOrBelow) || 0.6;
    if (ratio <= criticalLimit) return 'critical';
    if (ratio <= damagedLimit) return 'damaged';
  }
  return 'complete';
}

function findState(manifest, name) {
  if (name === 'complete') return manifest.completeState;
  return manifest.states?.find((state) => state.state === name) || null;
}

function nearestViewIndex(camera, position, azimuths) {
  if (!camera || !Array.isArray(azimuths) || azimuths.length === 0) return 0;
  const dx = camera.position.x - position.x;
  const dz = camera.position.z - position.z;
  const cameraAzimuth = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
  let bestIndex = 0;
  let bestDelta = Infinity;
  for (let index = 0; index < azimuths.length; index++) {
    const delta = Math.abs(((cameraAzimuth - azimuths[index] + 540) % 360) - 180);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function teamColorCss(teamColor) {
  if (typeof teamColor === 'string') return teamColor;
  if (!Number.isFinite(teamColor)) return null;
  return `#${Math.round(teamColor).toString(16).padStart(6, '0').slice(-6)}`;
}

async function composeFrame(view, teamColor, manifestUrl) {
  const color = await loadVerifiedImage(view.path, view.sha256, manifestUrl);
  const colorCss = teamColorCss(teamColor);
  let mask = null;
  if (colorCss && view.teamMaskPath && view.teamMaskSha256) {
    mask = await loadVerifiedImage(view.teamMaskPath, view.teamMaskSha256, manifestUrl);
  }

  const width = color.naturalWidth || color.width;
  const height = color.naturalHeight || color.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create a canvas for the building view');
  context.drawImage(color, 0, 0, width, height);

  if (mask) {
    const overlay = document.createElement('canvas');
    overlay.width = width;
    overlay.height = height;
    const overlayContext = overlay.getContext('2d');
    if (!overlayContext) throw new Error('Could not create a team-color canvas for the building view');
    overlayContext.fillStyle = colorCss;
    overlayContext.fillRect(0, 0, width, height);
    overlayContext.globalCompositeOperation = 'destination-in';
    overlayContext.drawImage(mask, 0, 0, width, height);
    context.globalAlpha = 0.86;
    context.drawImage(overlay, 0, 0);
    context.globalAlpha = 1;
  }
  return canvas;
}

export function createCapturedBuildingSprite({
  manifestUrl = DEFAULT_MANIFEST_URL,
  teamColor = null,
} = {}) {
  const material = new THREE.SpriteMaterial({
    map: null,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.025,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  applyBuildingGroundDepth(material);
  const sprite = new THREE.Sprite(material);
  sprite.visible = false;
  sprite.renderOrder = 0.9;
  sprite.userData.capturedBuildingArt = {
    manifestUrl: new URL(manifestUrl, import.meta.url).href,
    teamColor,
    manifest: null,
    manifestPromise: null,
    lifecycleInput: 'complete',
    camera: null,
    worldPosition: new THREE.Vector3(),
    requestKey: null,
    requestVersion: 0,
    disposed: false,
    warned: false,
  };
  return sprite;
}

export function updateCapturedBuildingSprite(sprite, camera, lifecycleInput = 'complete') {
  const data = sprite?.userData?.capturedBuildingArt;
  if (!data || data.disposed) return;
  data.camera = camera;
  data.lifecycleInput = lifecycleInput;
  if (!data.manifest) {
    if (!data.manifestPromise) {
      data.manifestPromise = loadManifest(data.manifestUrl).then((manifest) => {
        data.manifest = manifest;
        data.manifestPromise = null;
        requestCurrentFrame(sprite, data);
      }).catch((error) => {
        data.manifestPromise = null;
        if (!data.warned) {
          data.warned = true;
          console.warn('Captured building views unavailable; using the procedural Town Center fallback.', error);
        }
      });
    }
    return;
  }
  requestCurrentFrame(sprite, data);
}

function requestCurrentFrame(sprite, data) {
  if (data.disposed || !data.manifest) return;
  const stateName = lifecycleStateName(data.lifecycleInput, data.manifest);
  const state = findState(data.manifest, stateName);
  if (!state?.views?.length) {
    // A Complete-only source must yield to its fallback during construction/damage.
    // Invalidate pending loads so an older frame cannot become visible afterward.
    if (data.requestKey !== null) { data.requestKey = null; ++data.requestVersion; }
    sprite.visible = false;
    if (!data.warned) {
      data.warned = true;
      console.warn(`Captured building state "${stateName}" is missing from ${data.manifest.asset}.`);
    }
    return;
  }
  const position = sprite.parent?.getWorldPosition(data.worldPosition) || sprite.position;
  const viewIndex = nearestViewIndex(data.camera, position, data.manifest.camera.azimuthDegrees);
  const view = state.views.find((candidate) => candidate.index === viewIndex) || state.views[viewIndex];
  if (!view) return;
  const requestKey = `${stateName}:${viewIndex}:${teamColorCss(data.teamColor) || 'plain'}`;
  if (data.requestKey === requestKey) return;
  data.requestKey = requestKey;
  const version = ++data.requestVersion;

  const dimensions = data.manifest.camera.framePixels;
  const pixelsPerWorldUnit = data.manifest.camera.pixelsPerWorldUnit;
  if (Number.isFinite(pixelsPerWorldUnit) && pixelsPerWorldUnit > 0) {
    sprite.scale.set(dimensions[0] / pixelsPerWorldUnit, dimensions[1] / pixelsPerWorldUnit, 1);
    sprite.center.set(data.manifest.camera.anchorPixelFromTopLeft[0] / dimensions[0],
      1 - data.manifest.camera.anchorPixelFromTopLeft[1] / dimensions[1]);
    sprite.position.y = 0.035;
  }

  composeFrame(view, data.teamColor, data.manifestUrl).then((canvas) => {
    if (data.disposed || version !== data.requestVersion) return;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    const previous = sprite.material.map;
    sprite.material.map = texture;
    sprite.material.needsUpdate = true;
    sprite.visible = true;
    previous?.dispose();
  }).catch((error) => {
    if (!data.warned) {
      data.warned = true;
      console.warn(`Captured building view ${requestKey} unavailable; using the procedural Town Center fallback.`, error);
    }
  });
}

export function disposeCapturedBuildingSprite(sprite) {
  const data = sprite?.userData?.capturedBuildingArt;
  if (!data) return;
  data.disposed = true;
  data.requestVersion++;
}
