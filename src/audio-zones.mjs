import { createGameAudio } from './audio.mjs';
import { createAudioLibraryStore } from './audio-library-store.mjs';
const ROOT = './assets/audio/vaelora-zones-v1/';
const $ = (id) => document.getElementById(id);
const catalog = await fetch(`${ROOT}catalog.json`).then((r) => { if (!r.ok) throw new Error('Zone catalog unavailable'); return r.json(); }).catch((error) => { $('coverage').textContent = error.message; throw error; });
const byId = new Map(catalog.sources.map((s) => [s.id, s]));
const families = { music: 'Everyday music', terrain: 'Landscape bed', contrast: 'Contrasting setting', signature: 'Regional signature' };
const notesKey = 'tus-zone-audio-review-v1';
let notes = {}; try { notes = JSON.parse(localStorage.getItem(notesKey) || '{}'); } catch {}
let selected, context, session = 0;
const buffers = new Map(), active = new Map();
const levels = { music: .35, terrain: .22, contrast: .18, signature: .4 };
let sequenceTimers = [];
const game = createGameAudio({ storage: null, onCue: (cue) => { $('caption').textContent = cue.replaceAll('-', ' '); } });
game.setSettings({ enabled: true, volume: .45, musicLevel: 0, ambience: false });
const report = (message) => { $('status').textContent = message; };
function stopTrack(id) { const item = active.get(id); if (item) { try { item.source.stop(); } catch {} item.source.disconnect(); item.gain.disconnect(); active.delete(id); } }
function stopAll() { session++; game.setSettings({ enabled: false }); for (const a of document.querySelectorAll('audio')) a.pause(); for (const id of [...active.keys()]) stopTrack(id); for (const t of sequenceTimers) clearTimeout(t); sequenceTimers = []; report('Stopped.'); }
async function getContext() { context ||= new AudioContext(); await context.resume(); return context; }
async function decode(source) { if (!buffers.has(source.id)) { const response = await fetch(ROOT + source.file); if (!response.ok) throw new Error(`${families[source.family]} could not load (${response.status})`); const bytes = await response.arrayBuffer(); const buffer = await context.decodeAudioData(bytes); buffers.set(source.id, buffer); while (buffers.size > 6) buffers.delete(buffers.keys().next().value); } return buffers.get(source.id); }
async function playTrack(source, ticket) {
  if (source.status !== 'downloaded') throw new Error(`${families[source.family]} is not available yet`);
  const ctx = await getContext(), buffer = await decode(source);
  if (ticket !== session) return;
  stopTrack(source.id);
  const node = ctx.createBufferSource(), gain = ctx.createGain();
  node.buffer = buffer; node.loop = $('repeat').checked && source.family !== 'signature';
  gain.gain.value = levels[source.family]; node.connect(gain).connect(ctx.destination);
  active.set(source.id, { source: node, gain });
  node.onended = () => { if (active.get(source.id)?.source === node) { active.delete(source.id); if (!active.size) report('Playback finished.'); } node.disconnect(); gain.disconnect(); };
  node.start(); report(`Playing ${selected.name}: ${families[source.family]}. Repeat ${$('repeat').checked ? 'on' : 'off'}.`);
}
function saveNotes() { if (!selected) return; notes[selected.id] = $('notes').value; try { localStorage.setItem(notesKey, JSON.stringify(notes)); } catch { report('Notes could not save locally. Export them before leaving.'); } }
function select(zone) {
  saveNotes(); stopAll(); selected = zone;
  for (const b of $('zones').children) b.setAttribute('aria-pressed', String(b.dataset.zone === zone.id));
  $('zone-name').textContent = zone.name; $('theme').textContent = zone.theme;
  $('mood').textContent = zone.mood; $('instruments').textContent = zone.instruments;
  $('notes').value = notes[zone.id] || ''; $('tracks').replaceChildren();
  const sources = zone.sources.map((id) => byId.get(id));
  for (const source of sources) {
    const row = document.createElement('div'); row.className = 'track';
    const title = document.createElement('h3'); title.textContent = families[source.family]; row.append(title);
    const controls = document.createElement('div'), label = document.createElement('label'), slider = document.createElement('input');
    slider.type = 'range'; slider.min = 0; slider.max = 1; slider.step = .01; slider.value = levels[source.family]; slider.setAttribute('aria-label', `${families[source.family]} volume`);
    slider.addEventListener('input', () => { levels[source.family] = Number(slider.value); const current = active.get(source.id); if (current) current.gain.gain.setTargetAtTime(levels[source.family], context.currentTime, .02); });
    label.append('Level ', slider); controls.append(label);
    const actions = document.createElement('div'); actions.className = 'actions';
    const play = document.createElement('button'); play.textContent = `Play ${families[source.family].toLowerCase()}`; play.disabled = source.status !== 'downloaded';
    play.addEventListener('click', () => { const ticket = session; void playTrack(source, ticket).catch((e) => report(e.message)); });
    const stop = document.createElement('button'); stop.textContent = 'Stop'; stop.setAttribute('aria-label', `Stop ${families[source.family].toLowerCase()}`); stop.addEventListener('click', () => stopTrack(source.id)); actions.append(play, stop); controls.append(actions);
    const status = document.createElement('p'); status.textContent = source.status === 'downloaded' ? `Original candidate · ${source.actualDurationSeconds?.toFixed(1) || source.durationSeconds || 'auto'} seconds · ${source.loop ? 'loop requested; seam awaits review' : 'one take'}` : 'Source pending'; controls.append(status); row.append(controls); $('tracks').append(row);
  }
  $('provenance').textContent = JSON.stringify(sources, null, 2);
  $('play').disabled = !sources.some((s) => s.status === 'downloaded'); report(`${sources.filter((s) => s.status === 'downloaded').length}/4 ingredients available. Choose a source or play the palette.`);
}
for (const zone of catalog.zones) { const button = document.createElement('button'); button.dataset.zone = zone.id; button.setAttribute('aria-pressed', 'false'); const name = document.createElement('span'); name.textContent = zone.name; const coverage = document.createElement('small'); coverage.textContent = `${zone.sources.filter((id) => byId.get(id)?.status === 'downloaded').length}/4 sources`; button.append(name, coverage); button.addEventListener('click', () => select(zone)); $('zones').append(button); }
$('coverage').textContent = `${new Set(catalog.zones.map((z) => z.zoneId)).size} zones · ${catalog.zones.length} palettes · ${catalog.sources.filter((s) => s.status === 'downloaded').length}/${catalog.sources.length} source recordings`;
$('play').addEventListener('click', () => { stopAll(); const ticket = session; const sources = selected.sources.map((id) => byId.get(id)).filter((s) => s.status === 'downloaded' && s.family !== 'signature'); void Promise.all(sources.map((s) => playTrack(s, ticket))).catch((e) => { if (ticket === session) { stopAll(); report(e.message); } }); });
$('stop').addEventListener('click', stopAll);
$('repeat').addEventListener('change', () => { for (const [id, a] of active) a.source.loop = $('repeat').checked && byId.get(id).family !== 'signature'; });
function playCue(cue) { game.setSettings({ enabled: true }); game.unlock(); const played = game.preview(cue); $('caption').textContent = played ? cue.replaceAll('-', ' ') : 'Game cue unavailable in this browser.'; }
const cues = ['select','move','attack','gather','rally','build','queue','complete','building-complete','research-complete','scenario-reward','resource-empty','reject','battle-alert','selected-alert','base-alert','base-lost','objective','objective-lost','victory','defeat','draw'];
for (const cue of cues) { const button = document.createElement('button'); button.textContent = cue.replaceAll('-', ' '); button.addEventListener('click', () => playCue(cue)); $('cues').append(button); }
$('sequence').addEventListener('click', () => { for (const t of sequenceTimers) clearTimeout(t); playCue('select'); sequenceTimers = ['move','queue','complete','battle-alert','base-alert','objective'].map((cue, i) => setTimeout(() => playCue(cue), (i + 1) * 1300)); });
for (const [name, file] of [['Wood token','wood-token'],['Iron latch','iron-latch'],['Muted pluck','muted-pluck'],['Horn','horn-note']]) { const label = document.createElement('label'); label.textContent = name; const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.src = `./assets/audio/vaelora-pilot-v1/sources/tus_ui_${file}_01_v001.mp3`; label.append(audio); $('ui-sources').append(label); }
$('notes').addEventListener('input', saveNotes);
$('export').addEventListener('click', () => { saveNotes(); const blob = new Blob([JSON.stringify({ format: 'tus-zone-audio-review-v1', exportedAt: new Date().toISOString(), notes }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = 'vaelora-audio-review.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopAll(); for (const a of document.querySelectorAll('audio')) a.pause(); } });
window.addEventListener('pagehide', (event) => { stopAll(); if (!event.persisted) { game.dispose(); void context?.close(); } });
select(catalog.zones[0]);

$('import-sources').addEventListener('click', async () => {
  const button = $('import-sources'); button.disabled = true;
  try {
    const store = createAudioLibraryStore(), id = 'vaelora-zone-sources-v1';
    if (await store.loadPack(id)) { $('import-status').textContent = 'The source pack is already in Audio Studio. Existing edits were preserved.'; return; }
    const sources = catalog.sources.filter((s) => s.status === 'downloaded');
    if (sources.length !== catalog.sources.length) throw new Error('Wait until every source is available before importing the complete pack.');
    const sourceBlobs = {};
    for (const [i, source] of sources.entries()) {
      $('import-status').textContent = `Saving source ${i + 1}/${sources.length}…`;
      const response = await fetch(ROOT + source.file); if (!response.ok) throw new Error(`Could not load ${source.id}`);
      sourceBlobs[source.id] = await response.blob();
    }
    const pack = { schemaVersion: 1, id, name: 'Vaelora — all-zone source candidates', compositions: [], profiles: [], sources: sources.map((s) => ({ id: s.id, name: s.id.replaceAll('-', ' '), fileName: s.file.split('/').at(-1), mimeType: 'audio/mpeg', tags: [s.zone,s.family,'candidate'], durationSeconds: s.actualDurationSeconds, sampleRate: s.sampleRate, channels: s.channels, provenance: { provider: 'ElevenLabs', prompt: s.prompt, model: s.model, createdAt: s.downloadedOn, attribution: `Flow node ${s.nodeId}; see repository catalog for hashes and settings` } })) };
    await store.savePack(pack, sourceBlobs);
    $('import-status').textContent = `${sources.length} originals saved to Audio Studio. Open it to edit sources, compose, and export a backup.`;
  } catch (error) { $('import-status').textContent = error.message; } finally { button.disabled = false; }
});
