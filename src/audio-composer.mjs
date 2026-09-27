import {compileComposition, validateComposition} from './audio-composition.mjs';

const id = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
const clone = value => JSON.parse(JSON.stringify(value));
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const field = (label, key, value, {type = 'number', min, max, step = 'any'} = {}) => `<label>${label}<input data-field="${key}" type="${type}" value="${escapeHtml(value)}" ${min === undefined ? '' : `min="${min}"`} ${max === undefined ? '' : `max="${max}"`} ${type === 'number' ? `step="${step}"` : ''}></label>`;
const check = (label, key, value) => `<label>${label}<input data-field="${key}" type="checkbox" ${value ? 'checked' : ''}></label>`;
const option = (value, label, selected) => `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;

function wavBlob(buffer) {
  const channels = Math.min(2, buffer.numberOfChannels);
  const samples = buffer.length;
  const bytes = new ArrayBuffer(44 + samples * channels * 2);
  const view = new DataView(bytes);
  let pos = 0;
  const write = text => { for (const char of text) view.setUint8(pos++, char.charCodeAt(0)); };
  write('RIFF'); view.setUint32(pos, bytes.byteLength - 8, true); pos += 4;
  write('WAVEfmt '); view.setUint32(pos, 16, true); pos += 4;
  view.setUint16(pos, 1, true); pos += 2;
  view.setUint16(pos, channels, true); pos += 2;
  view.setUint32(pos, buffer.sampleRate, true); pos += 4;
  view.setUint32(pos, buffer.sampleRate * channels * 2, true); pos += 4;
  view.setUint16(pos, channels * 2, true); pos += 2;
  view.setUint16(pos, 16, true); pos += 2;
  write('data'); view.setUint32(pos, samples * channels * 2, true); pos += 4;
  const data = Array.from({length: channels}, (_, channel) => buffer.getChannelData(channel));
  for (let frame = 0; frame < samples; frame++) for (let channel = 0; channel < channels; channel++) {
    const sample = Math.max(-1, Math.min(1, data[channel][frame]));
    view.setInt16(pos, sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767), true);
    pos += 2;
  }
  return new Blob([bytes], {type: 'audio/wav'});
}

export async function renderCompositionWav(composition, sourceBlobs, {OfflineContext = globalThis.OfflineAudioContext, sampleRate = 44100} = {}) {
  if (!OfflineContext) throw new Error('Offline audio rendering is unavailable in this browser');
  const {durationSeconds, events} = compileComposition(composition);
  if (durationSeconds > 300) throw new Error('WAV export is limited to five minutes per composition');
  const context = new OfflineContext(2, Math.ceil(durationSeconds * sampleRate), sampleRate);
  const cache = new Map();
  for (const event of events) {
    const blob = sourceBlobs?.[event.sourceId];
    if (!(blob instanceof Blob)) throw new Error(`Missing recording for source ${event.sourceId}`);
    if (!cache.has(event.sourceId)) {
      try { cache.set(event.sourceId, await context.decodeAudioData(await blob.arrayBuffer())); }
      catch { throw new Error(`Could not decode recording ${event.sourceId}`); }
    }
    const buffer = cache.get(event.sourceId);
    if (event.offsetSeconds >= buffer.duration) throw new Error(`Clip offset exceeds recording ${event.sourceId}`);
    const audible = event.loop ? event.durationSeconds : Math.min(event.durationSeconds, buffer.duration - event.offsetSeconds);
    if (audible <= 0) continue;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    source.buffer = buffer;
    source.loop = event.loop;
    if (event.loop) { source.loopStart = event.offsetSeconds; source.loopEnd = buffer.duration; }
    panner.pan.value = event.pan;
    source.connect(gain); gain.connect(panner); panner.connect(context.destination);
    const start = event.startSeconds;
    const end = start + audible;
    const fadeIn = Math.min(event.fadeInSeconds, audible / 2);
    const fadeOut = Math.min(event.fadeOutSeconds, audible / 2);
    gain.gain.setValueAtTime(fadeIn ? 0 : event.gain, start);
    if (fadeIn) gain.gain.linearRampToValueAtTime(event.gain, start + fadeIn);
    if (fadeOut) {
      gain.gain.setValueAtTime(event.gain, end - fadeOut);
      gain.gain.linearRampToValueAtTime(0, end);
    }
    if (event.loop) { source.start(start, event.offsetSeconds); source.stop(end); }
    else source.start(start, event.offsetSeconds, audible);
  }
  return wavBlob(await context.startRendering());
}

export function mountAudioComposer(container, {pack, sourceBlobs = {}, onChange} = {}) {
  if (!(container instanceof Element)) throw new Error('Audio composer needs a container element');
  if (!pack || !Array.isArray(pack.compositions) || !Array.isArray(pack.sources)) throw new Error('Audio composer needs a pack with sources and compositions');
  if (typeof onChange !== 'function') throw new Error('Audio composer needs onChange(pack)');
  let currentPack = clone(pack);
  let compositionId = currentPack.compositions[0]?.id || null;
  let draft = compositionId ? validateComposition(currentPack.compositions[0]) : null;
  let selectedTrackId = draft?.tracks[0]?.id || null;
  let selectedClipId = null;
  let dirty = false;
  let disposed = false;
  let context = null;
  let player = null;
  let previewToken = 0;
  const root = document.createElement('section');
  root.className = 'audio-composer';
  container.append(root);
  const getTrack = () => draft?.tracks.find(track => track.id === selectedTrackId);
  const getClip = () => getTrack()?.clips.find(clip => clip.id === selectedClipId);
  const setStatus = (message, error = false) => { const status = root.querySelector('.audio-composer__status'); if (status) { status.textContent = message; status.dataset.error = String(error); } };
  const sources = () => currentPack.sources;
  const stop = () => { previewToken++; player?.stop(); };
  function render(message = '') {
    if (disposed) return;
    const track = getTrack();
    const clip = getClip();
    const totalBeats = draft ? draft.lengthBars * draft.beatsPerBar : 0;
    root.innerHTML = `<h2>Clip composer</h2>
      <p class="audio-composer__note">Recordings play at their original speed. Tempo controls the grid and placement; imported phrases are not stretched to beats.</p>
      <div class="audio-composer__bar"><label>Composition<select data-action="select-composition">${currentPack.compositions.map(item => option(item.id, item.name, item.id === compositionId)).join('')}</select></label><button data-action="new">New composition</button><button data-action="save" ${!draft ? 'disabled' : ''}>Save${dirty ? ' *' : ''}</button></div>
      ${draft ? `<div class="audio-composer__settings">${field('Name','name',draft.name,{type:'text'})}${field('BPM','bpm',draft.bpm,{min:20,max:300})}${field('Beats / bar','beatsPerBar',draft.beatsPerBar,{min:1,max:16,step:1})}${field('Bars','lengthBars',draft.lengthBars,{min:1,max:256,step:1})}</div>
      <div class="audio-composer__actions"><button data-action="add-track">Add track</button><button data-action="play">Play</button><button data-action="stop">Stop</button><button data-action="export">Export WAV</button></div>
      <div class="audio-composer__tracks">${draft.tracks.map(item => `<div class="audio-composer__track" data-track="${escapeHtml(item.id)}"><div class="audio-composer__track-head"><button data-action="select-track" data-id="${escapeHtml(item.id)}" aria-pressed="${item.id === selectedTrackId}">${escapeHtml(item.name)}</button>${item.id === selectedTrackId ? `${field('Track name','track.name',item.name,{type:'text'})}${field('Gain','track.gain',item.gain,{min:0,max:4})}${field('Pan','track.pan',item.pan,{min:-1,max:1})}${check('Mute','track.mute',item.mute)}${check('Solo','track.solo',item.solo)}<button data-action="add-clip">Add clip</button><button data-action="remove-track">Remove track</button>` : ''}</div><div class="audio-composer__timeline" data-track-id="${escapeHtml(item.id)}" title="Click to place the selected clip on the nearest beat">${item.clips.map(cue => `<button class="audio-composer__clip" data-action="select-clip" data-track-id="${escapeHtml(item.id)}" data-id="${escapeHtml(cue.id)}" aria-pressed="${cue.id === selectedClipId}" style="left:${cue.startBeat / totalBeats * 100}%;width:${cue.durationBeats / totalBeats * 100}%">${escapeHtml(sources().find(source => source.id === cue.sourceId)?.name || cue.sourceId)}</button>`).join('')}</div></div>`).join('')}</div>
      ${track && clip ? `<div class="audio-composer__clip-form"><h3>Selected clip</h3><label>Recording<select data-field="clip.sourceId">${sources().map(source => option(source.id, source.name, source.id === clip.sourceId)).join('')}</select></label>${field('Start beat','clip.startBeat',clip.startBeat,{min:0,max:totalBeats})}${field('Length (beats)','clip.durationBeats',clip.durationBeats,{min:0.001,max:totalBeats})}${field('Source offset (s)','clip.offsetSeconds',clip.offsetSeconds,{min:0})}${field('Gain','clip.gain',clip.gain,{min:0,max:4})}${check('Loop recording','clip.loop',clip.loop)}${field('Fade in (s)','clip.fadeInSeconds',clip.fadeInSeconds,{min:0})}${field('Fade out (s)','clip.fadeOutSeconds',clip.fadeOutSeconds,{min:0})}<button data-action="duplicate">Duplicate</button><button data-action="remove-clip">Delete clip</button></div>` : '<p class="audio-composer__empty">Add a track and a recording clip to begin.</p>'}` : '<p class="audio-composer__empty">Create a composition to begin.</p>'}
      <p class="audio-composer__status" role="status"></p>`;
    setStatus(message);
  }
  function updated() { dirty = true; stop(); render(); }
  function freshComposition() {
    return {schemaVersion:1,id:id('composition'),name:'New composition',bpm:96,beatsPerBar:4,lengthBars:8,tracks:[]};
  }
  async function save() {
    const normalized = validateComposition(draft);
    for (const track of normalized.tracks) for (const clip of track.clips) {
      if (!sources().some(source => source.id === clip.sourceId)) throw new Error(`Missing source ${clip.sourceId}`);
    }
    const next = clone(currentPack);
    const index = next.compositions.findIndex(item => item.id === normalized.id);
    if (index < 0) next.compositions.push(normalized); else next.compositions[index] = normalized;
    await onChange(next);
    currentPack = next;
    compositionId = normalized.id;
    draft = normalized;
    dirty = false;
    render('Composition saved.');
  }
  async function play() {
    stop();
    const token = previewToken;
    validateComposition(draft);
    const {createCompositionPlayer} = await import('./audio-composition-player.mjs');
    if (disposed || token !== previewToken) return;
    context ||= new AudioContext();
    player ||= createCompositionPlayer({context,destination:context.destination,resolveBuffer: async sourceId => {
      const blob = sourceBlobs[sourceId];
      if (!(blob instanceof Blob)) throw new Error(`Missing recording ${sourceId}`);
      return context.decodeAudioData(await blob.arrayBuffer());
    }});
    await context.resume();
    await player.play(draft);
    if (!disposed && token === previewToken) setStatus('Preview playing.');
  }
  function handleAction(target) {
    const action = target.dataset.action;
    if (!action) return;
    if (action === 'new') { stop(); draft = freshComposition(); compositionId = draft.id; selectedTrackId = null; selectedClipId = null; dirty = true; render(); return; }
    if (action === 'select-track') { selectedTrackId = target.dataset.id; selectedClipId = null; render(); return; }
    if (action === 'add-track') { const track = {id:id('track'),name:`Track ${draft.tracks.length + 1}`,gain:1,pan:0,mute:false,solo:false,clips:[]}; draft.tracks.push(track); selectedTrackId = track.id; selectedClipId = null; updated(); return; }
    if (action === 'remove-track') { draft.tracks = draft.tracks.filter(item => item.id !== selectedTrackId); selectedTrackId = draft.tracks[0]?.id || null; selectedClipId = null; updated(); return; }
    if (action === 'add-clip') {
      if (!sources().length) throw new Error('Import a recording into the library first');
      const track = getTrack();
      const lastEnd = Math.max(0, ...track.clips.map(item => item.startBeat + item.durationBeats));
      const total = draft.lengthBars * draft.beatsPerBar;
      const startBeat = Math.min(Math.round(lastEnd), total - 1);
      const clip = {id:id('clip'),sourceId:sources()[0].id,startBeat,durationBeats:Math.min(draft.beatsPerBar,total-startBeat),offsetSeconds:0,gain:1,loop:false,fadeInSeconds:0,fadeOutSeconds:0};
      track.clips.push(clip); selectedClipId = clip.id; updated(); return;
    }
    if (action === 'select-clip') { selectedTrackId = target.dataset.trackId; selectedClipId = target.dataset.id; render(); return; }
    if (action === 'duplicate') { const clip = getClip(); const copy = {...clip,id:id('clip'),startBeat:Math.min(Math.round(clip.startBeat + clip.durationBeats),draft.lengthBars*draft.beatsPerBar-clip.durationBeats)}; getTrack().clips.push(copy); selectedClipId = copy.id; updated(); return; }
    if (action === 'remove-clip') { getTrack().clips = getTrack().clips.filter(item => item.id !== selectedClipId); selectedClipId = null; updated(); return; }
    if (action === 'stop') { stop(); setStatus('Preview stopped.'); return; }
    if (action === 'save') { save().catch(error => setStatus(error.message,true)); return; }
    if (action === 'play') { play().catch(error => setStatus(`Preview unavailable: ${error.message}`,true)); return; }
    if (action === 'export') {
      setStatus('Rendering WAV…');
      renderCompositionWav(draft, sourceBlobs).then(blob => {
        if (disposed) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = `${draft.name.replace(/[^a-z0-9_-]+/gi,'-')}.wav`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setStatus('WAV exported.');
      }).catch(error => setStatus(error.message,true));
    }
  }
  const click = event => {
    try {
      const action = event.target.closest('[data-action]');
      if (action && root.contains(action)) { handleAction(action); return; }
      const timeline = event.target.closest('.audio-composer__timeline');
      if (timeline && selectedClipId) {
        const track = draft.tracks.find(item => item.id === timeline.dataset.trackId);
        const clip = track?.clips.find(item => item.id === selectedClipId);
        if (!clip) return;
        const beat = Math.round((event.clientX - timeline.getBoundingClientRect().left) / timeline.clientWidth * draft.lengthBars * draft.beatsPerBar);
        clip.startBeat = Math.max(0, Math.min(beat, draft.lengthBars * draft.beatsPerBar - clip.durationBeats));
        updated();
      }
    } catch (error) { setStatus(error.message,true); }
  };
  const input = event => {
    const element = event.target;
    const key = element.dataset.field;
    if (!key || (element.type !== 'number' && element.type !== 'text')) return;
    const target = key.startsWith('track.') ? getTrack() : key.startsWith('clip.') ? getClip() : draft;
    target[key.split('.').at(-1)] = element.type === 'number' ? Number(element.value) : element.value;
    dirty = true;
    stop();
    const saveButton = root.querySelector('[data-action="save"]');
    if (saveButton) saveButton.textContent = 'Save *';
  };
  const change = event => {
    const element = event.target;
    try {
      if (element.dataset.action === 'select-composition') {
        stop(); compositionId = element.value; draft = validateComposition(currentPack.compositions.find(item => item.id === compositionId));
        selectedTrackId = draft.tracks[0]?.id || null; selectedClipId = null; dirty = false; render(); return;
      }
      const key = element.dataset.field;
      if (!key) return;
      const target = key.startsWith('track.') ? getTrack() : key.startsWith('clip.') ? getClip() : draft;
      const property = key.split('.').at(-1);
      target[property] = element.type === 'checkbox' ? element.checked : element.type === 'number' ? Number(element.value) : element.value;
      validateComposition(draft);
      updated();
    } catch (error) { setStatus(error.message,true); }
  };
  root.addEventListener('click',click);
  root.addEventListener('input',input);
  root.addEventListener('change',change);
  render();
  return {dispose() { if (disposed) return; disposed = true; stop(); player?.dispose(); context?.close(); root.removeEventListener('click',click); root.removeEventListener('input',input); root.removeEventListener('change',change); root.remove(); }};
}
