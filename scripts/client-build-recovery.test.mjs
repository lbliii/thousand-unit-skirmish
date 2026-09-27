import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Execute the actual socket lifecycle and placement cleanup without mounting
// Three.js. Events and local UI state are controlled; no server outcome is assumed.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function declaration(name, nextName) {
  return source.slice(source.indexOf(`function ${name}(`), source.indexOf(`\nfunction ${nextName}(`));
}
const socketSource = source.slice(source.indexOf('function connectSocket('), source.indexOf("\nwindow.addEventListener('beforeunload'"));

function fixture({ pending = true, state = 'pending' } = {}) {
  const connections = [];
  const toasts = [];
  let economyUpdates = 0;
  let reconnects = 0;
  class WebSocket {
    constructor() { this.events = new Map(); connections.push(this); }
    addEventListener(type, listener) { this.events.set(type, listener); }
    emit(type, data) { this.events.get(type)?.(data); }
  }
  const context = vm.createContext({
    WebSocket, URL, location: { protocol: 'http:', host: 'localhost' },
    sessionStorage: { getItem: () => null }, window: { clearTimeout() {} },
    pageLeaving: false, localTeam: 0, HAS_ROOM_PARAMETER: false,
    ROOM_SESSION_STORAGE_KEY: 'test', socket: null, currentOrderToken: 7,
    orderStatusTimeout: 1, reconnectDelayMs: 500,
    buildPlacementActive: true, buildPlacementPending: pending,
    pendingBuildOrderToken: pending ? 7 : null, pendingBuildBaseline: new Set([1]),
    placementGhost: { visible: true },
    ui: { orderStatus: { dataset: { state } }, mapStudio: { open: false } },
    setConnection() {}, updateBuildPlacementHint() {},
    updateEconomyUI() { economyUpdates++; },
    showToast(message) { toasts.push(message); },
    setOrderStatus(message, status) {
      context.ui.orderStatus.textContent = message;
      context.ui.orderStatus.dataset.state = status;
    },
    scheduleReconnect() { reconnects++; },
  });
  vm.runInContext(`${declaration('cancelBuildPlacement', 'beginBuildPlacement')}\n${socketSource}\nconnectSocket();`, context);
  return { context, connections, toasts, economyUpdates: () => economyUpdates, reconnects: () => reconnects };
}

for (const state of ['pending', 'planning', 'applied']) {
  test(`disconnect releases unconfirmed placement with ${state} order feedback`, () => {
    const f = fixture({ state });
    f.connections[0].emit('close');
    assert.equal(f.context.buildPlacementPending, false);
    assert.equal(f.context.buildPlacementActive, false);
    assert.equal(f.context.pendingBuildOrderToken, null);
    assert.equal(f.context.pendingBuildBaseline.size, 0);
    assert.equal(f.context.placementGhost.visible, false);
    assert.equal(f.context.currentOrderToken, null);
    assert.equal(f.economyUpdates(), 1);
    assert.equal(f.reconnects(), 1);
    assert.deepEqual(f.toasts, [], 'do not claim the authoritative build was cancelled');
    if (state !== 'applied') assert.match(f.context.ui.orderStatus.textContent, /STATUS UNKNOWN/);
  });
}

test('an unsent placement preview survives a temporary disconnect', () => {
  const f = fixture({ pending: false });
  f.connections[0].emit('close');
  assert.equal(f.context.buildPlacementActive, true);
  assert.equal(f.context.placementGhost.visible, true);
  assert.equal(f.economyUpdates(), 0);
});

test('a stale connection close cannot cancel a placement on the current connection', () => {
  const f = fixture();
  vm.runInContext('connectSocket()', f.context);
  f.connections[0].emit('close');
  assert.equal(f.context.buildPlacementPending, true);
  assert.equal(f.reconnects(), 0);
  f.connections[1].emit('close');
  assert.equal(f.context.buildPlacementPending, false);
  assert.equal(f.reconnects(), 1);
});
