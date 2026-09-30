#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
const [input, output] = process.argv.slice(2);
if (!input) throw new Error('Usage: node scripts/inspect-building-glb.mjs model.glb [report.json]');
const bytes = await readFile(input);
if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error('Expected GLB v2');
let document, binary;
for (let offset = 12; offset < bytes.length;) {
  const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
  const data = bytes.subarray(offset + 8, offset + 8 + length);
  if (type === 0x4e4f534a) document = JSON.parse(data.toString('utf8'));
  if (type === 0x004e4942) binary = data;
  offset += 8 + length;
}
if (!document || !binary) throw new Error('Missing GLB JSON/BIN chunks');
const instances = [];
function visit(index, parent = new THREE.Matrix4()) {
  const node = document.nodes[index];
  const local = node.matrix ? new THREE.Matrix4().fromArray(node.matrix) : new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(node.translation || [0, 0, 0]),
    new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
    new THREE.Vector3().fromArray(node.scale || [1, 1, 1]),
  );
  const matrix = parent.clone().multiply(local);
  if (node.mesh !== undefined) for (const primitive of document.meshes[node.mesh].primitives) {
    if (primitive.extensions || (primitive.mode !== undefined && primitive.mode !== 4)) throw new Error('Only uncompressed triangle primitives are supported');
    const accessor = document.accessors[primitive.attributes.POSITION];
    if (accessor.componentType !== 5126 || accessor.type !== 'VEC3' || accessor.sparse) throw new Error('Expected dense float VEC3 positions');
    const view = document.bufferViews[accessor.bufferView];
    if (view.buffer !== 0) throw new Error('External position buffers are unsupported');
    instances.push({ accessor, start: (view.byteOffset || 0) + (accessor.byteOffset || 0), stride: view.byteStride || 12, matrix,
      triangles: (primitive.indices === undefined ? accessor.count : document.accessors[primitive.indices].count) / 3 });
  }
  for (const child of node.children || []) visit(child, matrix);
}
for (const index of document.scenes[document.scene || 0].nodes) visit(index);
const point = new THREE.Vector3();
function vertices(callback) {
  for (const instance of instances) for (let index = 0; index < instance.accessor.count; index++) {
    const offset = instance.start + index * instance.stride;
    point.set(binary.readFloatLE(offset), binary.readFloatLE(offset + 4), binary.readFloatLE(offset + 8)).applyMatrix4(instance.matrix);
    callback(point);
  }
}
const bounds = new THREE.Box3(); vertices(point => bounds.expandByPoint(point));
const size = bounds.getSize(new THREE.Vector3());
const bands = [0.02, 0.05, 0.08, 0.1].map(fraction => ({ fraction, ceiling: bounds.min.y + size.y * fraction, count: 0, bounds: new THREE.Box3() }));
vertices(point => { for (const band of bands) if (point.y <= band.ceiling) { band.count++; band.bounds.expandByPoint(point); } });
const box = bounds => ({ min: bounds.min.toArray(), max: bounds.max.toArray(), size: bounds.getSize(new THREE.Vector3()).toArray() });
const report = { schema: 'thousand-unit-skirmish.building-model-measurement.v1', sourceFile: input, bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), triangles: instances.reduce((sum, item) => sum + item.triangles, 0),
  fullBounds: box(bounds), lowerGeometryBands: bands.map(band => ({ heightFraction: band.fraction, vertexCount: band.count, ...box(band.bounds) })),
  note: 'Bands are geometry measurements, not automatically approved support rectangles. Inspect the base before selecting a calibration width.' };
const json = JSON.stringify(report, null, 2) + '\n';
if (output) await writeFile(output, json); else process.stdout.write(json);
