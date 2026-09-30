// Combined authoritative proof. Browser authoring, sound playback and human discovery
// require separate evidence; this test never injects checkpoint state or resources.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFortifiedFixture } from './fortified-crossing-fixture.mjs';
const map = JSON.parse(await readFile(new URL('../maps/fortified-crossing.json', import.meta.url)));
const winner = Number(process.argv[2] ?? 0); assert.ok([0,1].includes(winner));
const fixture = await createFortifiedFixture({timeoutMs:120000});
let clients, stage = 'startup', orderToken = 1;
const own = (client,team,kind) => client.latest.units.filter(u=>u[1]===team && u[4]>0 && (!kind || u[5]===kind));
const row = (client,id) => client.latest.units.find(u=>u[0]===id);
async function order(client,type,ids,extra={},label=null) {
  const generations = ids.map(id=>row(client,id)?.[8]);
  return client.command({type,ids,unitGenerations:generations,...extra,clientOrderToken:orderToken++},label ?? /ORDER/);
}
function eventState(state,id) { return state.scenarioEvents.find(e=>e.id===id); }
function objective(state,id) { return state.objectives.find(e=>e.id===id); }
const checkpointEvent = (save,id) => save.state.scenarioEventStates.find(e=>e.id===id);
try {
  await fixture.start(); clients = [await fixture.connect(0),await fixture.connect(1)];
  const tokens = clients.map(c=>c.welcome.player.sessionToken);
  assert.deepEqual(clients[0].welcome.map.audio,map.audio,'assigned audio reference reaches host');
  assert.deepEqual(clients[1].welcome.map.audio,map.audio,'same reference reaches guest');
  const patrolIds=[],workerIds=[];
  stage='both-seat economy and patrol';
  await Promise.all(clients.map(async(client,team)=>{
    workerIds[team]=own(client,team,'worker').map(u=>u[0]);
    const soldiers=own(client,team,'infantry'); patrolIds[team]=soldiers[0][0];
    await order(client,'holdPosition',soldiers.map(u=>u[0]),{},/HOLD POSITION ORDER/);
    const patrol=row(client,patrolIds[team]);
    await order(client,'patrol',[patrol[0]],{x:patrol[2]+(team?-5:5),z:patrol[3]},/PATROL ORDER/);
    for(const [index,type] of ['food','wood'].entries()) {
      const node=map.resourceNodes.find(n=>n.type===type && (team?n.x>20:n.x< -20));
      await order(client,'gather',[workerIds[team][index+2]],{nodeId:node.id},/GATHER ORDER/);
    }
    await order(client,'build',workerIds[team].slice(0,2),{buildingType:'barracks',x:team?18.5:-18.5,z:-3.5},/BUILD ORDER/);
  }));
  const built=await Promise.all(clients.map((c,t)=>c.state(s=>s.buildings.some(b=>b.team===t&&b.type==='barracks'&&b.complete)&&Number.isFinite(eventState(s,`construction-relief-${t}`)?.activatedAtSeconds),'Barracks completion activation')));
  stage='restart during armed construction relief';
  for(const [team,c] of clients.entries()) {
    const barracks=built[team].buildings.find(b=>b.team===team&&b.type==='barracks');
    c.send({type:'trainUnit',kind:'infantry',buildingId:barracks.id});
    c.send({type:'researchUpgrade',upgrade:'infantry-attack',buildingId:barracks.id});
  }
  const pending=await fixture.checkpoint(s=>[0,1].every(t=>s.state.teamResearch[t]?.type==='infantry-attack'&&checkpointEvent(s,`construction-relief-${t}`)?.activatedAtSeconds!==null&&!checkpointEvent(s,`construction-relief-${t}`)?.fired)&&patrolIds.every(id=>s.state.units.find(u=>u.id===id)?.persistentOrder?.type==='patrol'));
  await fixture.stop(); await fixture.start();
  clients=[await fixture.connect(0,tokens[0]),await fixture.connect(1,tokens[1])];
  for(const [team,c] of clients.entries()) {
    assert.ok(c.latest.persistentOrders.some(r=>r[0]===patrolIds[team]&&r[1]==='patrol'));
    assert.equal(c.latest.teamResearch[team].active.type,'infantry-attack');
    assert.ok(c.latest.food[team]>=pending.state.teamFood[team]);
    assert.equal(eventState(c.latest,`construction-relief-${team}`).fired,false);
  }
  stage='research rewards and mixed-speed follow';
  await Promise.all(clients.map((c,t)=>c.state(s=>s.teamResearch[t].infantryAttack&&eventState(s,`research-relief-${t}`).fired&&s.units.some(u=>u[1]===t&&u[5]==='scout'),'completed research relief and scout')));
  const leaders=[],followers=[];
  await Promise.all(clients.map(async(c,t)=>{
    const scout=own(c,t,'scout')[0]; leaders[t]=scout[0];
    followers[t]=own(c,t,'infantry').slice(0,2).map(u=>u[0]);
    await order(c,'follow',followers[t],{targetId:scout[0],targetGeneration:scout[8]},/FOLLOW ORDER/);
    await order(c,'move',[scout[0]],{x:t?2.5:-2.5,z:t?2.5:-2.5},/MOVE ORDER/);
  }));
  stage='mixed-speed Follow into named crossing';
  await Promise.all(clients.map((c,t)=>c.state(s=>Number.isFinite(eventState(s,`crossing-relief-${t}`)?.activatedAtSeconds),'three-unit crossing presence')));
  stage='follow reclaim and event delivery';
  const disconnected=clients[1]; disconnected.socket.close();
  clients[1]=await fixture.connect(1,tokens[1]);
  assert.ok(clients[1].latest.persistentOrders.some(r=>r[0]===followers[1][0]&&r[1]==='follow'));
  await Promise.all(clients.map(c=>c.state(s=>s.scenarioEvents.every(e=>e.fired),'all completion and crossing-chain rewards')));
  for(const c of clients) {
    for(const event of map.scenarioEvents.filter(e=>e.id!=='scout-relief')) {
      // Guest was disconnected briefly; checkpoint states establish delivery even
      // if that connection missed a transient notification. Never require replay.
      assert.equal(eventState(c.latest,event.id).fired,true);
      assert.ok(c.messages.filter(m=>m.type==='scenarioEvent'&&m.eventId===event.id).length<=1,'reward notification must not duplicate');
    }
  }
  assert.equal(clients[1].latest.scenarioTrace,undefined,'guest receives no host trace');
  assert.ok(clients[0].latest.scenarioTrace.some(e=>e.status==='completed'));
  stage='both-seat stop and hold cancel follow';
  await Promise.all(clients.map(async(c,t)=>{
    await order(c,'stop',followers[t],{},/STOP ORDER/);
    await order(c,'holdPosition',own(c,t,'infantry').map(u=>u[0]),{},/HOLD POSITION ORDER/);
    await order(c,'move',[leaders[t]],{x:t?26.5:-26.5,z:.5},/MOVE ORDER/);
    await c.state(s=>!s.persistentOrders.length,'persistent intent cleared');
  }));
  stage='real combat';
  const duel=clients.map((c,t)=>own(c,t,'infantry').at(-1)[0]);
  await Promise.all(clients.map((c,t)=>order(c,'attackMove',[duel[t]],{x:t?-.5:.5,z:8.5},/ATTACK MOVE ORDER/)));
  const fought=await fixture.checkpoint(s=>duel.some(id=>s.state.units.find(u=>u.id===id)?.hp<=0));
  assert.ok(duel.some(id=>fought.state.units.find(u=>u.id===id)?.hp<=0));
  const loser=1-winner;
  await order(clients[loser],'move',own(clients[loser],loser,'infantry').map(u=>u[0]),{x:loser?26.5:-26.5,z:.5},/MOVE ORDER/);
  stage='capture and 30-second hold result';
  for(const id of ['capture-zone-1','capture-zone-2','capture-zone-3']) {
    const zone=map.triggers.find(t=>t.id===id).zone;
    const ids=own(clients[winner],winner,'infantry').map(u=>u[0]);
    assert.ok(ids.length>=8,'surviving army can satisfy the Watch');
    await order(clients[winner],'move',ids,{x:zone.column+zone.width/2-map.width/2,z:zone.row+zone.height/2-map.height/2},/MOVE ORDER/);
    await clients[winner].state(s=>objective(s,id)?.owner===winner,`${id} captured`);
  }
  await Promise.all(clients.map(c=>c.state(s=>s.winner===winner,'capture victory')));
  stage='rematch';
  const oldGenerations=clients.map((c,t)=>row(c,workerIds[t][0])[8]); clients[0].send({type:'reset'});
  await Promise.all(clients.map((c,t)=>c.state(s=>s.winner===-1&&s.armySize===24&&s.buildings.length===0&&s.scenarioEvents.every(e=>!e.fired)&&!s.persistentOrders.length&&s.units.find(u=>u[0]===workerIds[t][0])?.[8]!==oldGenerations[t],'fresh rematch')));
  const reset=await fixture.checkpoint(s=>s.state.units.every(u=>!u.persistentOrder)&&s.state.teamFood.every(n=>n===350)&&s.state.teamWood.every(n=>n===600));
  assert.ok(reset.state.teamResearch.every(r=>r===null));
  console.log(JSON.stringify({map:map.id,winner,checks:['both-seat paid economy','construction/research rewards','mixed-speed scout follow','patrol checkpoint','armed delayed restart','seat reclaim','combined event chain','host trace privacy','real combat','capture hold victory','rematch'],limitations:['no browser authoring or audio playback assertion','no unassisted human discoverability claim']}));
} catch(error) {console.error(JSON.stringify({stage,seats:clients?.map(c=>({tick:c.latest?.tick,clock:c.latest?.matchElapsedSeconds,research:c.latest?.teamResearch,events:c.latest?.scenarioEvents,kinds:c.latest?.units?.map(u=>u[5]),notices:c.messages.filter(m=>m.type==='notice'||m.type==='scenarioEvent').slice(-8)}))}));throw new Error(`${stage}: ${error.message}`,{cause:error});}
finally {await fixture.dispose();}
