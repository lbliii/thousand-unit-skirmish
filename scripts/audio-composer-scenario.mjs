import assert from 'node:assert/strict';
import {compileComposition, validateComposition} from '../src/audio-composition.mjs';
import {renderCompositionWav} from '../src/audio-composer.mjs';

const composition = {schemaVersion:1,id:'fixture',name:'Two instruments',bpm:120,beatsPerBar:4,lengthBars:2,tracks:[
  {id:'drums',name:'Drums',gain:0.5,pan:-1,mute:false,solo:false,clips:[{id:'kick',sourceId:'kick-wav',startBeat:0,durationBeats:4,offsetSeconds:0,gain:0.8,loop:true,fadeInSeconds:0.1,fadeOutSeconds:0.3}]},
  {id:'strings',name:'Strings',gain:1,pan:1,mute:false,solo:false,clips:[{id:'note',sourceId:'note-wav',startBeat:4,durationBeats:4,offsetSeconds:0.25,gain:1,loop:false,fadeInSeconds:0,fadeOutSeconds:0.2}]},
]};
const compiled = compileComposition(composition);
assert.equal(compiled.durationSeconds, 4);
assert.deepEqual(compiled.events.map(event => [event.sourceId,event.startSeconds,event.durationSeconds,event.gain,event.pan,event.loop]), [
  ['kick-wav',0,2,0.4,-1,true], ['note-wav',2,2,1,1,false],
]);
assert.equal(compileComposition({...composition,tracks:[{...composition.tracks[0],mute:true},composition.tracks[1]]}).events.length,1);
assert.equal(compileComposition({...composition,tracks:[{...composition.tracks[0],solo:true},composition.tracks[1]]}).events.length,1);
assert.equal(compileComposition({...composition,tracks:[{...composition.tracks[0],clips:[{...composition.tracks[0].clips[0],fadeInSeconds:30,fadeOutSeconds:30}]},composition.tracks[1]]}).events[0].fadeInSeconds,1);
assert.throws(() => validateComposition({...composition,bpm:Infinity}), /bpm/);
assert.throws(() => validateComposition({...composition,schemaVersion:2}), /schema version/);
assert.throws(() => validateComposition({...composition,tracks:[{...composition.tracks[0],clips:[{...composition.tracks[0].clips[0],startBeat:6,durationBeats:4}]},composition.tracks[1]]}), /past the composition/);
assert.throws(() => validateComposition({...composition,tracks:[composition.tracks[0],{...composition.tracks[1],clips:[{...composition.tracks[1].clips[0],id:'kick'}]}]}), /Duplicate/);
const reopened = validateComposition(JSON.parse(JSON.stringify(validateComposition(composition))));
assert.deepEqual(reopened,validateComposition(composition));

// A small OfflineAudioContext double records the Web Audio schedule and emits silence.
// A real browser render is checked separately; this catches missing fades, pan and loops.
class FakeParam { value = 0; changes = []; setValueAtTime(value,time) { this.changes.push(['set',value,time]); } linearRampToValueAtTime(value,time) { this.changes.push(['ramp',value,time]); } }
class FakeNode { connect(target) { return target; } }
class FakeSource extends FakeNode { start(...args) { this.startArgs = args; } stop(...args) { this.stopArgs = args; } }
class FakeOfflineContext {
  static instance;
  constructor(channels,length,sampleRate) { this.channels=channels;this.length=length;this.sampleRate=sampleRate;this.destination=new FakeNode();this.sources=[];this.gains=[];this.pans=[];FakeOfflineContext.instance=this; }
  async decodeAudioData() { return {duration:0.5}; }
  createBufferSource() { const node=new FakeSource();this.sources.push(node);return node; }
  createGain() { const node=new FakeNode();node.gain=new FakeParam();this.gains.push(node);return node; }
  createStereoPanner() { const node=new FakeNode();node.pan={value:0};this.pans.push(node);return node; }
  async startRendering() { return {numberOfChannels:2,length:this.length,sampleRate:this.sampleRate,getChannelData:()=>new Float32Array(this.length)}; }
}
const blobs = {'kick-wav':new Blob(['kick']),'note-wav':new Blob(['note'])};
const wav = await renderCompositionWav(composition,blobs,{OfflineContext:FakeOfflineContext,sampleRate:100});
const schedule = FakeOfflineContext.instance;
assert.equal(schedule.length,400);
assert.equal(schedule.sources.length,2);
assert.equal(schedule.sources[0].loop,true);
assert.deepEqual(schedule.sources[0].startArgs,[0,0]);
assert.deepEqual(schedule.sources[0].stopArgs,[2]);
assert.deepEqual(schedule.sources[1].startArgs,[2,0.25,0.25]);
assert.deepEqual(schedule.pans.map(node=>node.pan.value),[-1,1]);
assert.deepEqual(schedule.gains[0].gain.changes,[['set',0,0],['ramp',0.4,0.1],['set',0.4,1.7],['ramp',0,2]]);
const header = new DataView(await wav.arrayBuffer());
assert.equal(wav.type,'audio/wav');
assert.equal(header.getUint32(24,true),100);
assert.equal(header.getUint32(40,true),400*2*2);
await assert.rejects(renderCompositionWav(composition,{'kick-wav':blobs['kick-wav']},{OfflineContext:FakeOfflineContext,sampleRate:100}),/Missing recording/);
await assert.rejects(renderCompositionWav({...composition,lengthBars:256,bpm:20},blobs,{OfflineContext:FakeOfflineContext,sampleRate:100}),/five minutes/);
console.log('audio composer timing, normalization, save/reopen and WAV scheduling passed');
