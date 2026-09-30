import { MAX_SOURCE_BYTES, validateAudioPack } from './audio-assets.mjs';

const EVENT_KEYS = [
  'unit.worker.ready', 'unit.worker.death', 'unit.worker.repair', 'unit.infantry.ready', 'unit.infantry.death',
  'unit.archer.ready', 'unit.archer.death', 'cue.stop', 'cue.hold', 'cue.ready', 'cue.death', 'cue.repair',
  'unit.worker.select', 'unit.worker.gather.wood', 'unit.worker.gather.food', 'unit.worker.move',
  'building.town-center.select', 'building.barracks.select', 'building.archery-range.select',
  'cue.select', 'cue.move', 'cue.attack', 'cue.build', 'cue.victory', 'cue.defeat',
];

const element = (tag, attributes = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'value') node.value = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value != null) node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
};
const button = (label, action, className = '') => element('button', { type: 'button', class: className, text: label, onclick: action });
const label = (name, input) => element('label', { class: 'field' }, [element('span', { text: name }), input]);
const textInput = (value, onChange, placeholder = '') => element('input', { type: 'text', value, placeholder, onchange: (event) => onChange(event.target.value) });
const numberInput = (value, onChange, { min = 0, max = 999999, step = 'any', placeholder = '' } = {}) => element('input', {
  type: 'number', value: value ?? '', min, max, step, placeholder,
  onchange: (event) => onChange(event.target.value === '' ? undefined : Number(event.target.value)),
});
const select = (items, value, onChange) => {
  const node = element('select', { onchange: (event) => onChange(event.target.value) });
  for (const [key, name] of items) node.append(element('option', { value: key, text: name }));
  node.value = value;
  return node;
};
const makeId = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;

export function mountAudioLibrary(container, { store }) {
  let pack = null;
  let sourceBlobs = {};
  let packSummaries = [];
  let profileId = null;
  let tab = 'library';
  let query = '';
  let disposed = false;
  let composer = null;
  let composerStyle = null;
  let previewUrl = null;
  const root = element('div', { class: 'studio-app' });
  const flash = element('div', { class: 'studio-flash', role: 'status', 'aria-live': 'polite' });
  container.replaceChildren(root);

  function message(value, error = false) {
    flash.textContent = value;
    flash.classList.toggle('error', error);
  }
  async function run(action) {
    try { await action(); } catch (error) { message(error?.message || String(error), true); }
  }
  async function refreshPacks() { packSummaries = await store.listPacks(); }
  async function choosePack(id) {
    const loaded = await store.loadPack(id);
    if (!loaded) throw new Error(`Pack ${id} was not found`);
    pack = loaded.pack;
    sourceBlobs = loaded.sourceBlobs;
    profileId = pack.profiles.some((p) => p.id === profileId) ? profileId : pack.profiles[0]?.id || null;
    render();
  }
  async function save(changedBlobs = {}) {
    pack = await store.savePack(pack, changedBlobs);
    await refreshPacks();
    message(`Saved ${pack.name}`);
    render();
  }
  function edit(mutator) {
    run(async () => {
      const before = structuredClone(pack);
      const previousBlobs = { ...sourceBlobs };
      mutator();
      try { validateAudioPack(pack); await save(); }
      catch (error) { pack = before; sourceBlobs = previousBlobs; throw error; }
    });
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = element('a', { href: url, download: name });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function stopPreview() {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    root.querySelectorAll('audio').forEach((audio) => { audio.pause(); audio.remove(); });
  }
  function preview(sourceId, target) {
    stopPreview();
    const blob = sourceBlobs[sourceId];
    if (!blob) return message(`Original bytes missing for ${sourceId}`, true);
    previewUrl = URL.createObjectURL(blob);
    const audio = element('audio', { controls: '', src: previewUrl });
    audio.onerror = () => message('This browser cannot decode this recording. Original bytes remain stored.', true);
    target.append(audio);
    audio.play().catch(() => {});
  }

  function libraryPanel() {
    const panel = element('section', { class: 'studio-panel' });
    panel.append(element('div', { class: 'section-heading' }, [
      element('div', {}, [element('h2', { text: 'Raw source library' }), element('p', { text: 'Original recordings and provenance stay intact. Edits belong to event variants and clips.' })]),
      button('Import audio', () => root.querySelector('#source-upload').click(), 'primary'),
    ]));
    const upload = element('input', { id: 'source-upload', type: 'file', accept: 'audio/*,.wav,.mp3,.ogg,.flac,.m4a', multiple: '' });
    upload.hidden = true;
    upload.addEventListener('change', () => run(async () => {
      const files = [...upload.files];
      if (files.length + pack.sources.length > 128) throw new Error('A pack supports at most 128 sources');
      for (const file of files) {
        if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name}: source must be between 1 byte and 16 MiB`);
        if (!file.type.startsWith('audio/') && !/\.(wav|mp3|ogg|flac|m4a)$/i.test(file.name)) throw new Error(`${file.name}: choose an audio recording`);
      }
      const previous = structuredClone(pack);
      const oldBlobs = { ...sourceBlobs };
      const changedBlobs = {};
      for (const file of files) {
        const sourceId = makeId('source');
        pack.sources.push({ id: sourceId, name: file.name.replace(/\.[^.]+$/, ''), fileName: file.name,
          mimeType: file.type || 'application/octet-stream', tags: [], provenance: {} });
        sourceBlobs[sourceId] = file;
        changedBlobs[sourceId] = file;
      }
      try { await save(changedBlobs); message(`Imported ${files.length} original recording${files.length === 1 ? '' : 's'}`); }
      catch (error) { pack = previous; sourceBlobs = oldBlobs; throw error; }
    }));
    panel.append(upload);
    panel.append(label('Search names, files and tags', element('input', { type: 'search', value: query, placeholder: 'Search sources', oninput: (event) => {
      query = event.target.value.toLowerCase();
      panel.querySelectorAll('.source-card').forEach((card) => { card.hidden = !card.dataset.search.includes(query); });
    } })));
    const cards = element('div', { class: 'source-grid' });
    for (const source of pack.sources) {
      const card = element('article', { class: 'source-card' });
      card.dataset.search = `${source.name} ${source.fileName} ${source.tags.join(' ')}`.toLowerCase();
      card.hidden = !card.dataset.search.includes(query);
      const previewBox = element('div', { class: 'preview-box' });
      card.append(element('div', { class: 'card-heading' }, [element('strong', { text: source.name }),
        button('Play', () => preview(source.id, previewBox))]));
      card.append(element('small', { text: `${source.fileName} · ${(sourceBlobs[source.id]?.size / 1024 || 0).toFixed(0)} KiB · ${source.mimeType}` }));
      card.append(previewBox);
      card.append(label('Display name', textInput(source.name, (value) => edit(() => { source.name = value; }))));
      card.append(label('Tags, comma separated', textInput(source.tags.join(', '), (value) => edit(() => { source.tags = value.split(',').map((x) => x.trim()).filter(Boolean); }))));
      card.append(label('Provider or source', textInput(source.provenance.provider || '', (value) => edit(() => {
        if (value.trim()) source.provenance.provider = value.trim(); else delete source.provenance.provider;
      }))));
      card.append(label('Prompt or recording notes', textInput(source.provenance.prompt || '', (value) => edit(() => {
        if (value.trim()) source.provenance.prompt = value.trim(); else delete source.provenance.prompt;
      }))));
      card.append(button('Remove source', () => edit(() => {
        pack.sources = pack.sources.filter((item) => item.id !== source.id);
        delete sourceBlobs[source.id];
      }), 'quiet danger'));
      cards.append(card);
    }
    panel.append(cards);
    if (!pack.sources.length) panel.append(element('p', { class: 'empty-state', text: 'Import WAV, MP3, OGG, FLAC or M4A recordings to begin. Playback depends on browser codec support.' }));
    return panel;
  }

  function profilePanel() {
    const panel = element('section', { class: 'studio-panel' });
    panel.append(element('div', { class: 'section-heading' }, [
      element('div', {}, [element('h2', { text: 'Event assignments' }), element('p', { text: 'Choose a source for each unit, building or existing cue event. Variants rotate in a match.' })]),
      button('New profile', () => edit(() => { const id = makeId('profile'); pack.profiles.push({ id, name: 'New profile', bindings: {}, music: {} }); profileId = id; }), 'primary'),
    ]));
    if (!pack.profiles.length) return panel;
    const profile = pack.profiles.find((item) => item.id === profileId) || pack.profiles[0];
    panel.append(label('Profile', select(pack.profiles.map((item) => [item.id, item.name]), profile.id, (id) => { profileId = id; render(); })));
    panel.append(label('Profile name', textInput(profile.name, (value) => edit(() => { profile.name = value; }))));
    panel.append(button('Remove profile', () => edit(() => {
      pack.profiles = pack.profiles.filter((item) => item.id !== profile.id);
      profileId = pack.profiles[0]?.id || null;
    }), 'quiet danger'));
    panel.append(element('h3', { text: 'Map music' }));
    panel.append(label('Default composition', select([['', 'None'], ...pack.compositions.map((item) => [item.id, item.name])],
      profile.music.defaultCompositionId || '', (value) => edit(() => {
        if (value) profile.music.defaultCompositionId = value; else delete profile.music.defaultCompositionId;
      }))));
    panel.append(element('h3', { text: 'Bind an event' }));
    const custom = textInput('', () => {}, 'cue.custom-event');
    const suggested = select([['', 'Choose an event'], ...EVENT_KEYS.map((key) => [key, key])], '', () => {});
    panel.append(element('div', { class: 'inline-controls' }, [suggested, custom,
      button('Add event', () => run(async () => {
        const key = custom.value.trim() || suggested.value;
        if (!key) throw new Error('Choose or enter an event key');
        if (profile.bindings[key]) throw new Error(`${key} is already assigned`);
        if (!pack.sources.length) throw new Error('Import an audio source first');
        edit(() => { profile.bindings[key] = { bus: 'voice', variants: [{ sourceId: pack.sources[0].id }] }; });
      }), 'primary')]));
    for (const [key, binding] of Object.entries(profile.bindings)) {
      const card = element('article', { class: 'binding-card' });
      card.append(element('div', { class: 'card-heading' }, [element('strong', { text: key }),
        button('Remove event', () => edit(() => { delete profile.bindings[key]; }), 'quiet danger')]));
      card.append(element('div', { class: 'field-row' }, [
        label('Bus', select(['voice', 'effects', 'ambience'].map((x) => [x, x]), binding.bus, (value) => edit(() => { binding.bus = value; }))),
        label('Cooldown ms', numberInput(binding.cooldownMs, (value) => edit(() => { if (value == null) delete binding.cooldownMs; else binding.cooldownMs = value; }), { max: 600000 })),
        label('Priority', numberInput(binding.priority, (value) => edit(() => { if (value == null) delete binding.priority; else binding.priority = value; }), { min: -100, max: 100 })),
      ]));
      binding.variants.forEach((variant, index) => {
        const row = element('div', { class: 'variant-row' });
        row.append(label(`Variant ${index + 1}`, select(pack.sources.map((source) => [source.id, source.name]), variant.sourceId,
          (value) => edit(() => { variant.sourceId = value; }))));
        row.append(label('Gain', numberInput(variant.gain, (value) => edit(() => { if (value == null) delete variant.gain; else variant.gain = value; }), { max: 4, step: 0.05, placeholder: '1' })));
        row.append(label('Trim start s', numberInput(variant.trimStartSeconds, (value) => edit(() => { if (value == null) delete variant.trimStartSeconds; else variant.trimStartSeconds = value; }), { max: 3600, step: 0.01 })));
        row.append(label('Trim end s', numberInput(variant.trimEndSeconds, (value) => edit(() => { if (value == null) delete variant.trimEndSeconds; else variant.trimEndSeconds = value; }), { max: 3600, step: 0.01 })));
        row.append(label('Caption', textInput(variant.caption || '', (value) => edit(() => { if (value.trim()) variant.caption = value.trim(); else delete variant.caption; }))));
        row.append(button('Remove variant', () => edit(() => { binding.variants.splice(index, 1); }), 'quiet danger'));
        card.append(row);
      });
      card.append(button('Add variant', () => edit(() => { binding.variants.push({ sourceId: pack.sources[0].id }); })));
      panel.append(card);
    }
    return panel;
  }

  async function mountComposer(host) {
    try {
      const { mountAudioComposer } = await import('./audio-composer.mjs');
      if (disposed || tab !== 'composer' || !host.isConnected) return;
      if (!composerStyle) {
        composerStyle = element('link', { rel: 'stylesheet', href: './src/audio-composer.css' });
        document.head.append(composerStyle);
      }
      composer = mountAudioComposer(host, { pack, sourceBlobs, onChange: async (nextPack) => {
        pack = await store.savePack(nextPack);
        await refreshPacks();
        message('Composition saved');
      } });
    } catch (error) {
      host.replaceChildren(element('p', { class: 'empty-state', text: `Composer is unavailable: ${error.message}` }));
    }
  }

  function render() {
    composer?.dispose(); composer = null;
    stopPreview();
    const header = element('header', { class: 'studio-header' }, [
      element('div', {}, [element('span', { class: 'eyebrow', text: 'THOUSAND UNIT SKIRMISH · AUTHORING' }), element('h1', { text: 'Audio Studio' }),
        element('p', { text: 'Build portable sound packs for unit responses, buildings and map music.' })]),
      element('div', { class: 'studio-links' }, [element('a', { href: './audio-zones.html', class: 'game-link', text: 'Zone palettes' }), element('a', { href: './', class: 'game-link', text: '← Game' })]),
    ]);
    const sidebar = element('aside', { class: 'studio-sidebar' });
    sidebar.append(element('h2', { text: 'Packs' }));
    sidebar.append(button('New pack', () => run(async () => {
      const next = { schemaVersion: 1, id: makeId('pack'), name: 'Untitled pack', sources: [], profiles: [], compositions: [] };
      await store.savePack(next);
      await refreshPacks();
      await choosePack(next.id);
    }), 'primary'));
    const importInput = element('input', { type: 'file', accept: '.json,application/json' }); importInput.hidden = true;
    importInput.addEventListener('change', () => run(async () => {
      const imported = await store.importPack(importInput.files[0]);
      await refreshPacks(); await choosePack(imported.id);
      message(`Imported pack ${imported.name}`);
    }));
    sidebar.append(importInput, button('Import pack backup', () => importInput.click()));
    for (const summary of packSummaries) sidebar.append(button(`${summary.name} · ${summary.sourceCount} sources`, () => run(() => choosePack(summary.id)),
      summary.id === pack?.id ? 'pack-choice selected' : 'pack-choice'));
    sidebar.append(element('p', { class: 'small-note', text: 'Backups include raw recordings. Other players must install the same pack; audio is not automatically sent through multiplayer.' }));
    const main = element('main', { class: 'studio-main' });
    if (pack) {
      const title = element('div', { class: 'pack-heading' }, [
        label('Pack name', textInput(pack.name, (value) => edit(() => { pack.name = value; }))),
        button('Export backup', () => run(async () => download(await store.exportPack(pack.id), `${pack.id}.audio-pack.json`))),
        button('Delete pack', () => run(async () => {
          if (!confirm(`Delete ${pack.name} and its original audio from this browser? Export a backup first if needed.`)) return;
          await store.deletePack(pack.id); await refreshPacks(); pack = null; sourceBlobs = {}; render();
        }), 'quiet danger'),
      ]);
      main.append(title);
      const tabs = element('nav', { class: 'studio-tabs', 'aria-label': 'Audio Studio sections' });
      for (const [id, name] of [['library', 'Library'], ['assignments', 'Event assignments'], ['composer', 'Composer']]) {
        tabs.append(button(name, () => { tab = id; render(); }, id === tab ? 'selected' : ''));
      }
      main.append(tabs);
      if (tab === 'library') main.append(libraryPanel());
      if (tab === 'assignments') main.append(profilePanel());
      if (tab === 'composer') {
        const host = element('section', { class: 'studio-panel composer-host' });
        main.append(host);
        void mountComposer(host);
      }
    } else main.append(element('div', { class: 'empty-state', text: 'Create a pack or import a backup to start.' }));
    root.replaceChildren(header, element('div', { class: 'studio-layout' }, [sidebar, main]), flash);
  }

  run(async () => { await refreshPacks(); render(); });
  return { dispose() { disposed = true; composer?.dispose(); composerStyle?.remove(); stopPreview(); container.replaceChildren(); } };
}
