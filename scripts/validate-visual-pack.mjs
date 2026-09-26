#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const schemaPath = fileURLToPath(new URL('../schemas/renderer-asset-pack-v1.schema.json', import.meta.url));
const requiredUnitKeys = [
  'unit.humanoid-core',
  'unit.team-accent',
  'unit.worker.backpack',
  'unit.worker.tool',
  'unit.infantry.shield',
  'unit.infantry.spear',
  'unit.archer.bow',
  'unit.archer.quiver',
];
const expectedStages = {
  full: { min: 67, max: 100 },
  worked: { min: 34, max: 66 },
  low: { min: 1, max: 33 },
  depleted: { min: 0, max: 0 },
};
const MAX_PACK_TEXTURE_MEMORY_BYTES = 96 * 1024 * 1024;
const errors = [];
const fileRecords = new Map();
const imageInfo = new Map();
const modelJson = new Map();
let packRoot = '';
let manifestPath = '';
let manifest;

function report(message) {
  errors.push(message);
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameDimensions(left, right) {
  return Boolean(left && right && left.width === right.width && left.height === right.height);
}

function sameAspectRatio(left, right) {
  if (!left || !right || left.height <= 0 || right.height <= 0) return false;
  const leftRatio = left.width / left.height;
  const rightRatio = right.width / right.height;
  return Math.abs(leftRatio - rightRatio) <= Math.max(leftRatio, rightRatio) * 0.01;
}

function sameWorldSize(left, right) {
  return Boolean(left && right && left.width === right.width && left.height === right.height);
}

function matchesType(value, expected) {
  const types = Array.isArray(expected) ? expected : [expected];
  return types.some((type) => {
    if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    if (type === 'array') return Array.isArray(value);
    if (type === 'integer') return Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'null') return value === null;
    return typeof value === type;
  });
}

function checkSchema(value, schema, rootSchema, label = '$') {
  const issues = [];
  if (schema.$ref) {
    const target = schema.$ref.slice('#/$defs/'.length);
    return checkSchema(value, rootSchema.$defs[target], rootSchema, label);
  }
  if (schema.oneOf) {
    const validBranches = schema.oneOf.filter((branch) => checkSchema(value, branch, rootSchema, label).length === 0);
    if (validBranches.length !== 1) issues.push(label + ' must match exactly one schema variant');
  }
  if (schema.type && !matchesType(value, schema.type)) {
    issues.push(label + ' must be ' + (Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type));
    return issues;
  }
  if (Object.hasOwn(schema, 'const') && !jsonEqual(value, schema.const)) {
    issues.push(label + ' must equal ' + JSON.stringify(schema.const));
  }
  if (schema.enum && !schema.enum.some((entry) => jsonEqual(value, entry))) {
    issues.push(label + ' must be one of ' + schema.enum.join(', '));
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) issues.push(label + ' is too short');
    if (schema.maxLength !== undefined && value.length > schema.maxLength) issues.push(label + ' is too long');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) issues.push(label + ' has an invalid format');
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) issues.push(label + ' is below its minimum');
    if (schema.maximum !== undefined && value > schema.maximum) issues.push(label + ' exceeds its maximum');
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) issues.push(label + ' must be greater than ' + schema.exclusiveMinimum);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) issues.push(label + ' has too few items');
    if (schema.maxItems !== undefined && value.length > schema.maxItems) issues.push(label + ' has too many items');
    if (schema.uniqueItems) {
      const normalized = value.map((entry) => JSON.stringify(entry));
      if (new Set(normalized).size !== normalized.length) issues.push(label + ' contains duplicate items');
    }
    if (schema.prefixItems) {
      schema.prefixItems.forEach((itemSchema, index) => {
        if (index < value.length) issues.push(...checkSchema(value[index], itemSchema, rootSchema, label + '[' + index + ']'));
      });
    }
    if (schema.items) {
      value.forEach((entry, index) => {
        if (!schema.prefixItems || index >= schema.prefixItems.length) {
          issues.push(...checkSchema(entry, schema.items, rootSchema, label + '[' + index + ']'));
        }
      });
    }
    if (schema.contains && !value.some((entry) => checkSchema(entry, schema.contains, rootSchema, label).length === 0)) {
      issues.push(label + ' is missing a required item');
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) issues.push(label + '.' + required + ' is required');
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, key)) issues.push(...checkSchema(value[key], childSchema, rootSchema, label + '.' + key));
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(label + '.' + key + ' is not allowed');
    }
  }
  return issues;
}

function safePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) return null;
  const resolved = path.resolve(packRoot, relativePath);
  if (resolved !== packRoot && !resolved.startsWith(packRoot + path.sep)) return null;
  return resolved;
}

async function resolvePackFile(relativePath, label) {
  const resolved = safePath(relativePath);
  if (!resolved) {
    report(label + ' path escapes its pack directory: ' + relativePath);
    return null;
  }
  let actualPath;
  try {
    actualPath = await realpath(resolved);
  } catch {
    report('missing pack file: ' + relativePath);
    return null;
  }
  if (actualPath !== packRoot && !actualPath.startsWith(packRoot + path.sep)) {
    report(label + ' symlink escapes its pack directory: ' + relativePath);
    return null;
  }
  return actualPath;
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const kind = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + size > buffer.length) return null;
    if (kind === 'VP8X' && size >= 10) {
      return {
        width: 1 + buffer.readUIntLE(data + 4, 3),
        height: 1 + buffer.readUIntLE(data + 7, 3),
      };
    }
    if (kind === 'VP8L' && size >= 5 && buffer[data] === 0x2f) {
      const b1 = buffer[data + 1];
      const b2 = buffer[data + 2];
      const b3 = buffer[data + 3];
      const b4 = buffer[data + 4];
      return {
        width: 1 + b1 + ((b2 & 0x3f) << 8),
        height: 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
      };
    }
    if (kind === 'VP8 ' && size >= 10
      && buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
      return {
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff,
      };
    }
    offset = data + size + (size % 2);
  }
  return null;
}

function imageDimensions(buffer, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return pngDimensions(buffer);
  if (ext === '.webp') return webpDimensions(buffer);
  return null;
}

function parseGlb(buffer, filePath) {
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF'
    || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) {
    report(filePath + ' is not a valid glTF 2.0 binary');
    return null;
  }
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > buffer.length) break;
    if (type === 0x4e4f534a) {
      try {
        return JSON.parse(buffer.toString('utf8', start, start + length).replace(/\0+$/g, '').trim());
      } catch {
        report(filePath + ' has invalid glTF JSON');
        return null;
      }
    }
    offset = start + length;
  }
  report(filePath + ' is missing its glTF JSON chunk');
  return null;
}

function parseVector(value, fallback) {
  return Array.isArray(value) && value.length === 3 ? value : fallback;
}

function nodeLocalMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return node.matrix;
  const t = parseVector(node.translation, [0, 0, 0]);
  const s = parseVector(node.scale, [1, 1, 1]);
  const q = Array.isArray(node.rotation) && node.rotation.length === 4 ? node.rotation : [0, 0, 0, 1];
  const [x, y, z, w] = q;
  return [
    (1 - 2 * y * y - 2 * z * z) * s[0], (2 * x * y + 2 * w * z) * s[0], (2 * x * z - 2 * w * y) * s[0], 0,
    (2 * x * y - 2 * w * z) * s[1], (1 - 2 * x * x - 2 * z * z) * s[1], (2 * y * z + 2 * w * x) * s[1], 0,
    (2 * x * z + 2 * w * y) * s[2], (2 * y * z - 2 * w * x) * s[2], (1 - 2 * x * x - 2 * y * y) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function multiplyMatrix(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    }
  }
  return out;
}

function transformPoint(matrix, point) {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

function glbGeometryInfo(model, label) {
  const nodes = model.nodes || [];
  const meshes = model.meshes || [];
  const accessors = model.accessors || [];
  const namedNodes = new Map();
  const nodeMatrices = new Map();
  const nodeDimensions = new Map();
  const childIndices = new Set();
  nodes.forEach((node, index) => {
    if (node.name) {
      if (namedNodes.has(node.name)) report(label + ' has duplicate node name ' + node.name);
      namedNodes.set(node.name, index);
    }
    for (const child of node.children || []) childIndices.add(child);
  });
  const scene = model.scenes?.[model.scene ?? 0];
  const roots = scene?.nodes || nodes.map((_, index) => index).filter((index) => !childIndices.has(index));
  const boundsMin = [Infinity, Infinity, Infinity];
  const boundsMax = [-Infinity, -Infinity, -Infinity];
  const visited = new Set();
  function visit(index, parentMatrix) {
    if (!nodes[index] || visited.has(index)) return;
    visited.add(index);
    const node = nodes[index];
    const world = multiplyMatrix(parentMatrix, nodeLocalMatrix(node));
    nodeMatrices.set(index, world);
    if (Number.isInteger(node.mesh)) {
      const nodeMin = [Infinity, Infinity, Infinity];
      const nodeMax = [-Infinity, -Infinity, -Infinity];
      for (const primitive of meshes[node.mesh]?.primitives || []) {
        const accessor = accessors[primitive.attributes?.POSITION];
        if (!accessor?.min || !accessor?.max) {
          report(label + ' mesh node ' + (node.name || index) + ' has no POSITION bounds');
          continue;
        }
        for (const x of [accessor.min[0], accessor.max[0]]) {
          for (const y of [accessor.min[1], accessor.max[1]]) {
            for (const z of [accessor.min[2], accessor.max[2]]) {
              const point = transformPoint(world, [x, y, z]);
              for (let axis = 0; axis < 3; axis++) {
                boundsMin[axis] = Math.min(boundsMin[axis], point[axis]);
                boundsMax[axis] = Math.max(boundsMax[axis], point[axis]);
                nodeMin[axis] = Math.min(nodeMin[axis], point[axis]);
                nodeMax[axis] = Math.max(nodeMax[axis], point[axis]);
              }
            }
          }
        }
      }
      if (node.name && nodeMin.every(Number.isFinite)) {
        nodeDimensions.set(node.name, nodeMax.map((value, axis) => value - nodeMin[axis]));
      }
    }
    for (const child of node.children || []) visit(child, world);
  }
  roots.forEach((index) => visit(index, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
  if (visited.size < nodes.length) {
    nodes.forEach((_, index) => {
      if (!visited.has(index)) visit(index, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    });
  }
  const dimensions = boundsMin.every(Number.isFinite)
    ? boundsMax.map((value, axis) => value - boundsMin[axis]) : null;
  return { namedNodes, nodeMatrices, nodeDimensions, meshes, dimensions, boundsMin };
}

function near(left, right, tolerance) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

async function loadModel(filePath) {
  if (modelJson.has(filePath)) return modelJson.get(filePath);
  const record = findFile(filePath, 'model', 'model');
  if (!record || record.role !== 'model') return null;
  const resolved = await resolvePackFile(filePath, 'model');
  if (!resolved) return null;
  try {
    const buffer = await readFile(resolved);
    const json = parseGlb(buffer, filePath);
    if (json) {
      if ((json.skins || []).length > 0) report(filePath + ' uses skinning; v1 accepts rigid part geometry only');
      if ((json.images || []).length > 0 || (json.textures || []).length > 0) {
        report(filePath + ' embeds textures; v1 object packs use flat-color/vertex-color materials');
      }
      const info = glbGeometryInfo(json, filePath);
      modelJson.set(filePath, { json, info });
      return modelJson.get(filePath);
    }
  } catch {
    report('cannot read model file ' + filePath);
  }
  return null;
}

function findFile(pathValue, role, label) {
  const record = fileRecords.get(pathValue);
  if (!record) report(label + ' references missing file ' + pathValue);
  else if (role && record.role !== role) report(label + ' expects file role ' + role + ': ' + pathValue);
  return record;
}

function anchorById(asset, id) {
  return (asset.anchors || []).find((anchor) => anchor.id === id);
}

async function validateObjectPack() {
  if (manifest.packKind !== 'character-building') return;
  const registry = manifest.unitBatchRegistry || [];
  const keys = registry.map((entry) => entry.batchKey);
  if (!jsonEqual(keys, requiredUnitKeys)) {
    report('unitBatchRegistry must list the eight agreed batch keys in canonical order');
  }
  if (new Set(keys).size !== keys.length) report('unitBatchRegistry contains duplicate batch keys');
  const active = new Map(registry.filter((entry) => entry.status === 'active').map((entry) => [entry.batchKey, entry]));
  const requiredActive = requiredUnitKeys.slice(0, 4);
  for (const key of requiredActive) if (active.get(key)?.status !== 'active') report(key + ' must be active');
  for (const key of requiredUnitKeys.slice(4)) {
    if (registry.find((entry) => entry.batchKey === key)?.status !== 'reserved') report(key + ' must remain reserved in this sample pack');
  }

  const unitAssets = manifest.assets.filter((asset) => asset.kind === 'unit');
  const buildings = manifest.assets.filter((asset) => asset.kind === 'building');
  if (unitAssets.length !== 1 || unitAssets[0]?.id !== 'worker') report('v1 object sample must contain exactly the Worker unit');
  if (buildings.length !== 1 || buildings[0]?.id !== 'barracks') report('v1 object sample must contain exactly the Barracks building');
  const keyReferences = new Map();
  let buildingCalls = 0;

  for (const asset of [...unitAssets, ...buildings]) {
    findFile(asset.modelFile, 'model', asset.id);
    const loaded = await loadModel(asset.modelFile);
    if (!loaded) continue;
    const { json, info } = loaded;
    const partNames = new Set();
    const teamVariantGroups = new Map();
    const teamVariantCallCounts = new Map([['azure', 0], ['ember', 0]]);
    let sharedBuildingCalls = 0;
    for (const part of asset.parts || []) {
      const modelFile = part.modelFile || asset.modelFile;
      const source = await loadModel(modelFile);
      if (!source) continue;
      const nodeIndex = source.info.namedNodes.get(part.node);
      if (nodeIndex === undefined) report(asset.id + ' part node not found in ' + modelFile + ': ' + part.node);
      if (partNames.has(part.id)) report(asset.id + ' has duplicate part id ' + part.id);
      partNames.add(part.id);
      if (asset.kind === 'unit') {
        if (part.teamVariant) report(asset.id + ' unit parts cannot declare teamVariant');
        const registration = active.get(part.batchKey);
        if (!registration) report(asset.id + ' references an inactive unit batch key ' + part.batchKey);
        else if (registration.modelFile !== modelFile || registration.node !== part.node) {
          report(part.batchKey + ' does not resolve to its registered model file and node');
        }
        const previous = keyReferences.get(part.batchKey);
        const current = modelFile + '#' + part.node;
        if (previous && previous !== current) report(part.batchKey + ' maps to incompatible source geometry');
        keyReferences.set(part.batchKey, current);
      } else if (part.teamVariant) {
        if (part.paletteSlot !== 'team-accent') {
          report(asset.id + ' teamVariant parts must use the team-accent palette slot');
        }
        const { group, team } = part.teamVariant;
        if (!teamVariantGroups.has(group)) teamVariantGroups.set(group, new Set());
        const teams = teamVariantGroups.get(group);
        if (teams.has(team)) report(asset.id + ' teamVariant group ' + group + ' has duplicate ' + team + ' parts');
        teams.add(team);
        if (teamVariantCallCounts.has(team)) {
          teamVariantCallCounts.set(team, teamVariantCallCounts.get(team) + 1);
        }
        if (asset.id === 'barracks' && group === 'standard') {
          const expectedId = 'standard-' + team;
          const expectedNode = 'barracks.standard.' + team;
          if (part.id !== expectedId || part.node !== expectedNode) {
            report('Barracks standard variants must use ids standard-azure/standard-ember and nodes barracks.standard.azure/barracks.standard.ember');
          }
        }
      } else {
        sharedBuildingCalls++;
      }
      const node = source.json.nodes[nodeIndex];
      if (node && Number.isInteger(node.mesh)) {
        const primitiveNames = (source.info.meshes[node.mesh]?.primitives || []).map((primitive) => {
          const material = source.json.materials?.[primitive.material];
          return String(material?.name || '');
        });
        const requiredPrefix = part.paletteSlot === 'team-accent' ? 'team-accent' : 'neutral';
        if (primitiveNames.length && primitiveNames.some((name) => !name.startsWith(requiredPrefix))) {
          report(asset.id + ' part ' + part.id + ' must use ' + requiredPrefix + ' materials');
        }
      }
    }
    for (const [group, teams] of teamVariantGroups) {
      if (teams.size !== 2 || !teams.has('azure') || !teams.has('ember')) {
        report(asset.id + ' teamVariant group ' + group + ' must include exactly one Azure and one Ember part');
      }
    }
    if (asset.kind === 'building') {
      const activeVariantCalls = Math.max(...teamVariantCallCounts.values());
      buildingCalls = Math.max(buildingCalls, sharedBuildingCalls + activeVariantCalls);
    }
    for (const anchor of asset.anchors || []) {
      const nodeIndex = info.namedNodes.get(anchor.node);
      if (nodeIndex === undefined) report(asset.id + ' anchor node not found: ' + anchor.node);
      else if (anchor.id === asset.groundAnchor) {
        const matrix = info.nodeMatrices.get(nodeIndex);
        if (!matrix) report(asset.id + ' ground anchor is not reachable from the GLB scene');
        else {
          const origin = !near(matrix[12], 0, 0.01) || !near(matrix[13], 0, 0.01) || !near(matrix[14], 0, 0.01);
          const rotated = !near(matrix[0], 1, 0.01) || !near(matrix[1], 0, 0.01) || !near(matrix[2], 0, 0.01)
            || !near(matrix[4], 0, 0.01) || !near(matrix[5], 1, 0.01) || !near(matrix[6], 0, 0.01)
            || !near(matrix[8], 0, 0.01) || !near(matrix[9], 0, 0.01) || !near(matrix[10], 1, 0.01);
          if (origin) report(asset.id + ' ground anchor must be at the model origin');
          if (rotated) report(asset.id + ' ground anchor must use the canonical axis orientation');
        }
      }
    }
    const requiredAnchors = asset.kind === 'unit'
      ? ['ground', 'foot', 'headPivot', 'toolGrip']
      : ['ground', 'gate', 'standard', 'rallyPoint', 'productionCue'];
    for (const anchorId of requiredAnchors) if (!anchorById(asset, anchorId)) report(asset.id + ' is missing anchor ' + anchorId);

    const actual = info.dimensions;
    const declared = asset.boundsWorld;
    if (!actual) report(asset.id + ' model has no measurable mesh bounds');
    else if (declared && (!near(actual[0], declared.width, 0.12)
      || !near(actual[1], declared.height, 0.12) || !near(actual[2], declared.depth, 0.12))) {
      report(asset.id + ' declared world bounds do not match GLB geometry bounds within 0.12 units');
    }
    if (asset.kind === 'unit' && (asset.bodyHeightWorld < 0.7 || asset.bodyHeightWorld > 0.9)) {
      report('Worker body height must be between 0.7 and 0.9 world units');
    }
    if (asset.kind === 'unit') {
      const corePart = (asset.parts || []).find((part) => part.batchKey === 'unit.humanoid-core');
      if (corePart) {
        const coreFile = await loadModel(corePart.modelFile || asset.modelFile);
        const coreBounds = coreFile?.info.nodeDimensions.get(corePart.node);
        if (!coreBounds || !near(coreBounds[1], asset.bodyHeightWorld, 0.12)) {
          report('Worker bodyHeightWorld must match the humanoid-core node height');
        }
      }
    }
    if (asset.kind === 'building' && (!near(asset.footprintWorld.width, 3, 0.01)
      || !near(asset.footprintWorld.depth, 3, 0.01))) {
      report('Barracks footprint must be 3 by 3 world units');
    }
    const sampleStates = new Set((asset.stateSamples || []).map((sample) => sample.state));
    const needed = asset.kind === 'unit' ? ['idle', 'build'] : ['construction-mid', 'complete'];
    for (const state of needed) if (!sampleStates.has(state)) report(asset.id + ' is missing state sample ' + state);
    for (const sample of asset.stateSamples || []) {
      if (sample.previewFile) findFile(sample.previewFile, 'review-image', asset.id + ' state sample');
    }
  }

  for (const entry of registry) {
    if (entry.status !== 'active') continue;
    findFile(entry.modelFile, 'model', entry.batchKey);
    const loaded = await loadModel(entry.modelFile);
    if (loaded && !loaded.info.namedNodes.has(entry.node)) report(entry.batchKey + ' registry node not found: ' + entry.node);
  }
  for (const key of active.keys()) if (!keyReferences.has(key)) report(key + ' is active but not used by the Worker sample');
  const bins = keyReferences.size;
  const teamBatches = bins * 2;
  const budget = manifest.budgets;
  if (budget.projectedUnitPartBins !== bins) report('projectedUnitPartBins does not match active unit batch keys');
  if (budget.projectedUnitTeamBatches !== teamBatches) report('projectedUnitTeamBatches must equal active unit bins times two teams');
  if (teamBatches > 16 || bins > 8) report('unit geometry exceeds the global 8-bin/16-team-batch budget');
  if (budget.projectedBuildingDrawCallsPerStructure !== buildingCalls) report('projectedBuildingDrawCallsPerStructure does not match Barracks parts');
  if (budget.projectedEnvironmentBatches !== 0) report('character/building pack must not add environment batches');
  if (budget.projectedAdditionalDrawCalls !== teamBatches) report('object-pack projectedAdditionalDrawCalls must equal unit team batches');
  if (budget.projectedAdditionalDrawCalls > budget.maxAdditionalDrawCalls) report('object-pack draw-call projection exceeds its declared budget');
  if (manifest.reviewBoard) {
    findFile(manifest.reviewBoard.file, 'review-image', 'reviewBoard');
    if (!jsonEqual([...manifest.reviewBoard.maps].sort(), ['cinder', 'meadow'])) report('reviewBoard must show meadow and cinder');
    if (!jsonEqual([...manifest.reviewBoard.teams].sort(), ['azure', 'ember'])) report('reviewBoard must show Azure and Ember');
  }
}

async function validateEnvironmentPack() {
  if (manifest.packKind !== 'environment') return;
  const resourceAssets = manifest.assets.filter((asset) => asset.kind === 'resource-sprite');
  const constructionAssets = manifest.assets.filter((asset) => asset.kind === 'construction-ground');
  if (resourceAssets.length !== 8) report('environment sample must contain wood and food at all four stock stages');
  if (constructionAssets.length !== 3) report('environment sample must contain clear, earthwork, and foundation construction states');
  const byFamily = new Map();
  for (const asset of resourceAssets) {
    const key = asset.resourceType + ':' + asset.stage;
    const expectedId = (asset.resourceType === 'wood' ? 'oak-' : 'berries-') + asset.stage;
    if (asset.id !== expectedId) report(key + ' must use asset id ' + expectedId);
    if (byFamily.has(key)) report('duplicate resource state ' + key);
    byFamily.set(key, asset);
    const expected = expectedStages[asset.stage];
    if (expected && (asset.stockPercent.min !== expected.min || asset.stockPercent.max !== expected.max)) {
      report(key + ' has an incorrect stock-percent band');
    }
    if (asset.pivot[0] !== 0.5 || asset.pivot[1] !== 1 || asset.cameraFacing !== true) {
      report(asset.id + ' must be camera-facing with a bottom-center pivot');
    }
    const sourceRecord = findFile(asset.sourceFile, 'source-image', asset.id);
    const runtimeRecord = findFile(asset.runtimeFile, 'runtime-image', asset.id);
    if (typeof asset.sourceFile !== 'string' || typeof asset.runtimeFile !== 'string'
      || !asset.sourceFile.endsWith('.png') || !asset.runtimeFile.endsWith('.webp')) {
      report(asset.id + ' must pair a PNG source with a WebP runtime image');
    }
    const sourceDimensions = imageInfo.get(asset.sourceFile);
    const runtimeDimensions = imageInfo.get(asset.runtimeFile);
    if (sourceRecord && runtimeRecord && sourceDimensions && runtimeDimensions
      && !sameAspectRatio(sourceDimensions, runtimeDimensions)) report(asset.id + ' PNG and WebP aspect ratios differ by more than 1%');
    if (runtimeDimensions && !sameDimensions(runtimeDimensions, asset.dimensionsPx)) report(asset.id + ' declared pixel dimensions do not match its runtime image');
    const stages = byFamily.get(asset.resourceType + ':dimensions') || [];
    stages.push(asset);
    byFamily.set(asset.resourceType + ':dimensions', stages);
  }
  for (const type of ['wood', 'food']) {
    for (const stage of Object.keys(expectedStages)) {
      if (!byFamily.has(type + ':' + stage)) report('missing ' + type + ' resource stage ' + stage);
    }
    const family = byFamily.get(type + ':dimensions') || [];
    if (family.length === 4) {
      const first = family[0];
      for (const asset of family.slice(1)) {
        if (!sameDimensions(asset.dimensionsPx, first.dimensionsPx)
          || !sameWorldSize(asset.worldSize, first.worldSize) || !jsonEqual(asset.pivot, first.pivot)) {
          report(type + ' stage variants must share pixel size, world size, and pivot');
        }
      }
    }
  }

  const expectedConstruction = {
    clear: { file: null, range: null },
    earthwork: { file: true, range: { min: 0, max: 0.4 } },
    foundation: { file: true, range: { min: 0.4, max: 1 } },
  };
  const constructionLayout = (asset) => {
    if (asset.cameraFacing === true && jsonEqual(asset.pivot, [0.5, 1.0])) return 'camera-facing';
    if (asset.cameraFacing === false && jsonEqual(asset.pivot, [0.5, 0.5])) return 'ground-oriented';
    return null;
  };
  const constructionKeys = new Set();
  for (const asset of constructionAssets) {
    if (constructionKeys.has(asset.stage)) report('duplicate construction stage ' + asset.stage);
    constructionKeys.add(asset.stage);
    const expected = expectedConstruction[asset.stage];
    if (!expected) continue;
    if (expected.file && (!asset.sourceFile || !asset.runtimeFile)) report(asset.stage + ' needs source and runtime images');
    if (!expected.file && (asset.sourceFile !== null || asset.runtimeFile !== null)) report('clear construction state must not have an image');
    if (!jsonEqual(asset.progressRange, expected.range)) report(asset.stage + ' has an incorrect progress range');
    if (asset.runtimeFile) {
      if (typeof asset.sourceFile !== 'string' || typeof asset.runtimeFile !== 'string'
        || !asset.sourceFile.endsWith('.png') || !asset.runtimeFile.endsWith('.webp')) {
        report(asset.id + ' must pair a PNG source with a WebP runtime image');
      }
      findFile(asset.sourceFile, 'source-image', asset.id);
      findFile(asset.runtimeFile, 'runtime-image', asset.id);
      const sourceDimensions = imageInfo.get(asset.sourceFile);
      const runtimeDimensions = imageInfo.get(asset.runtimeFile);
      if (sourceDimensions && runtimeDimensions && !sameAspectRatio(sourceDimensions, runtimeDimensions)) {
        report(asset.id + ' PNG and WebP aspect ratios differ by more than 1%');
      }
      if (runtimeDimensions && !sameDimensions(runtimeDimensions, asset.dimensionsPx)) {
        report(asset.id + ' declared pixel dimensions do not match its runtime image');
      }
      if (!constructionLayout(asset)) {
        report(asset.id + ' must pair camera-facing sprites with a bottom-center pivot or ground-oriented decals with a center pivot');
      }
    }
  }
  for (const stage of Object.keys(expectedConstruction)) if (!constructionKeys.has(stage)) report('missing construction state ' + stage);
  const visibleConstruction = constructionAssets.filter((asset) => asset.runtimeFile);
  const clearConstruction = constructionAssets.find((asset) => asset.stage === 'clear');
  if (visibleConstruction.length > 0 && clearConstruction
    && clearConstruction.cameraFacing !== visibleConstruction[0].cameraFacing) {
    report('clear construction state must match the camera-facing layout of visible construction states');
  }
  if (visibleConstruction.length === 2) {
    const [first, second] = visibleConstruction;
    if (!sameDimensions(first.dimensionsPx, second.dimensionsPx)
      || !sameWorldSize(first.worldSize, second.worldSize) || !jsonEqual(first.pivot, second.pivot)
      || first.cameraFacing !== second.cameraFacing || constructionLayout(first) !== constructionLayout(second)) {
      report('earthwork and foundation must share pixel size, world size, pivot, and orientation');
    }
  }

  const batches = new Set(manifest.assets.filter((asset) => asset.batchKey && (asset.runtimeFile || asset.kind === 'resource-sprite'))
    .map((asset) => asset.batchKey));
  const budget = manifest.budgets;
  if (budget.projectedUnitPartBins !== 0 || budget.projectedUnitTeamBatches !== 0) {
    report('environment pack must not declare unit batches');
  }
  if (budget.projectedEnvironmentBatches !== batches.size) report('projectedEnvironmentBatches does not match non-empty stage batches');
  if (batches.size > 10) report('environment pack exceeds the ten-stage-batch budget');
  if (budget.projectedAdditionalDrawCalls !== batches.size) report('environment projectedAdditionalDrawCalls must match stage batches');
  if (budget.projectedAdditionalDrawCalls > budget.maxAdditionalDrawCalls) report('environment draw-call projection exceeds its declared budget');
  if (budget.projectedBuildingDrawCallsPerStructure !== 0) report('environment pack must not add building draw calls');
}

async function main() {
  const input = process.argv[2];
  if (!input || input === '--help' || input === '-h') {
    console.log('Usage: node scripts/validate-visual-pack.mjs path/to/manifest.json');
    process.exitCode = input ? 0 : 2;
    return;
  }
  manifestPath = path.resolve(input);
  packRoot = await realpath(path.dirname(manifestPath));
  let schema;
  try {
    schema = JSON.parse(await readFile(schemaPath, 'utf8'));
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    console.error('Cannot read manifest or schema: ' + error.message);
    process.exitCode = 1;
    return;
  }
  const schemaIssues = checkSchema(manifest, schema, schema);
  if (schemaIssues.length) {
    console.error('Manifest does not match renderer-asset-pack v1:');
    for (const issue of schemaIssues) console.error(' - ' + issue);
    process.exitCode = 1;
    return;
  }
  const listedFiles = manifest.files || [];
  for (const entry of listedFiles) {
    if (fileRecords.has(entry.path)) report('duplicate file record: ' + entry.path);
    fileRecords.set(entry.path, entry);
    const actualPath = await resolvePackFile(entry.path, 'file');
    if (!actualPath) continue;
    try {
      const bytes = await readFile(actualPath);
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest.toLowerCase() !== entry.sha256.toLowerCase()) report('SHA-256 mismatch: ' + entry.path);
      if (entry.role === 'model') parseGlb(bytes, entry.path);
      if (entry.role === 'source-image' || entry.role === 'runtime-image' || entry.role === 'review-image') {
        const dims = imageDimensions(bytes, entry.path);
        if (!dims) report('cannot read PNG/WebP image dimensions: ' + entry.path);
        else {
          if (!entry.dimensionsPx) report('image file is missing declared dimensionsPx: ' + entry.path);
          imageInfo.set(entry.path, dims);
          if (entry.dimensionsPx && !jsonEqual(dims, entry.dimensionsPx)) report('declared file dimensions do not match: ' + entry.path);
        }
      }
    } catch {
      report('missing pack file: ' + entry.path);
    }
  }
  const uniqueRuntimeImages = new Set(listedFiles.filter((entry) => entry.role === 'runtime-image').map((entry) => entry.path));
  let textureMemoryBytes = 0;
  for (const imagePath of uniqueRuntimeImages) {
    const dims = imageInfo.get(imagePath);
    if (dims) textureMemoryBytes += Math.ceil(dims.width * dims.height * 4 * 4 / 3);
  }
  if (manifest.budgets && manifest.budgets.projectedTextureMemoryBytes !== textureMemoryBytes) {
    report('projectedTextureMemoryBytes does not match runtime WebP dimensions');
  }
  if (manifest.budgets && manifest.budgets.maxTextureMemoryBytes > MAX_PACK_TEXTURE_MEMORY_BYTES) {
    report('maxTextureMemoryBytes exceeds the agreed 96 MiB per-pack budget');
  }
  if (manifest.budgets && textureMemoryBytes > manifest.budgets.maxTextureMemoryBytes) {
    report('runtime texture-memory estimate exceeds its declared budget');
  }
  if (manifest.packKind === 'character-building') await validateObjectPack();
  if (manifest.packKind === 'environment') await validateEnvironmentPack();
  if (errors.length) {
    console.error('Visual pack validation failed for ' + manifest.packId + ':');
    for (const issue of [...new Set(errors)]) console.error(' - ' + issue);
    process.exitCode = 1;
    return;
  }
  console.log('Visual pack validation passed: ' + manifest.packId + ' ' + manifest.packVersion);
  console.log('Runtime texture estimate: ' + textureMemoryBytes + ' bytes');
  if (manifest.packKind === 'character-building') {
    console.log('Unit batches: ' + manifest.budgets.projectedUnitPartBins + ' geometry bins / '
      + manifest.budgets.projectedUnitTeamBatches + ' team batches; building draw calls per structure: '
      + manifest.budgets.projectedBuildingDrawCallsPerStructure);
  } else {
    console.log('Environment state batches: ' + manifest.budgets.projectedEnvironmentBatches);
  }
  console.log('Projected additional draw calls: ' + manifest.budgets.projectedAdditionalDrawCalls);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
