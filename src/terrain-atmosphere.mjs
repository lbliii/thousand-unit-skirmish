import * as THREE from 'three';
import { terrainHeightField } from './terrain-height.mjs';
import { buildTerrainBlendMasks } from './terrain-blend.mjs';

const DAMP_GROUNDS = new Set(['tidal-mud', 'lunar-soil', 'jungle-loam']);

export function groundMistEnabled(definition, mode = null) {
  if (mode === 'clear') return false;
  if (mode === 'mist') return true;
  return ['jungle-loam', 'lunar-soil'].includes(definition.terrainBase)
    && definition.id !== 'meshy-resource-review';
}

export function groundMistProfile(definition) {
  if (definition.terrainBase === 'lunar-soil') return { tint: [0.78, 0.76, 0.85], opacity: 0.09, pocketSize: 11 };
  if (definition.terrainBase === 'jungle-loam') return { tint: [0.62, 0.75, 0.68], opacity: 0.07, pocketSize: 8 };
  return { tint: [0.72, 0.79, 0.80], opacity: 0.12, pocketSize: 9 };
}

export function buildGroundMistMask(definition) {
  const patches = [];
  const raisedWater = [];
  if (DAMP_GROUNDS.has(definition.terrainBase)) {
    patches.push({ column: 0, row: 0, width: definition.width, height: definition.height, material: 'wet' });
  }
  for (const patch of definition.terrainPatches || []) {
    patches.push({ ...patch, material: DAMP_GROUNDS.has(patch.material) ? 'wet' : 'dry' });
  }
  for (const obstacle of definition.obstacles || []) {
    if (obstacle.material !== 'water') continue;
    patches.push({ ...obstacle, material: 'wet' });
    const field = terrainHeightField(definition);
    if (field.raised) for (let row = obstacle.row; row < obstacle.row + obstacle.height; row++) {
      for (let column = obstacle.column; column < obstacle.column + obstacle.width; column++) {
        if (field.corners(column, row).some(h => h > 0)) {
          patches.push({ column, row, width: 1, height: 1, material: 'dry' });
          raisedWater.push([column, row]);
        }
      }
    }
  }
  const mask = buildTerrainBlendMasks({ ...definition, terrainPatches: patches }, ['dry', 'wet'], 'dry')[0] || null;
  // Soft terrain joins can bleed a little haze back into excluded water cells.
  if (mask) for (const [column, row] of raisedWater) {
    for (let y = row * 2; y < row * 2 + 2; y++) for (let x = column * 2; x < column * 2 + 2; x++) {
      mask.pixels.fill(0, (y * mask.width + x) * 4, (y * mask.width + x) * 4 + 4);
    }
  }
  return mask;
}

export function createGroundMistStudy(definition, fixedTime = null, terrainGeometry = null) {
  const mask = buildGroundMistMask(definition);
  if (!mask) return null;
  const coverage = new THREE.DataTexture(mask.pixels, mask.width, mask.height, THREE.RGBAFormat);
  coverage.magFilter = THREE.LinearFilter;
  coverage.minFilter = THREE.LinearFilter;
  coverage.needsUpdate = true;
  const profile = groundMistProfile(definition);
  const seed = Math.trunc(definition.terrainSeed || 0) >>> 0;
  const uniforms = {
    tint: { value: new THREE.Color(...profile.tint) },
    opacity: { value: profile.opacity },
    pocketSize: { value: profile.pocketSize },
    seedOffset: { value: new THREE.Vector2((seed % 997) * 0.37, (Math.floor(seed / 997) % 991) * 0.41) },
    coverage: { value: coverage },
    time: { value: 0 },
    mapSize: { value: new THREE.Vector2(definition.width, definition.height) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec2 mistUv;
      void main() {
        mistUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D coverage;
      uniform float time;
      uniform vec2 mapSize;
      uniform vec3 tint;
      uniform float opacity;
      uniform float pocketSize;
      uniform vec2 seedOffset;
      varying vec2 mistUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float softField(vec2 p) {
        vec2 cell = floor(p), t = fract(p);
        t = t * t * (3.0 - 2.0 * t);
        return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), t.x),
          mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), t.x), t.y);
      }
      void main() {
        // The rotated plane maps its UV y opposite to ground-mask row order.
        float wet = texture2D(coverage, vec2(mistUv.x, 1.0 - mistUv.y)).g;
        vec2 ground = mistUv * mapSize;
        float drift = softField(ground / pocketSize + seedOffset + vec2(time * 0.018, time * 0.007));
        float pockets = smoothstep(0.35, 0.78, drift);
        float alpha = wet * pockets * opacity;
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(tint, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const geometry = terrainGeometry ? terrainGeometry.clone() : new THREE.PlaneGeometry(definition.width, definition.height);
  if (terrainGeometry) {
    const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) uv.setXY(i,
      (positions.getX(i) + definition.width / 2) / definition.width,
      1 - (positions.getZ(i) + definition.height / 2) / definition.height);
    geometry.deleteAttribute('color');
  } else geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = terrainGeometry ? 0.065 : 0.04;
  // Draw the ground haze before transparent props and team sprites.
  mesh.renderOrder = -1;
  mesh.userData.groundMistProfile = profile;
  mesh.userData.ownedGroundTextures = [coverage];
  mesh.onBeforeRender = () => {
    uniforms.time.value = fixedTime ?? performance.now() / 1000;
  };
  return mesh;
}
