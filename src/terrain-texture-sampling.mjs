// Independent, seeded texture placements blended on a triangle lattice.
// This is a lightweight tiling prototype, not histogram-preserving synthesis.
const FUNCTIONS = /* glsl */`
#ifdef USE_MAP
uniform float vaeloraTerrainSeed;
vec2 vaeloraHash(vec2 p) {
  p += vaeloraTerrainSeed;
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
    dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
vec4 vaeloraPatch(sampler2D terrainMap, vec2 uv, vec2 anchor, vec2 dx, vec2 dy) {
  vec2 random = vaeloraHash(anchor);
  float angle = floor(random.x * 4.0) * 1.57079632679;
  mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  return textureGrad(terrainMap, rotation * uv + random * 7.0,
    rotation * dx, rotation * dy);
}
vec4 vaeloraGround(sampler2D terrainMap, vec2 uv, vec2 dx, vec2 dy) {
  vec2 skew = vec2(uv.x - uv.y * 0.57735026919, uv.y * 1.15470053838) * 1.4;
  vec2 cell = floor(skew), f = fract(skew);
  vec2 a, b, c;
  vec3 weights;
  if (f.x + f.y < 1.0) {
    a = cell; b = cell + vec2(1.0, 0.0); c = cell + vec2(0.0, 1.0);
    weights = vec3(1.0 - f.x - f.y, f.x, f.y);
  } else {
    a = cell + vec2(1.0); b = cell + vec2(0.0, 1.0); c = cell + vec2(1.0, 0.0);
    weights = vec3(f.x + f.y - 1.0, 1.0 - f.x, 1.0 - f.y);
  }
  // Narrow the overlap to keep the painted strokes from becoming a muddy blur.
  weights *= weights;
  weights /= dot(weights, vec3(1.0));
  vec4 result = vaeloraPatch(terrainMap, uv, a, dx, dy) * weights.x
    + vaeloraPatch(terrainMap, uv, b, dx, dy) * weights.y
    + vaeloraPatch(terrainMap, uv, c, dx, dy) * weights.z;
  // One broad, quiet value field, rather than stacking fractal detail noise.
  vec2 macroUv = uv / 4.5;
  vec2 macroCell = floor(macroUv), t = fract(macroUv);
  t = t * t * (3.0 - 2.0 * t);
  float macro = mix(mix(vaeloraHash(macroCell).x,
    vaeloraHash(macroCell + vec2(1.0, 0.0)).x, t.x),
    mix(vaeloraHash(macroCell + vec2(0.0, 1.0)).x,
    vaeloraHash(macroCell + vec2(1.0)).x, t.x), t.y);
  result.rgb *= mix(0.95, 1.05, macro);
  return result;
}
#endif
`;

export function applyTerrainTextureSampling(material, seed = 0, enabled = true) {
  if (!enabled) return material;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.vaeloraTerrainSeed = { value: (seed % 997) / 17 };
    shader.fragmentShader = FUNCTIONS + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', /* glsl */`
      #ifdef USE_MAP
        // Derivatives precede coverage discard so sparse paint edges retain
        // correct mip selection. Empty mask pixels skip all three ground reads.
        vec2 vaeloraDx = dFdx(vMapUv), vaeloraDy = dFdy(vMapUv);
      #endif
      #ifdef USE_ALPHAMAP
        float vaeloraPaintAlpha = texture2D(alphaMap, vAlphaMapUv).g;
        if (vaeloraPaintAlpha < 0.001) discard;
      #endif
      #ifdef USE_MAP
        diffuseColor *= vaeloraGround(map, vMapUv, vaeloraDx, vaeloraDy);
      #endif
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', `
      #ifdef USE_ALPHAMAP
        diffuseColor.a *= vaeloraPaintAlpha;
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'vaelora-stochastic-ground-v2';
  return material;
}
