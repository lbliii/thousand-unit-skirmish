import { TERRAIN_MATERIALS, forestGroundForBase } from './terrain-materials.mjs';
import * as THREE from 'three';
import { RESOURCE_VISUAL_STAGES, resourceVisualStage } from './resource-visual-state.mjs';
import { createGroundMistStudy } from './terrain-atmosphere.mjs';
import { applyTerrainTextureSampling } from './terrain-texture-sampling.mjs';
import { buildTerrainBlendMasks, buildForestGroundMask } from './terrain-blend.mjs';
import { buildWaterSurfaceGeometry } from './water-surface-geometry.mjs';

const meshyResourcesEnabled = new URLSearchParams(globalThis.location?.search ?? '').get('meshyResources') !== '0';

const ASSET_ROOT = './assets/environment/frontier-v1/';
const INTERACTIVE_ASSET_ROOT = './assets/environment/frontier-interactive-v1/';
const GROUND_RENDER_ORDER = -20;
export { TERRAIN_MATERIALS } from './terrain-materials.mjs';
const spriteNames = [
  'pine', 'silver-birch', 'field-maple', 'hazel-thicket',
  'bellweather-field-maple', 'bellweather-hedgerow',
  'bellweather-field-maple-worked', 'bellweather-field-maple-low', 'bellweather-field-maple-depleted',
  'veyrholds-highpine', 'veyrholds-ironlichen-outcrop',
  'underbough-copperleaf', 'underbough-bramble',
  'sereward-palm', 'sereward-acacia', 'sereward-scrub',
  'ellionar-cultivated-palm', 'ellionar-garden-hedge',
  'rock-outcrop', 'basalt-ridge', 'cliff', 'seamstone',
  'rock-boulder-cluster', 'basalt-ridge-cap', 'cliff-end-cap',
];
const textureLoader = new THREE.TextureLoader();
const spriteMaterials = new Map();
const constructionTextures = new Map();
const constructionMaterials = new Map();
const constructionInstances = new Map();

function loadSprite(url) {
  const texture = textureLoader.load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

// Decorative families load when a map uses them; resource-state fallbacks stay eager.
const sprites = {};
sprites.oak = loadSprite(`${ASSET_ROOT}oak.webp`);
sprites.berries = loadSprite(`${ASSET_ROOT}berries.webp`);
if (meshyResourcesEnabled) {
  for (const family of ['oak', 'pine', 'berries']) {
    sprites[family] = loadSprite(`./assets/environment/frontier-meshy-sprites-v1/${family}/runtime/${family}-01.webp`);
  }
}
for (const family of ['oak', 'berries']) {
  for (const stage of RESOURCE_VISUAL_STAGES) sprites[`${family}-${stage}`] = sprites[family];
}

const REQUIRED_RESOURCE_STATE_FILES = Object.freeze([
  ...['oak', 'berries'].flatMap((family) => RESOURCE_VISUAL_STAGES.map((stage) => `${family}-${stage}.webp`)),
  'construction-earthwork.webp', 'construction-foundation.webp',
]);
export let RESOURCE_STATE_ASSETS_AVAILABLE = false;
export let RESOURCE_STATE_ASSET_STATUS = {
  ready: false,
  state: 'loading',
  packId: 'environment.frontier-interactive',
  packVersion: null,
  loadedFiles: [],
  reason: 'manifest loading',
};

function textureMaterials(registry, key) {
  let materials = registry.get(key);
  if (!materials) {
    materials = new Set();
    registry.set(key, materials);
  }
  return materials;
}

function registerTextureMaterial(registry, key, material) {
  const materials = textureMaterials(registry, key);
  materials.add(material);
  material.addEventListener('dispose', () => materials.delete(material));
}

function updateSpriteTexture(name, texture) {
  sprites[name] = texture;
  for (const material of spriteMaterials.get(name) || []) {
    material.map = texture;
    material.needsUpdate = true;
  }
}

async function fetchVerifiedRuntimeImage(path, entry) {
  if (!entry || entry.role !== 'runtime-image'
    || !Number.isInteger(entry.dimensionsPx?.width) || entry.dimensionsPx.width <= 0
    || !Number.isInteger(entry.dimensionsPx?.height) || entry.dimensionsPx.height <= 0
    || !/^[a-f0-9]{64}$/i.test(entry.sha256 || '')) {
    throw new Error(`Interactive environment manifest has an invalid runtime entry for ${path}`);
  }
  const response = await fetch(`${INTERACTIVE_ASSET_ROOT}${path}`, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable for runtime asset verification');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actualSha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  if (actualSha256 !== entry.sha256.toLowerCase()) {
    throw new Error(`${path} SHA-256 differs from its manifest entry`);
  }
  const texture = await new Promise((resolve, reject) => {
    textureLoader.load(`${INTERACTIVE_ASSET_ROOT}${path}`, resolve, undefined, reject);
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const image = texture.image;
  const dimensions = {
    width: image?.naturalWidth || image?.width || 0,
    height: image?.naturalHeight || image?.height || 0,
  };
  if (dimensions.width !== entry.dimensionsPx.width || dimensions.height !== entry.dimensionsPx.height) {
    texture.dispose();
    throw new Error(`${path} decoded as ${dimensions.width}x${dimensions.height}; manifest declares `
      + `${entry.dimensionsPx.width}x${entry.dimensionsPx.height}`);
  }
  return { texture, dimensions, sha256: actualSha256 };
}

async function loadResourceStateAssets() {
  const loaded = new Map();
  const loadedFiles = [];
  try {
    const response = await fetch(`${INTERACTIVE_ASSET_ROOT}manifest.json`, { cache: 'force-cache' });
    if (!response.ok) {
      RESOURCE_STATE_ASSET_STATUS = {
        ...RESOURCE_STATE_ASSET_STATUS, state: 'unavailable',
        reason: `Interactive environment manifest returned HTTP ${response.status}`,
      };
      return RESOURCE_STATE_ASSET_STATUS;
    }
    const manifest = await response.json();
    if (manifest.schemaVersion !== 1 || manifest.packId !== 'environment.frontier-interactive'
      || !Array.isArray(manifest.files)) {
      throw new Error('Interactive environment manifest has an unsupported schema or pack ID');
    }
    const runtimeFiles = manifest.files.filter((entry) => entry?.role === 'runtime-image');
    const runtimeByPath = new Map(runtimeFiles.map((entry) => [entry.path, entry]));
    if (runtimeFiles.length !== REQUIRED_RESOURCE_STATE_FILES.length
      || runtimeByPath.size !== REQUIRED_RESOURCE_STATE_FILES.length
      || REQUIRED_RESOURCE_STATE_FILES.some((path) => !runtimeByPath.has(path))) {
      throw new Error('Interactive environment manifest must list exactly the ten required runtime images');
    }
    RESOURCE_STATE_ASSET_STATUS = {
      ...RESOURCE_STATE_ASSET_STATUS, packVersion: manifest.packVersion || null,
    };
    for (const path of REQUIRED_RESOURCE_STATE_FILES) {
      const result = await fetchVerifiedRuntimeImage(path, runtimeByPath.get(path));
      loaded.set(path, result.texture);
      loadedFiles.push({ path, sha256: result.sha256, dimensionsPx: result.dimensions });
    }

    for (const family of ['oak', 'berries']) {
      for (const stage of RESOURCE_VISUAL_STAGES) {
        const name = `${family}-${stage}`;
        const texture = meshyResourcesEnabled && stage === 'full' ? sprites[family] : loaded.get(`${name}.webp`);
        updateSpriteTexture(name, texture);
      }
    }
    for (const stage of ['earthwork', 'foundation']) {
      const texture = loaded.get(`construction-${stage}.webp`);
      constructionTextures.set(stage, texture);
      for (const material of constructionMaterials.get(stage) || []) {
        material.map = texture;
        material.color.setHex(0xffffff);
        material.opacity = 1;
        material.alphaTest = 0.04;
        material.needsUpdate = true;
      }
      for (const mesh of constructionInstances.get(stage) || []) {
        if (mesh.geometry.type === 'RingGeometry') {
          mesh.geometry.dispose();
          mesh.geometry = new THREE.PlaneGeometry(3, 3);
        }
      }
    }
    RESOURCE_STATE_ASSETS_AVAILABLE = true;
    RESOURCE_STATE_ASSET_STATUS = {
      ready: true,
      state: 'ready',
      packId: manifest.packId,
      packVersion: manifest.packVersion,
      loadedFiles,
      reason: null,
    };
  } catch (error) {
    for (const texture of loaded.values()) texture.dispose();
    RESOURCE_STATE_ASSET_STATUS = {
      ...RESOURCE_STATE_ASSET_STATUS,
      ready: false,
      state: 'load-failed',
      loadedFiles,
      reason: error?.message || String(error),
    };
  }
  return RESOURCE_STATE_ASSET_STATUS;
}

export const resourceStateAssetsReady = loadResourceStateAssets();

const grounds = new Map();
function groundTexture(name) {
  if (grounds.has(name)) return grounds.get(name);
  const texture = textureLoader.load(`${ASSET_ROOT}${name}.webp?v=vaelora-ground-v1`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.anisotropy = 4;
  grounds.set(name, texture);
  return texture;
}

const cameraFacing = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0.78, 1.12, 0.78).normalize(),
);
const instanceDummy = new THREE.Object3D();
const spriteUpAxis = new THREE.Vector3(0, 1, 0);
const spriteYawRotation = new THREE.Quaternion();
const constructionGroundRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

export function environmentTheme(definition) {
  return TERRAIN_MATERIALS.includes(definition.terrainBase)
    ? definition.terrainBase : definition.id === 'cinder-ridge' ? 'cinder' : 'meadow';
}

function addGroundQuad(buffer, definition, x0, z0, x1, z1, y, alpha = [1, 1, 1, 1]) {
  const first = buffer.vertices.length / 3;
  for (const [x, z, opacity] of [
    [x0, z0, alpha[0]], [x1, z0, alpha[1]],
    [x0, z1, alpha[2]], [x1, z1, alpha[3]],
  ]) {
    buffer.vertices.push(x, y, z);
    // Every region samples the same world-space texture coordinates.
    buffer.uvs.push((x + definition.width / 2) / 12, (z + definition.height / 2) / 12);
    buffer.colors.push(1, 1, 1, opacity);
  }
  buffer.indices.push(first, first + 3, first + 1, first, first + 2, first + 3);
}

function finishGroundGeometry(buffer) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffer.uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffer.colors, 4));
  geometry.setIndex(buffer.indices);
  geometry.computeVertexNormals();
  return geometry;
}

function groundBuffer() {
  return { vertices: [], uvs: [], colors: [], indices: [] };
}

export function createGroundSurfaces(definition) {
  const base = environmentTheme(definition);
  const stochastic = new URLSearchParams(globalThis.location?.search ?? '').get('terrainTiling') !== 'mirror';
  const groundMaterial = options => applyTerrainTextureSampling(
    new THREE.MeshBasicMaterial(options), definition.terrainSeed || 0, stochastic);
  const baseBuffer = groundBuffer();
  addGroundQuad(baseBuffer, definition,
    -definition.width / 2, -definition.height / 2,
    definition.width / 2, definition.height / 2, -0.025);
  const meshes = [new THREE.Mesh(
    finishGroundGeometry(baseBuffer),
    groundMaterial({ map: groundTexture(base), color: 0xd2d4bd }),
  )];
  const waterGeometry = buildWaterSurfaceGeometry(definition);
  if (waterGeometry) {
    const water = new THREE.Mesh(waterGeometry, new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));
    water.renderOrder = 5;
    meshes.push(water);
  }
  function blendSurface(mask, y, renderOrder) {
    const buffer = groundBuffer();
    addGroundQuad(buffer, definition, -definition.width / 2, -definition.height / 2,
      definition.width / 2, definition.height / 2, y);
    const geometry = finishGroundGeometry(buffer);
    // Ground repeats in world units; the independent blend mask spans the map.
    const uv = geometry.getAttribute('uv');
    for (let vertex = 0; vertex < uv.count; vertex++) {
      uv.setXY(vertex, uv.getX(vertex) * 12 / definition.width,
        uv.getY(vertex) * 12 / definition.height);
    }
    const texture = groundTexture(mask.material).clone();
    texture.repeat.set(definition.width / 12, definition.height / 12);
    const alphaMap = new THREE.DataTexture(mask.pixels, mask.width, mask.height, THREE.RGBAFormat);
    alphaMap.magFilter = THREE.LinearFilter;
    alphaMap.minFilter = THREE.LinearMipmapLinearFilter;
    alphaMap.generateMipmaps = true;
    alphaMap.needsUpdate = true;
    const mesh = new THREE.Mesh(geometry, groundMaterial({
      map: texture, alphaMap, color: 0xd2d4bd,
      transparent: true, depthWrite: false,
    }));
    mesh.userData.ownedGroundTextures = [texture, alphaMap];
    mesh.renderOrder = renderOrder;
    return mesh;
  }
  for (const [layer, mask] of buildTerrainBlendMasks(definition, TERRAIN_MATERIALS, base).entries()) {
    meshes.push(blendSurface(mask, -0.019, GROUND_RENDER_ORDER + layer));
  }
  const forestMask = buildForestGroundMask(definition, forestGroundForBase(base));
  if (forestMask) {
    meshes.push(blendSurface(forestMask, -0.012,
      GROUND_RENDER_ORDER + TERRAIN_MATERIALS.length));
  }
  const atmosphere = new URLSearchParams(globalThis.location?.search ?? '');
  if (atmosphere.get('terrainAtmosphere') === 'mist') {
    const timeValue = atmosphere.get('terrainAtmosphereTime');
    const fixedTime = timeValue !== null && Number.isFinite(Number(timeValue)) ? Number(timeValue) : null;
    const mist = createGroundMistStudy(definition, fixedTime);
    if (mist) meshes.push(mist);
  }
  return meshes;
}

function spriteGeometry(width, height, name) {
  if (meshyResourcesEnabled && ['oak', 'pine', 'berries', 'oak-full', 'berries-full'].includes(name)) {
    // Preserve 128 px/world-unit and the baked (320,480) ground pivot.
    const geometry = new THREE.PlaneGeometry(5, 5, 1, 4);
    geometry.translate(0, 1.25, 0);
    const positions = geometry.attributes.position;
    const slope = Math.hypot(0.78, 0.78) / 1.12;
    for (let i = 0; i < positions.count; i++) {
      positions.setZ(i, -Math.min(0, positions.getY(i)) * slope);
    }
    positions.needsUpdate = true;
    return geometry;
  }
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.translate(0, height / 2, 0);
  return geometry;
}

function spriteMaterial(name) {
  if (!sprites[name]) {
    if (!spriteNames.includes(name)) throw new Error(`Unknown environment sprite: ${name}`);
    sprites[name] = loadSprite(`${ASSET_ROOT}${name}.webp`);
  }
  const material = new THREE.MeshBasicMaterial({
    map: sprites[name],
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.08,
    depthWrite: true,
    toneMapped: false,
  });
  registerTextureMaterial(spriteMaterials, name, material);
  return material;
}

export function createEnvironmentSprite(name, width, height, x, z) {
  const mesh = new THREE.Mesh(spriteGeometry(width, height, name), spriteMaterial(name));
  mesh.quaternion.copy(cameraFacing);
  mesh.position.set(x, 0, z);
  return mesh;
}

export function createConstructionGroundInstances(stage, capacity) {
  const texture = constructionTextures.get(stage) || null;
  if (!['earthwork', 'foundation'].includes(stage) || !Number.isInteger(capacity) || capacity <= 0) return null;
  const mesh = new THREE.InstancedMesh(
    texture || stage === 'foundation'
      ? new THREE.PlaneGeometry(3, 3) : new THREE.RingGeometry(1.55, 1.92, 28),
    new THREE.MeshBasicMaterial({
      map: texture,
      color: texture ? 0xffffff : stage === 'earthwork' ? 0x72583b : 0x8c8170,
      transparent: true,
      alphaTest: texture ? 0.04 : 0,
      opacity: texture ? 1 : stage === 'earthwork' ? 0.52 : 0.42,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }),
    capacity,
  );
  registerTextureMaterial(constructionMaterials, stage, mesh.material);
  textureMaterials(constructionInstances, stage).add(mesh);
  mesh.count = 0;
  mesh.visible = false;
  mesh.renderOrder = 8;
  mesh.frustumCulled = false;
  return mesh;
}

export function updateConstructionGroundInstances(mesh, positions) {
  if (!mesh || positions.length > mesh.instanceMatrix.count) return false;
  for (let index = 0; index < positions.length; index++) {
    const point = positions[index];
    instanceDummy.position.set(point.x, 0.002, point.z);
    instanceDummy.quaternion.copy(constructionGroundRotation);
    instanceDummy.scale.setScalar(1);
    instanceDummy.updateMatrix();
    mesh.setMatrixAt(index, instanceDummy.matrix);
  }
  mesh.count = positions.length;
  mesh.visible = positions.length > 0;
  mesh.instanceMatrix.needsUpdate = true;
  return true;
}

export function createEnvironmentSpriteInstances(name, width, height, positions) {
  if (positions.length === 0) return null;
  const mesh = new THREE.InstancedMesh(
    spriteGeometry(width, height, name), spriteMaterial(name), positions.length,
  );
  for (let index = 0; index < positions.length; index++) {
    const point = positions[index];
    setEnvironmentSpriteInstance(mesh, index, point.x, point.z,
      point.scale ?? 1, point.flip ?? false, point.yaw ?? 0);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

export function setEnvironmentSpriteInstance(mesh, index, x, z, scale, flip = false, yaw = 0) {
  instanceDummy.position.set(x, 0, z);
  instanceDummy.quaternion.copy(cameraFacing);
  if (yaw) {
    spriteYawRotation.setFromAxisAngle(spriteUpAxis, yaw);
    instanceDummy.quaternion.multiply(spriteYawRotation);
  }
  instanceDummy.scale.set(flip ? -scale : scale, scale, scale);
  instanceDummy.updateMatrix();
  mesh.setMatrixAt(index, instanceDummy.matrix);
}

// Matches the authoritative six wood per forest cell in server.mjs.
// Hidden cells retain their last received stock; callers must not infer new stock.
export function setForestSpriteStock(slot, stock = 6) {
  const stage = resourceVisualStage(stock, 6);
  if (slot.stateMeshes) {
    for (const [key, mesh] of Object.entries(slot.stateMeshes)) {
      setEnvironmentSpriteInstance(mesh, slot.index, slot.x, slot.z,
        key === stage ? slot.scale : 0, slot.flip, slot.yaw);
      mesh.instanceMatrix.needsUpdate = true;
    }
  } else {
    setEnvironmentSpriteInstance(slot.mesh, slot.index, slot.x, slot.z,
      stock <= 0 ? 0 : slot.scale, slot.flip, slot.yaw);
    slot.mesh.instanceMatrix.needsUpdate = true;
  }
  return stage;
}

function variation(index) {
  const value = Math.sin(index * 127.1 + 17.7) * 43758.5453;
  return value - Math.floor(value);
}

export function addObstacleEnvironmentSprites(definition, halfX, halfZ, addObject) {
  const forestTreeSlots = new Map();
  // A small warm-field palette extension; other regions retain their existing trees.
  const bellweather = ['meadow', 'short-grass', 'long-grass', 'dry-grass']
    .includes(environmentTheme(definition));
  const veyrholds = environmentTheme(definition) === 'scree'
    && definition.id !== 'meshy-resource-review';
  const underbough = environmentTheme(definition) === 'forest-floor'
    && definition.id !== 'meshy-resource-review';
  const sereward = environmentTheme(definition) === 'sand'
    && definition.id !== 'meshy-resource-review';
  const ellionar = environmentTheme(definition) === 'garden-loam'
    && definition.id !== 'meshy-resource-review';
  const pineName = ellionar ? 'ellionar-cultivated-palm' : sereward ? 'sereward-palm' : veyrholds ? 'veyrholds-highpine' : 'pine';
  const mapleName = sereward ? 'sereward-acacia' : underbough ? 'underbough-copperleaf'
    : bellweather ? 'bellweather-field-maple' : 'field-maple';
  const thicketName = ellionar ? 'ellionar-garden-hedge' : sereward ? 'sereward-scrub' : underbough ? 'underbough-bramble'
    : bellweather ? 'bellweather-hedgerow' : 'hazel-thicket';
  const pines = [];
  const oaks = [];
  const birches = [];
  const maples = [];
  const hazelThickets = [];
  const outcrops = [];
  const boulderClusters = [];
  const ridges = [];
  const ridgeCaps = [];
  const cliffs = [];
  const cliffCaps = [];
  for (const obstacle of definition.obstacles) {
    for (let row = obstacle.row; row < obstacle.row + obstacle.height; row++) {
      for (let column = obstacle.column; column < obstacle.column + obstacle.width; column++) {
        const index = row * definition.width + column;
        const x = column - halfX + 0.5;
        const z = row - halfZ + 0.5;
        if (obstacle.material === 'forest') {
          const treeType = variation(index + 7);
          const scaleVariation = variation(index + 31);
          const point = {
            cell: index,
            x: x + (variation(index) - 0.5) * 0.28,
            z: z + (variation(index + 19) - 0.5) * 0.28,
            flip: variation(index + 43) < 0.5,
            yaw: (variation(index + 53) - 0.5) * 0.3,
          };
          if (meshyResourcesEnabled && definition.id === 'meshy-resource-review') {
            point.scale = 0.72 + scaleVariation * 0.32;
            point.yaw = 0;
            (treeType < 0.45 ? oaks : pines).push(point);
            continue;
          }
          if (ellionar) {
            point.scale = treeType < 0.8
              ? 0.76 + scaleVariation * 0.2 : 0.62 + scaleVariation * 0.24;
            (treeType < 0.8 ? pines : hazelThickets).push(point);
            continue;
          }
          if (sereward) {
            if (treeType < 0.55) {
              point.scale = 0.76 + scaleVariation * 0.2;
              pines.push(point);
            } else if (treeType < 0.85) {
              point.scale = 0.68 + scaleVariation * 0.3;
              maples.push(point);
            } else {
              point.scale = 0.62 + scaleVariation * 0.24;
              hazelThickets.push(point);
            }
            continue;
          }
          if (underbough) {
            // Rooted canopy and woody bramble form one coherent woodland mix.
            point.scale = treeType < 0.8
              ? 0.68 + scaleVariation * 0.3 : 0.62 + scaleVariation * 0.24;
            (treeType < 0.8 ? maples : hazelThickets).push(point);
            continue;
          }
          if (treeType < 0.2) {
            point.scale = 0.76 + scaleVariation * 0.2;
            oaks.push(point);
          } else if (treeType < 0.4) {
            point.scale = 0.76 + scaleVariation * 0.2;
            pines.push(point);
          } else if (treeType < 0.6) {
            point.scale = 0.68 + scaleVariation * 0.3;
            birches.push(point);
          } else if (treeType < 0.8) {
            point.scale = 0.68 + scaleVariation * 0.3;
            maples.push(point);
          } else {
            point.scale = 0.62 + scaleVariation * 0.24;
            hazelThickets.push(point);
          }
        } else if (obstacle.material === 'stone') {
          const vertical = obstacle.height >= obstacle.width;
          const centerLine = vertical
            ? column === obstacle.column + Math.floor(obstacle.width / 2)
            : row === obstacle.row + Math.floor(obstacle.height / 2);
          const along = vertical ? row - obstacle.row : column - obstacle.column;
          const barrierLength = vertical ? obstacle.height : obstacle.width;
          const atBarrierEnd = along === 0 || along === barrierLength - 1;
          if (centerLine && (along % 2 === 0 || atBarrierEnd)) {
            const point = {
              x, z,
              scale: 0.88 + variation(index + 13) * 0.24,
              flip: variation(index + 41) < 0.5,
            };
            if ((obstacle.elevation ?? 1.12) < 1) {
              if (variation(index + 59) < 0.5) {
                boulderClusters.push({
                  ...point,
                  scale: 0.82 + variation(index + 61) * 0.3,
                });
              } else outcrops.push(point);
            } else if ((obstacle.elevation ?? 1.12) >= 1.75) {
              if (atBarrierEnd) {
                cliffCaps.push({
                  ...point,
                  scale: 0.92 + variation(index + 73) * 0.16,
                  flip: along === 0,
                });
              } else cliffs.push(point);
            } else if (atBarrierEnd) {
              ridgeCaps.push({
                ...point,
                scale: 0.88 + variation(index + 71) * 0.22,
                flip: along === 0,
              });
            } else ridges.push(point);
          }
        }
      }
    }
  }
  for (const [name, width, height, points] of [
    [pineName, ellionar || sereward || veyrholds ? 2.7 : 2.25, ellionar || sereward ? 3.8 : 3.4, pines],
    ['oak', 3.05, 2.86, oaks],
    ['silver-birch', 2.3, 3.45, birches],
    [mapleName, sereward ? 3.5 : 3.05, sereward ? 2.85 : 3.25, maples],
    [thicketName, ellionar ? 2.8 : sereward ? 2.6 : 3.1, ellionar ? 1.8 : sereward ? 1.7 : 2.07, hazelThickets],
    [veyrholds ? 'veyrholds-ironlichen-outcrop' : 'rock-outcrop', 3.5, 2.2, outcrops],
    ['rock-boulder-cluster', 2.7, 1.8, boulderClusters],
    ['basalt-ridge', 3.6, 3.05, ridges],
    ['basalt-ridge-cap', 3.4, 2.25, ridgeCaps],
    ['cliff', 4.2, 4.6, cliffs],
    ['cliff-end-cap', 4.2, 4.6, cliffCaps],
  ]) {
    const mesh = createEnvironmentSpriteInstances(name, width, height, points);
    if (!mesh) continue;
    let stateMeshes;
    if (name === 'bellweather-field-maple') {
      stateMeshes = { full: mesh };
      for (const stage of ['worked', 'low', 'depleted']) {
        const stateMesh = createEnvironmentSpriteInstances(`${name}-${stage}`, width, height,
          points.map((point) => ({ ...point, scale: 0 })));
        stateMeshes[stage] = stateMesh;
        addObject(stateMesh);
      }
    }
    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      if (!Number.isInteger(point.cell)) continue;
      forestTreeSlots.set(point.cell, { mesh, index, ...point, family: name, stateMeshes });
    }
    addObject(mesh);
  }
  return forestTreeSlots;
}
