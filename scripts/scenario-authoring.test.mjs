import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ScenarioEditHistory,regionGestureZone} from '../src/scenario-authoring.mjs';
import {validCompletionTrigger,completionTeam} from '../src/scenario-regions.mjs';
test('bounded history branches and clones state',()=>{
 const h=new ScenarioEditHistory(2);h.record({x:0});h.record({x:1});h.record({x:2});h.record({x:3});
 assert.deepEqual(h.undo(),{x:2});assert.deepEqual(h.undo(),{x:1});assert.equal(h.undo(),null);
 h.record({x:5});assert.equal(h.redo(),null);
});
test('region gestures remain within grid',()=>{
 assert.deepEqual(regionGestureZone({tool:'region-draw',start:{column:8,row:9},current:{column:2,row:3}},10,10),{column:2,row:3,width:7,height:7});
 assert.deepEqual(regionGestureZone({tool:'region-move',start:{column:2,row:3},current:{column:20,row:-5},zone:{column:2,row:3,width:4,height:4}},10,10),{column:6,row:0,width:4,height:4});
 assert.deepEqual(regionGestureZone({tool:'region-resize',start:{column:2,row:3},current:{column:-4,row:40},zone:{column:2,row:3,width:4,height:4}},10,10),{column:2,row:3,width:1,height:7});
});
test('completion registry validation and deterministic initial presence',()=>{
 const trigger={type:'construction-complete',buildingType:'barracks',team:'either'};
 assert.ok(validCompletionTrigger(trigger));assert.equal(validCompletionTrigger({...trigger,buildingType:'unknown'}),false);
 const buildings=[{team:1,type:'barracks',hp:100,complete:true},{team:0,type:'barracks',hp:100,complete:true}];
 assert.equal(completionTeam(trigger,buildings,[{},{}]),0);
 buildings[1].complete=false;assert.equal(completionTeam(trigger,buildings,[{},{}]),1);
 buildings[0].hp=0;assert.equal(completionTeam(trigger,buildings,[{},{}]),-1);
 assert.equal(completionTeam({type:'research-complete',technologyId:'infantry-attack',team:'1'},[],[{}, {infantryAttack:true}]),1);
});
