import * as THREE from 'three';

const ROOT = './assets/environment/frontier-cliff-pilot-v1/runtime/';

// Review-only impostor. Frames share a 5-unit window and a ground anchor at (320,376).
// The source renderer encodes camera distance into two bytes, without sRGB conversion.
export function createEnvironmentPilot() {
  const loader = new THREE.TextureLoader();
  const colors = [], depths = [], meshes = [];
  for (let i = 0; i < 8; i++) {
    const suffix = String(i).padStart(2, '0');
    const color = loader.load(`${ROOT}cliff-color-${suffix}.webp`);
    color.colorSpace = THREE.SRGBColorSpace;
    const depth = loader.load(`${ROOT}cliff-depth-${suffix}.png`);
    depth.colorSpace = THREE.NoColorSpace;
    depth.minFilter = depth.magFilter = THREE.NearestFilter;
    depth.generateMipmaps = false;
    colors.push(color);
    depths.push(depth);
  }
  let viewIndex = 1;
  function create(x, z) {
    const geometry = new THREE.PlaneGeometry(5, 5);
    geometry.translate(0, 0.4375, 0);
    const uniforms = {
      pilotDepth: { value: depths[viewIndex] },
      pilotNear: { value: 0.1 }, pilotFar: { value: 300 },
    };
    const material = new THREE.MeshBasicMaterial({
      map: colors[viewIndex], alphaTest: 0.5, transparent: false, toneMapped: false,
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'varying float pilotAnchorDistance;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\npilotAnchorDistance = -(modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;');
      shader.fragmentShader = `uniform sampler2D pilotDepth;
        uniform float pilotNear;
        uniform float pilotFar;
        varying float pilotAnchorDistance;\n` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
        #include <alphatest_fragment>
        vec4 packedDepth = texture2D(pilotDepth, vMapUv);
        if (packedDepth.a < 0.99) discard;
        float capturedDistance = dot(packedDepth.rg, vec2(65280.0, 255.0)) / 65535.0 * 12.0 + 8.0;
        float sceneDistance = pilotAnchorDistance + capturedDistance - 14.0;
        gl_FragDepth = (sceneDistance - pilotNear) / (pilotFar - pilotNear);
      `);
    };
    material.customProgramCacheKey = () => 'frontier-cliff-depth-v1';
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0, z);
    mesh.userData.artReviewSection = 'environment';
    mesh.userData.pilotUniforms = uniforms;
    mesh.frustumCulled = false;
    meshes.push(mesh);
    return mesh;
  }
  function update(camera, yawIndex) {
    viewIndex = (yawIndex + 1) % 8;
    for (const mesh of meshes) {
      mesh.quaternion.copy(camera.quaternion);
      mesh.material.map = colors[viewIndex];
      mesh.userData.pilotUniforms.pilotDepth.value = depths[viewIndex];
      mesh.userData.pilotUniforms.pilotNear.value = camera.near;
      mesh.userData.pilotUniforms.pilotFar.value = camera.far;
    }
  }
  function dispose() {
    for (const texture of [...colors, ...depths]) texture.dispose();
    meshes.length = 0;
  }
  return { create, update, dispose };
}
