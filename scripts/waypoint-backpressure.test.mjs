import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
function between(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `server source boundaries: ${start}`);
  return source.slice(from, to);
}

function transport() {
  const frames = [];
  let rows = [[7, 1]];
  const context = vm.createContext({
    Buffer, MAX_PEER_QUEUED_BYTES: 1024, outboundQueueLimitDisconnects: 0,
    peakOutboundQueuedBytes: 0, lastWaypointQueueCountsByTeam: [[], []],
    snapshotQueuedWaypointCounts: (team) => team === 0 ? rows : [],
    prepareJsonFrame: (message) => Buffer.from(JSON.stringify(message)),
    peers: [], shuttingDown: false,
    mapDefinition: { id: 'new-map' }, mapCatalogPayload: () => [],
    roomPayload: () => ({ type: 'state', mapId: 'new-map', queuedWaypointCounts: [] }),
  });
  vm.runInContext([
    between('function websocketFrameBytes(', 'function sendPeerControlFrame('),
    between('function broadcastWaypointQueueCounts()', 'function clientOrderToken('),
    `globalThis.peer = {
      team: 0, closed: false, backpressured: true, pendingState: null, pendingWaypointCounts: null,
      coalescedStateSnapshots: 0, peakQueuedBytes: 0,
      outboundJsonFrames: 0, outboundJsonWireBytes: 0,
      outboundJsonPayloadBytes: 0, outboundJsonUncompressedWireBytes: 0,
      ${between('    sendJson(message) {', '    close()')}
      terminate() { this.closed = true; },
    }; peers.push(peer);`,
  ].join('\n'), context);
  context.peer.socket = {
    writableLength: 0,
    write(frame) { frames.push(JSON.parse(frame)); return false; },
  };
  return {
    context, frames,
    queues(nextRows) { rows = nextRows; vm.runInContext('broadcastWaypointQueueCounts()', context); },
    state(tick) { context.peer.sendPreparedState(Buffer.from(JSON.stringify({ type: 'state', tick }))); },
    drain(writable = true) {
      context.peer.socket.write = (frame) => { frames.push(JSON.parse(frame)); return writable; };
      const body = between("  socket.on('drain', () => {", '\n  let session =').replace("  socket.on('drain', () => {", '').replace(/\n  \}\);\n$/, '');
      vm.runInContext(`(() => { ${body} })()`, context);
    },
  };
}

test('slow reader receives waypoint changes and the newest full snapshot', () => {
  const wire = transport();
  wire.queues([[7, 1]]);
  wire.state(10);
  wire.state(11);
  wire.drain();
  assert.deepEqual(wire.frames, [
    { type: 'state', tick: 11 },
    { type: 'waypointQueueCounts', rows: [[7, 1]] },
  ]);
});

test('latest queue clearing follows a roster-reset snapshot', () => {
  const wire = transport();
  wire.queues([[7, 1]]);
  wire.state(10);
  wire.queues([[7, 2]]);
  wire.state(11);
  wire.queues([]);
  wire.state(12);
  wire.drain();
  assert.deepEqual(wire.frames.filter((frame) => frame.type === 'waypointQueueCounts')
    .map((frame) => frame.rows), [[]]);
  assert.equal(wire.frames[0].tick, 12);
});

test('reliable queue metadata still respects the peer memory limit', () => {
  const wire = transport();
  wire.context.peer.socket.writableLength = 1024;
  wire.queues([[7, 1]]);
  wire.drain();
  assert.equal(wire.context.peer.closed, true);
  assert.equal(wire.context.outboundQueueLimitDisconnects, 1);
  assert.equal(wire.frames.length, 0);
});


test('counts follow a drained state even when its write backpressures again', () => {
  const wire = transport();
  wire.state(10);
  wire.queues([[7, 2]]);
  wire.drain(false);
  assert.deepEqual(wire.frames.map((frame) => frame.type), ['state', 'waypointQueueCounts']);
  assert.equal(wire.context.peer.pendingWaypointCounts, null);
});

test('map change discards both old snapshot and old queue metadata', () => {
  const wire = transport();
  wire.state(10);
  wire.queues([[7, 2]]);
  vm.runInContext('broadcastMapChange()', wire.context);
  wire.drain();
  assert.equal(wire.frames.length, 1);
  assert.equal(wire.frames[0].type, 'mapChange');
  assert.deepEqual(wire.frames[0].state.queuedWaypointCounts, []);
});

test('queue metadata is retained only for its owning seat', () => {
  const wire = transport();
  const forbidden = () => assert.fail('foreign queue metadata was sent');
  const other = { team: 1, sendPreparedWaypointCounts: forbidden };
  const spectator = { team: null, sendPreparedWaypointCounts: forbidden };
  wire.context.peers.push(other, spectator);
  wire.queues([[7, 2]]);
  wire.drain();
  assert.deepEqual(wire.frames[0].rows, [[7, 2]]);
});


test('same queue signature on a new map is delivered again', () => {
  const wire = transport();
  wire.queues([[7, 1]]);
  vm.runInContext('broadcastMapChange()', wire.context);
  wire.queues([[7, 1]]);
  wire.state(20);
  wire.drain();
  assert.deepEqual(wire.frames.map((frame) => frame.type),
    ['mapChange', 'state', 'waypointQueueCounts']);
  assert.deepEqual(wire.frames.at(-1).rows, [[7, 1]]);
});
