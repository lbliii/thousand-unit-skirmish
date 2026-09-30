import * as THREE from 'three';
import { buildTerrainBlendMasks } from './terrain-blend.mjs';

const DAMP_GROUNDS = new Set(['tidal-mud', 'lunar-soil', 'jungle-loam']);

export function buildGroundMistMask(definition) {
  const patches = [];
  if (DAMP_GROUNDS.has(definition.terrainBase)) {
    patches.push({ column: 0, row: 0, width: definition.width, height: definition.height, material: 'wet' });
  }
  for (const patch of definition.terrainPatches || []) {
    patches.push({ ...patch, material: DAMP_GROUNDS.has(patch.material) ? 'wet' : 'dry' });
  }
  for (const obstacle of definition.obstacles || []) {
    if (obstacle.material === 'water') patches.push({ ...obstacle, material: 'wet' });
  }
  return buildTerrainBlendMasks({ ...definition, terrainPatches: patches }, ['dry', 'wet'], 'dry')[0] || null;
}

export function createGroundMistStudy(definition, fixedTime = null) {
  const mask = buildGroundMistMask(definition);
  if (!mask) return null;
  const coverage = new THREE.DataTexture(mask.pixels, mask.width, mask.height, THREE.RGBAFormat);
  coverage.magFilter = THREE.LinearFilter;
  coverage.minFilter = THREE.LinearFilter;
  coverage.needsUpdate = true;
  const uniforms = {
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
        float drift = softField(ground / 9.0 + vec2(time * 0.018, time * 0.007));
        float pockets = smoothstep(0.35, 0.78, drift);
        float alpha = wet * pockets * 0.16;
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(vec3(0.72, 0.79, 0.80), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const geometry = new THREE.PlaneGeometry(definition.width, definition.height);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.04;
  // Draw the ground haze before transparent props and team sprites.
  mesh.renderOrder = -1;
  mesh.userData.ownedGroundTextures = [coverage];
  mesh.onBeforeRender = () => {
    uniforms.time.value = fixedTime ?? performance.now() / 1000;
  };
  return mesh;
}
