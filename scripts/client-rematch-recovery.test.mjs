import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { UnitLifecycleAudioGate, OrderAudioGate, workAudioEvents } from '../src/audio-policy.mjs';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const declaration = (name, next) => source.slice(source.indexOf(`function ${name}(`), source.indexOf(`\nfunction ${next}(`));
const socketSource = source.slice(source.indexOf('function connectSocket('), source.indexOf("\nwindow.addEventListener('beforeunload'"));
const map = { id: 'forked-vale', fogOfWar: true, obstacles: [], triggers: [], scenarioEvents: [],
  spawnPoints: [{team: 0, x: -18, z: 0}, {team: 1, x: 18, z: 0}] };
const row = (id, team, generation = 1) => [id, team, team ? 18 : -18, 0, 100, 'worker', 0, null, generation, 'idle', 0];
function snapshot(team, { winner = -1, elapsed = 0, trained = false, generation = 1 } = {}) {
  return { type: 'state', tick: Math.round(elapsed * 10), mapId: map.id, armySize: 24, matchElapsedSeconds: elapsed, winner,
    winnerReason: winner < 0 ? null : 'elimination', fogOfWar: true, connected: 2,
    units: [...Array.from({ length: 12 }, (_, slot) => row(team * 12 + slot, team, generation)),
      ...(trained ? [row(24, team, generation)] : [])] };
}
function fixture(team) {
  const connections = [];
  const elements = new Map();
  const counts = [0, 0];
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { textContent: '', hidden: false, dataset: {}, classList: {toggle(){}}, setAttribute(){} });
    return elements.get(id);
  };
  class WebSocket {
    constructor() { this.events = new Map(); connections.push(this); }
    addEventListener(type, callback) { this.events.set(type, callback); }
    message(value) { this.events.get('message')({data: JSON.stringify(value)}); }
    closeEvent() { this.events.get('close')(); }
    close() {}
  }
  const noop = () => {};
  const context = vm.createContext({
    WebSocket, URL, performance: {now: () => 1000}, location: {protocol:'http:',host:'localhost'},
    document: {querySelector:element,querySelectorAll:() => []}, window: {clearTimeout:noop},
    sessionStorage: {getItem:() => null,setItem:noop,removeItem:noop},
    pageLeaving:false, localTeam:team, cameraSeatTeam:team, isHost:team === 0, socket:null,
    HAS_ROOM_PARAMETER:false, ROOM_SESSION_STORAGE_KEY:'session', waitingForResume:false,
    mapDefinition:map, currentArmySize:24, matchWinner:-1, matchWinnerReason:null,
    latestMatchElapsedSeconds:0, matchResult:element('result'), TEAM_NAMES:['Azure','Ember'],
    buildPlacementActive:false, buildPlacementPending:false, attackMoveMode:false, tapOrderArmed:false,
    units:[],teamUnits:[[],[]],selected:new Set(),controlGroups:[new Set()], MAX_UNITS:2000,MAX_PER_TEAM:1000,WORKERS_PER_TEAM:4,
    WORKER_TASK_STATES:new Set(['idle']),nextAttackFocusSlot:0,attackFocusDirty:false,selectionDirty:false,
    unitHealthBackground:{count:0},unitHealthFill:{count:0},
    attackFocusMesh:{count:0,instanceMatrix:{}}, arrowTraces:[],arrowImpacts:[],arrowMesh:{count:0},arrowImpactMesh:{count:0},
    lastFriendlyUnitClick:null,lastUnitPickState:null, currentOrderToken:null, orderStatusTimeout:null,reconnectDelayMs:500,
    ui:{total:element('total'),orderStatus:element('orders'),mapStudio:{open:false},
      playerTeam:element('player-team'),mapSelect:element('map-select'),mapStudioOpen:element('studio-open')},
    audio:{play:noop,playEvent:noop,stopWork:noop,updateWork:noop},combatAudioGate:{reset:noop,observe:noop},unitLifecycleAudioGate:new UnitLifecycleAudioGate(),orderAudioGate:new OrderAudioGate(),workAudioEvents,cameraTarget:{x:0,z:0},
    setUnitInstanceCount:(side,count) => {counts[side] = count;},
    setUnitTint:noop,updateUnitTransform:noop,updateUnitCargoCueColor:noop,
    markUnitInstanceMatricesDirty:noop,flushUnitCargoPackColor:noop,
    clearControlGroups(){ for (const group of context.controlGroups) group.clear(); },
    syncSelectionMesh:noop,updateSelectionUI:noop,updateCommandUI:noop,updateControlGroupUI:noop,
    updateFogFromState:noop,applyForestState:noop,updateObjectives:noop,updateVictoryHoldCard:noop,
    updateScenarioEventCards(_events,elapsed){context.latestMatchElapsedSeconds = elapsed;},
    updateEconomyUI:noop,updateEnvironmentStateCaptureSnapshot:noop,revalidateControlGroups:noop,
    setConnection:noop,setMapCatalog:noop,loadMapAudio:noop,updateRoomUI:noop,showToast:noop,scheduleReconnect:noop,
    zoom:1.7,defaultCameraZoom:0.91,cameraMinZoom:0.1,mapFitActive:false,resize:noop,centerCameraOnHomeBase:noop,
  });
  vm.runInContext([
    declaration('syncMatchResultActions','updateMatchResult'),declaration('updateMatchResult','updateCommandUI'),
    declaration('setArmySize','updateSelectionUI'),declaration('appendUnitFromState','applyState'),
    declaration('applyState','updateEnvironmentStateCaptureSnapshot'),declaration('setPlayer','setMapCatalog'),socketSource,
    'setArmySize(24); connectSocket();',
  ].join('\n'),context);
  const connect = () => { vm.runInContext('connectSocket()',context); return connections.at(-1); };
  const welcome = (connection,state) => connection.message({type:'welcome',map,maps:[],state,
    player:{team,isHost:team === 0,resumed:true}});
  return {context,connections,connect,welcome,element,counts};
}

for (const team of [0,1]) for (const reconnect of [false,true]) {
  test(`seat ${team} removes prior production on ${reconnect ? 'reconnected' : 'connected'} rematch`, () => {
    const f = fixture(team);
    const old = f.connections[0];
    old.message(snapshot(team,{trained:true,elapsed:50}));
    f.context.selected.add(24);
    f.context.controlGroups[0].add(24);
    old.message(snapshot(team,{trained:true,elapsed:60,winner:team}));
    assert.equal(f.element('#match-result-title').textContent,'VICTORY');
    assert.equal(f.element('#match-play-again').hidden,team !== 0);
    const current = reconnect ? f.connect() : old;
    const fresh = snapshot(team,{generation:2});
    if (reconnect) f.welcome(current,fresh); else current.message(fresh);
    assert.equal(f.context.matchWinner,-1);
    assert.equal(f.context.matchResult.hidden,true);
    assert.equal(f.context.units[24],undefined,'prior-match trained unit must leave the client roster');
    assert.equal(f.context.teamUnits[team].length,12,'unit render slots must shrink to the opening roster');
    assert.equal(f.context.unitHealthBackground.count,24,'health render slots reset with the roster');
    assert.equal(f.context.unitHealthFill.count,24);
    assert.equal(f.counts[team],12);
    assert.equal(f.context.selected.has(24),false);
    assert.equal(f.context.controlGroups[0].has(24),false);
    // The same ID may be trained for the opposite side in the new match.
    current.message({...fresh,fogOfWar:false,units:[...fresh.units,row(24,1-team,3)]});
    assert.equal(f.context.units[24].team,1-team,'a reused ID must accept the new owner');
    if (reconnect) {
      old.message(snapshot(team,{trained:true,elapsed:60,winner:1-team}));
      f.welcome(old,snapshot(team,{winner:1-team,elapsed:60}));
      old.closeEvent();
      assert.equal(f.context.socket,current);
      assert.equal(f.context.matchWinner,-1,'old socket cannot restore a terminal result');
      assert.equal(f.context.localTeam,team);
      assert.equal(f.context.units[24].team,1-team);
    }
  });
}

test('ordinary same-match reconnect retains trained units and selection', () => {
  const f = fixture(0);
  f.connections[0].message(snapshot(0,{trained:true,elapsed:50}));
  f.context.selected.add(24);
  f.context.controlGroups[0].add(24);
  f.welcome(f.connect(),snapshot(0,{trained:true,elapsed:50}));
  assert.equal(f.context.units[24].team,0);
  assert.equal(f.context.selected.has(24),true);
  assert.equal(f.context.controlGroups[0].has(24),true);
});

for (const team of [0,1]) {
  test(`seat ${team} reconnect preserves terminal result until the authoritative rematch`, () => {
    const f = fixture(team);
    for (const winner of [team,1-team,2]) {
      f.welcome(f.connect(),snapshot(team,{winner,elapsed:60,trained:true}));
      assert.equal(f.context.matchWinner,winner);
      assert.equal(f.context.matchResult.hidden,false);
      assert.equal(f.element('#match-result-title').textContent,winner === 2 ? 'DRAW' : winner === team ? 'VICTORY' : 'DEFEAT');
      assert.equal(f.context.units[24].team,team);
    }
    const old = f.connections.at(-1);
    const current = f.connect();
    const newTeam = 1-team;
    current.message({type:'welcome',map,maps:[],state:snapshot(newTeam,{generation:2}),
      player:{team:newTeam,isHost:newTeam === 0}});
    assert.equal(f.context.localTeam,newTeam);
    assert.equal(f.element('#match-play-again').hidden,newTeam !== 0);
    f.welcome(old,snapshot(team,{winner:team,elapsed:60,trained:true}));
    old.closeEvent();
    assert.equal(f.context.localTeam,newTeam);
    assert.equal(f.context.socket,current);
    assert.equal(f.context.matchWinner,-1);
    assert.equal(f.context.units[24],undefined);
  });

  test(`seat ${team} reconnect after an unseen rematch rebuilds on clock rewind`, () => {
    const f = fixture(team);
    f.connections[0].message(snapshot(team,{trained:true,elapsed:50}));
    f.welcome(f.connect(),snapshot(team,{generation:2}));
    assert.equal(f.context.units[24],undefined);
    assert.equal(f.context.teamUnits[team].length,12);
  });
}
