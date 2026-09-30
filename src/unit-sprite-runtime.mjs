const UNIT_ROLES = Object.freeze(['worker', 'infantry', 'archer']);
const CAST_ROLES = Object.freeze(['human', 'orc', 'elf', 'troll']);
const DIRECTIONS = Object.freeze([
  'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west',
]);
const SPRITE_ROOT = '/assets/units';
const SPRITE_GROUND_LIFT = 0.018;

export function spriteActionClip(clipByKey, state, direction, cargoType, role, approximateDirections = false) {
  const gatherState = state === 'gather' && ['food', 'wood'].includes(cargoType)
      ? `gather-${cargoType}` : state;
  // First-pass roster: reuse the nearest authored action instead of idle holds.
  // Keep this opt-in so other art lanes retain their exact-direction behavior.
  if (approximateDirections && state !== 'idle') {
    const states = [gatherState, state, ...(state === 'repair' ? ['build'] : [])];
    for (const action of new Set(states)) {
      const authored = DIRECTIONS.map((heading, index) => ({
        clip: clipByKey.get(`${action}|${heading}`), index,
      })).filter(({ clip }) => clip?.sequence?.some(({ frameId }) => !frameId.startsWith('idle-')));
      if (authored.length) {
        const index = Math.max(0, DIRECTIONS.indexOf(direction));
        const distance = (candidate) => Math.min(Math.abs(candidate - index), 8 - Math.abs(candidate - index));
        authored.sort((a, b) => distance(a.index) - distance(b.index));
        return authored[0].clip;
      }
    }
  }
  return clipByKey.get(`${gatherState}|${direction}`)
      || clipByKey.get(`${state}|${direction}`)
      || (state === 'repair' ? clipByKey.get(`build|${direction}`) : null)
      || (['build', 'repair'].includes(state) && CAST_ROLES.includes(role)
        ? clipByKey.get(`gather|${direction}`) : null)
      || clipByKey.get(`idle|${direction}`);
}

export function civilizationSpriteRole(kind, civilization) {
  return civilization === 'boughward' ? `boughward-${kind}` : kind === 'worker' ? 'human' : kind;
}

export function spriteDirectory(role, version) {
  if (/^boughward-(worker|infantry|spearman|archer|scout|rider|siege-engine)$/.test(role) && version === 'v1') return `${role}-sprite-v1`;
  const supportedVersions = {
    worker: ['v1', 'v2', 'v3'],
    infantry: ['v1', 'v2', 'v3'],
    archer: ['v1', 'v2'],
    spearman: ['v1'],
    scout: ['v1'],
    rider: ['v1'],
    'siege-engine': ['v1'],
    human: ['v1', 'v2', 'v3'],
    orc: ['v1'],
    elf: ['v1'],
    troll: ['v1'],
  };
  if (!supportedVersions[role]?.includes(version)) {
    throw new Error(`Unsupported ${role} sprite version: ${version}`);
  }
  return `${CAST_ROLES.includes(role) ? "cast-" : ""}${role}-sprite-${version}`;
}

function atlasPath(role, version) {
  return `${SPRITE_ROOT}/${spriteDirectory(role, version)}/sprite-atlas-pack-v1.json`;
}

function loadJson(url) {
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
    return response.json();
  });
}

function loadTexture(THREE, loader, url, colorSpace) {
  return new Promise((resolve, reject) => {
    const texture = loader.load(url, resolve, undefined, reject);
    texture.flipY = false;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = colorSpace;
  });
}

function frameRectFor(frame, pageId, layerId) {
  const rectangle = frame.frameRectsPx?.find((item) => item.pageId === pageId && item.layerId === layerId);
  if (rectangle) return rectangle;
  if (frame.fallbackRectPx?.pageId === pageId) {
    return { layerId, pageId, rectPx: frame.fallbackRectPx.rectPx, offsetPx: { x: 0, y: 0 } };
  }
  return null;
}

function normalizedDirection(angle) {
  const circle = Math.PI * 2;
  const normalized = ((angle % circle) + circle) % circle;
  return DIRECTIONS[Math.round(normalized / (Math.PI / 4)) % DIRECTIONS.length];
}

function clipFrame(clip, elapsedMs) {
  if (!clip?.sequence?.length) return null;
  const totalMs = clip.sequence.reduce((sum, item) => sum + Math.max(1, item.durationMs || 1), 0);
  let elapsed = clip.loop ? ((elapsedMs % totalMs) + totalMs) % totalMs : Math.max(0, Math.min(elapsedMs, totalMs - 1));
  for (const item of clip.sequence) {
    const duration = Math.max(1, item.durationMs || 1);
    if (elapsed < duration) return item.frameId;
    elapsed -= duration;
  }
  return clip.sequence.at(-1).frameId;
}

export function activeState(unit, now, attackDurationMs = 900) {
  if (unit.hp <= 0 && unit.defeatStartedAt > 0) return 'defeat';
  if (unit.walking) return 'walk';
  if (unit.attackStartedAt > 0 && now - unit.attackStartedAt < attackDurationMs) return 'attack';
  if (unit.kind === 'worker') {
    if (unit.task === 'repairing') return 'repair';
    if (unit.task === 'building') return 'build';
    if (unit.task === 'gathering') return 'gather';
    return 'idle';
  }
  return unit.attackStartedAt > 0 && now - unit.attackStartedAt < attackDurationMs ? 'attack' : 'idle';
}

export function spriteAnimationTime(unit, state, now) {
  if (unit.spriteClockState !== state || !Number.isFinite(unit.spriteClockStartedAt)) {
    unit.spriteClockState = state;
    unit.spriteClockStartedAt = now;
  }
  if (state === 'attack') return Math.max(0, now - unit.attackStartedAt);
  if (state === 'defeat') return Math.max(0, now - unit.defeatStartedAt);
  return Math.max(0, now - unit.spriteClockStartedAt);
}

export function spriteClipDuration(clip) {
  return clip?.sequence?.reduce((sum, frame) => sum + Math.max(1, frame.durationMs || 1), 0) || 0;
}

function createSpriteMaterial(THREE, map, mask, teamColor, tintStrength = 1) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map,
    transparent: true,
    alphaTest: 0.035,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.unitTeamMask = { value: mask };
    shader.uniforms.unitTeamTint = { value: teamColor };
    shader.uniforms.unitTeamTintStrength = { value: tintStrength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 instanceAtlasRect;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = vec2(mix(instanceAtlasRect.x, instanceAtlasRect.z, uv.x),
                mix(instanceAtlasRect.y, instanceAtlasRect.w, uv.y));
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D unitTeamMask;\nuniform vec3 unitTeamTint;\nuniform float unitTeamTintStrength;')
      .replace('#include <map_fragment>', `#include <map_fragment>
float unitAccent = texture2D(unitTeamMask, vMapUv).r;
float unitLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
float unitTintLuma = max(dot(unitTeamTint, vec3(0.2126, 0.7152, 0.0722)), 0.001);
vec3 unitTintedColor = min(unitTeamTint * (unitLuma / unitTintLuma), vec3(1.0));
diffuseColor.rgb = mix(diffuseColor.rgb, unitTintedColor, unitAccent * unitTeamTintStrength);`);
  };
  material.customProgramCacheKey = () => 'unit-sprite-atlas-mask-v1';
  return material;
}

function makeTextureUrl(role, version, file) {
  return `${SPRITE_ROOT}/${spriteDirectory(role, version)}/${file}`;
}

function loadRolePack(THREE, loader, role, version) {
  return loadJson(atlasPath(role, version)).then(async (pack) => {
    const asset = pack.assets?.find((candidate) => candidate.id === role && candidate.kind === 'unit');
    if (!asset) throw new Error(`Sprite pack ${role} has no unit asset`);
    const page = pack.pages?.find((candidate) => candidate.id === asset.frames?.[0]?.fallbackRectPx?.pageId)
      || pack.pages?.[0];
    const colorFile = pack.files?.find((file) => file.id === page?.runtimeFileId);
    const maskFile = pack.files?.find((file) => file.id === page?.maskFileId);
    if (!page || !colorFile || !maskFile) throw new Error(`Sprite pack ${role} has incomplete page files`);
    const [map, mask] = await Promise.all([
      loadTexture(THREE, loader, makeTextureUrl(role, version, colorFile.path), THREE.SRGBColorSpace),
      loadTexture(THREE, loader, makeTextureUrl(role, version, maskFile.path), THREE.NoColorSpace),
    ]);
    const frameById = new Map(asset.frames.map((frame) => [frame.id, frame]));
    const clipByKey = new Map(asset.clips.map((clip) => [`${clip.stateId}|${clip.directionId}`, clip]));
    const durationByState = new Map();
    for (const clip of asset.clips) durationByState.set(clip.stateId, Math.max(durationByState.get(clip.stateId) || 0, spriteClipDuration(clip)));
    const layerId = asset.layers?.find((layer) => layer.drawLayer === 'actor')?.id || 'actor';
    const maxAlphaHeight = Math.max(1, ...asset.frames.map((frame) => frame.alphaBoundsPx?.height || frame.canvasPx.height));
    return {
      role, version, asset, page, map, mask, frameById, clipByKey, layerId, durationByState,
      worldPerPixel: asset.heightWorld / maxAlphaHeight,
    };
  });
}

// Shift toward the camera without moving the sprite on screen. A camera-facing
// quad can dip through terrain when an animated foot extends below its root.
export function spriteGroundDepthBias(alphaBounds, pivot, scale, cameraUpY, towardCameraY) {
  const belowRoot = Math.max(0, alphaBounds.y + alphaBounds.height - pivot.y);
  return towardCameraY > 0.001 ? belowRoot * scale * Math.max(0, cameraUpY) / towardCameraY : 0;
}

export function castRoleForUnit(unit) {
  return unit.kind === 'worker' ? CAST_ROLES[unit.slot % CAST_ROLES.length] : unit.kind;
}

export function createUnitSpriteRuntime({
  THREE, scene, capacity, teamHex, cameraQuaternion, roles = UNIT_ROLES, roleSpriteVersions = {},
  castPreview = false, humanAppearancePreview = false, approximateActionDirections = false, teamCivilizations = null,
}) {
  const loader = new THREE.TextureLoader();
  const pendingCounts = [0, 0];
  const batchesByTeam = [new Map(), new Map()];
  const rolePacks = new Map();
  const dummy = new THREE.Object3D();
  const localCenter = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  const towardCamera = new THREE.Vector3();
  let visible = false;
  let ready = false;

  function setCount(team, count) {
    pendingCounts[team] = count;
    for (const batch of batchesByTeam[team].values()) batch.mesh.count = count;
  }

  function setVisible(nextVisible) {
    visible = Boolean(nextVisible);
    for (const teamBatches of batchesByTeam) {
      for (const batch of teamBatches.values()) batch.mesh.visible = visible && ready;
    }
  }

  function markTeamDirty(team) {
    for (const batch of batchesByTeam[team].values()) {
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.rectAttribute.needsUpdate = true;
    }
  }

  function durationMs(role, state) {
    const pack = rolePacks.get(role);
    if (!pack) return 0;
    return pack.durationByState.get(state) || 0;
  }

  function roleForUnit(unit) {
    if (teamCivilizations) return civilizationSpriteRole(unit.kind, teamCivilizations[unit.team]);
    return humanAppearancePreview && unit.kind === 'worker' ? 'human' : castPreview ? castRoleForUnit(unit) : unit.kind;
  }

  function update(unit, now, visibleScale) {
    if (!ready) return;
    const role = roleForUnit(unit);
    const selectedPack = rolePacks.get(role);
    const teamBatches = batchesByTeam[unit.team];
    if (!selectedPack || !teamBatches) return;
    const state = activeState(unit, now, durationMs(role, 'attack') || 900);
    const direction = normalizedDirection(unit.angle || 0);
    const clip = spriteActionClip(selectedPack.clipByKey, state, direction, unit.cargoType, role, approximateActionDirections);
    const frameId = clipFrame(clip, spriteAnimationTime(unit, state, now));
    const frame = selectedPack.frameById.get(frameId);
    const crop = frame && frameRectFor(frame, selectedPack.page.id, selectedPack.layerId);
    const rect = crop?.rectPx;
    const currentBatch = teamBatches.get(role);

    if (!frame || !crop || !rect || visibleScale <= 0) {
      currentBatch.setHidden(unit.slot);
      return;
    }

    if (!unit.spriteInitialized || unit.spriteRole !== role) {
      for (const [otherRole, otherBatch] of teamBatches) {
        if (otherRole !== role) otherBatch.setHidden(unit.slot);
      }
      unit.spriteInitialized = true;
      unit.spriteRole = role;
    }

    const inset = selectedPack.page.sampling?.uvInsetPx ?? 0.5;
    const pageWidth = selectedPack.page.dimensionsPx.width;
    const pageHeight = selectedPack.page.dimensionsPx.height;
    const uvOffset = crop.offsetPx || { x: 0, y: 0 };
    currentBatch.writeRect(unit.slot,
      (rect.x + inset) / pageWidth,
      (rect.y + rect.height - inset) / pageHeight,
      (rect.x + rect.width - inset) / pageWidth,
      (rect.y + inset) / pageHeight,
    );

    const scale = selectedPack.worldPerPixel * visibleScale;
    localCenter.set(
      (uvOffset.x + rect.width / 2 - frame.groundPivotPx.x) * scale,
      (frame.groundPivotPx.y - uvOffset.y - rect.height / 2) * scale,
      0,
    ).applyQuaternion(cameraQuaternion);
    dummy.position.set(unit.renderX, SPRITE_GROUND_LIFT, unit.renderZ).add(localCenter);
    cameraUp.set(0, 1, 0).applyQuaternion(cameraQuaternion);
    towardCamera.set(0, 0, 1).applyQuaternion(cameraQuaternion);
    if (frame.alphaBoundsPx) {
      dummy.position.addScaledVector(towardCamera, spriteGroundDepthBias(
        frame.alphaBoundsPx, frame.groundPivotPx, scale, cameraUp.y, towardCamera.y,
      ));
    }
    dummy.quaternion.copy(cameraQuaternion);
    dummy.scale.set(rect.width * scale, rect.height * scale, 1);
    dummy.updateMatrix();
    currentBatch.mesh.setMatrixAt(unit.slot, dummy.matrix);
  }

  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const readyPromise = Promise.all(roles.map((role) => loadRolePack(
    THREE, loader, role, roleSpriteVersions[role] || 'v1',
  )))
    .then((packs) => {
      for (const pack of packs) rolePacks.set(pack.role, pack);
      const teamColors = teamHex.map((value) => new THREE.Color(value));

      for (const pack of packs) {
        for (let team = 0; team < 2; team++) {
          const geometry = new THREE.PlaneGeometry(1, 1);
          const rectAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
          geometry.setAttribute('instanceAtlasRect', rectAttribute);
          const material = createSpriteMaterial(THREE, pack.map, pack.mask, teamColors[team], CAST_ROLES.includes(pack.role) ? 0.2 : 1);
          const mesh = new THREE.InstancedMesh(geometry, material, capacity);
          mesh.count = pendingCounts[team];
          mesh.visible = false;
          mesh.frustumCulled = false;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.renderOrder = 1.1;
          for (let slot = 0; slot < capacity; slot++) mesh.setMatrixAt(slot, zeroMatrix);
          mesh.instanceMatrix.needsUpdate = true;
          scene.add(mesh);
          batchesByTeam[team].set(pack.role, {
            mesh,
            rectAttribute,
            writeRect(slot, x0, yBottom, x1, yTop) {
              const offset = slot * 4;
              rectAttribute.array[offset] = x0;
              rectAttribute.array[offset + 1] = yBottom;
              rectAttribute.array[offset + 2] = x1;
              rectAttribute.array[offset + 3] = yTop;
            },
            setHidden(slot) { mesh.setMatrixAt(slot, zeroMatrix); },
          });
        }
      }
      ready = true;
      setVisible(visible);
      return true;
    })
    .catch((error) => {
      console.warn('Unit sprite atlases unavailable; keeping current unit renderer.', error);
      return false;
    });

  return {
    ready: readyPromise,
    setCount,
    setVisible,
    markTeamDirty,
    durationMs,
    roleForUnit,
    update,
  };
}
