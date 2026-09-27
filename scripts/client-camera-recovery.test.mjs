import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const socketSource = source.slice(source.indexOf('function connectSocket('),
  source.indexOf("\nwindow.addEventListener('beforeunload'"));
const map = { id: 'forked-vale', obstacles: [], triggers: [], scenarioEvents: [] };

function fixture() {
  const connections = [];
  const centers = [];
  class WebSocket {
    constructor() { this.events = new Map(); connections.push(this); }
    addEventListener(type, handler) { this.events.set(type, handler); }
    welcome(player) {
      this.events.get('message')({ data: JSON.stringify({
        type: 'welcome', map, state: { armySize: 24, connected: 2 }, maps: [], player,
      }) });
    }
    close() {}
  }
  const context = vm.createContext({
    WebSocket, URL, location: { protocol: 'http:', host: 'localhost' }, pageLeaving: false,
    localTeam: null, cameraSeatTeam: null, socket: null,
    HAS_ROOM_PARAMETER: false, ROOM_SESSION_STORAGE_KEY: 'session',
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    window: { reportPrototypeError(error) { throw new Error(error); } },
    ui: { orderStatus: { textContent: '' }, mapStudio: { open: false } },
    mapDefinition: map, currentArmySize: 24, waitingForResume: false,
    TEAM_NAMES: ['Azure', 'Ember'], reconnectDelayMs: 500,
    zoom: 0.5, defaultCameraZoom: 0.91, cameraMinZoom: 0.1, mapFitActive: true,
    setConnection() {}, buildMap() {}, setMapCatalog() {}, setArmySize() {},
    applyState() {}, updateRoomUI() {}, showToast() {}, resize() {},
    setPlayer(player) { context.localTeam = Number.isInteger(player.team) ? player.team : null; },
    centerCameraOnHomeBase() { centers.push(context.localTeam); },
  });
  vm.runInContext(socketSource, context);
  const connect = () => {
    vm.runInContext('connectSocket()', context);
    return connections.at(-1);
  };
  return { context, centers, connect };
}

for (const team of [0, 1]) {
  test(`seat ${team} preserves camera through a resume-pending spectator connection`, () => {
    const f = fixture();
    f.connect().welcome({ team });
    assert.deepEqual(f.centers, [team]);
    assert.equal(f.context.zoom, 0.91);
    f.context.zoom = 1.7;
    f.connect().welcome({ team, resumed: true });
    assert.equal(f.context.zoom, 1.7, 'direct reconnect preserves zoom');
    f.connect().welcome({ team: null, resumePending: true });
    assert.equal(f.context.localTeam, null, 'temporary spectator cannot issue player orders');
    f.connect().welcome({ team, resumed: true });
    assert.equal(f.context.zoom, 1.7, 'reclaim through spectator state preserves zoom');
    assert.deepEqual(f.centers, [team], 'reclaim does not recenter the battlefield');
    f.connect().welcome({ team: 1 - team });
    assert.deepEqual(f.centers, [team, 1 - team], 'a changed seat centers its own base');
  });
}

test('spectators do not center a base; an actual new seat does', () => {
  const f = fixture();
  const spectator = f.connect();
  spectator.welcome({ team: null });
  assert.equal(f.context.zoom, 0.5);
  assert.deepEqual(f.centers, []);
  f.connect().welcome({ team: 0 });
  assert.deepEqual(f.centers, [0]);
  f.context.zoom = 1.7;
  f.connect().welcome({ team: null });
  f.connect().welcome({ team: 0 });
  assert.equal(f.context.zoom, 0.91, 'new ownership after losing the seat centers again');
  assert.deepEqual(f.centers, [0, 0]);
  spectator.welcome({ team: 1 });
  assert.equal(f.context.localTeam, 0, 'stale sockets cannot change camera ownership');
});
