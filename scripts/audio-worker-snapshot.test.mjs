import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { BUILDING_DEFINITIONS } from '../src/gameplay-definitions.mjs';
const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('function snapshotUnits('), source.indexOf('function snapshotQueuedWaypointCounts('));
function fixture(fogOfWar = true) {
  const worker = { id:0, team:0, x:0, z:0, hp:100, kind:'worker', generation:1, cargo:0, cargoType:null, gatherPhase:'to-node', gatherForestCell:-1, gatherNodeId:'berries', attackTargetId:-1, repairing:false, buildingTargetId:null };
  const context = vm.createContext({ units:[worker], mapDefinition:{ fogOfWar, resourceNodes:[{id:'berries',type:'food'}] }, BUILDING_DEFINITIONS, BUILDER_INTERACTION_RANGE:1.4, teamWood:[100,100], buildingsById:new Map(), tickNumber:1, STATE_EVERY_TICKS:3, workerTaskStatus:()=>null, cellVisibleToTeam:()=>true, worldToCell:()=>0 });
  vm.runInContext(body, context);
  return {worker,context,execution:()=>context.workerAudioExecution(worker),row:(team)=>context.snapshotUnits(team)[0]};
}
test('authoritative execution begins at the resource and excludes travel, stopped or dead workers', () => {
  const f=fixture(); assert.equal(f.execution(),null);
  f.worker.gatherPhase='gathering'; assert.equal(f.execution(),'food');
  f.worker.gatherForestCell=20; assert.equal(f.execution(),'wood');
  f.worker.gatherPhase='to-base'; assert.equal(f.execution(),null);
  f.worker.gatherPhase=''; assert.equal(f.execution(),null);
  f.worker.hp=0; f.worker.gatherPhase='gathering'; assert.equal(f.execution(),null);
});
test('repair reports execution only in reach with a damaged completed building and wood', () => {
  const f=fixture(); f.worker.gatherPhase=''; f.worker.repairing=true; f.worker.buildingTargetId=10;
  const building={id:10,type:'barracks',x:0,z:0,complete:true,hp:1000}; f.context.buildingsById.set(10,building);
  assert.equal(f.execution(),'repair');
  f.worker.x=20; assert.equal(f.execution(),null); f.worker.x=0;
  f.context.teamWood[0]=0; assert.equal(f.execution(),null); f.context.teamWood[0]=100;
  building.hp=BUILDING_DEFINITIONS.barracks.maxHp; assert.equal(f.execution(),null);
});
test('fog withholds enemy work while no-fog shared roster retains execution for local filtering', () => {
  const fog=fixture(); fog.worker.gatherPhase='gathering';
  assert.equal(fog.row(0)[14],'food'); assert.equal(fog.row(1)[14],undefined);
  fog.worker.gatherPhase=''; assert.equal(fog.row(0).length,11, 'idle rows retain their compact legacy shape');
  const open=fixture(false); open.worker.gatherPhase='gathering';
  assert.equal(open.row(null)[14],'food');
});
