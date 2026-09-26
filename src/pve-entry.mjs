import { parseUint32Seed } from './pve-match.mjs';

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;

function launchOptionsFrom(value) {
  const options = value?.launchOptions && typeof value.launchOptions === 'object'
    ? value.launchOptions : value;
  if (options?.mode !== 'pve' && value?.mode !== 'pve') return null;
  try {
    return {
      mode: 'pve',
      mapSeed: parseUint32Seed(options?.mapSeed ?? value?.mapSeed, 'PvE map seed'),
      policySeed: parseUint32Seed(options?.policySeed ?? value?.policySeed, 'PvE policy seed'),
      mapId: value?.roomMetadata?.mapId ?? value?.mapId ?? null,
    };
  } catch {
    return null;
  }
}

export function createPveRoomUrl(currentUrl, response) {
  if (!ROOM_ID_PATTERN.test(response?.roomId || '')) throw new TypeError('Room creation returned an invalid room ID.');
  const options = launchOptionsFrom(response);
  if (!options) throw new TypeError('Room creation did not return PvE launch options.');
  const url = new URL(currentUrl);
  url.searchParams.set('room', response.roomId);
  url.searchParams.set('mode', 'pve');
  url.searchParams.set('mapSeed', String(options.mapSeed));
  url.searchParams.set('policySeed', String(options.policySeed));
  url.searchParams.delete('mapId');
  url.hash = '';
  return url;
}

function addStyles(document) {
  if (document.querySelector('#pve-entry-styles')) return;
  const style = document.createElement('style');
  style.id = 'pve-entry-styles';
  style.textContent = `
    .map-label.pve-run-active { flex-wrap:wrap; }
    .pve-run-stamp { display:flex; flex:1 0 100%; flex-wrap:wrap; align-items:center; gap:4px 10px; min-width:0; margin-top:4px; padding-top:4px; border-top:1px solid rgba(230,238,217,.12); color:#b7c1ad; font:500 8px 'DM Mono',monospace; letter-spacing:.06em; white-space:normal; }
    .pve-run-stamp[hidden] { display:none; }
    .pve-run-kicker { color:#d5ef78; }
    .pve-run-seed { color:#8f9b8b; white-space:normal; }
    .pve-entry-status { max-width:220px; overflow:hidden; color:#d5ef78; font:500 8px 'DM Mono',monospace; text-overflow:ellipsis; white-space:nowrap; }
    .pve-entry-status[data-error="true"] { color:#f0957a; }
    @media (max-width:760px) { .pve-run-stamp { gap:4px 6px; font-size:7px; } }
  `;
  document.head.append(style);
}

function addRunStamp(document, mapLabel) {
  const stamp = document.createElement('div');
  stamp.className = 'pve-run-stamp';
  stamp.hidden = true;
  const kicker = document.createElement('span');
  kicker.className = 'pve-run-kicker';
  kicker.textContent = 'PLAY VS AI';
  const map = document.createElement('b');
  map.className = 'pve-run-map';
  map.textContent = 'LOADING MAP';
  const mapSeed = document.createElement('span');
  mapSeed.className = 'pve-run-seed pve-run-map-seed';
  const policySeed = document.createElement('span');
  policySeed.className = 'pve-run-seed pve-run-policy';
  stamp.append(kicker, map, mapSeed, policySeed);
  mapLabel.append(stamp);
  return { stamp, map, mapSeed, policySeed };
}

function mountPveEntry() {
  const document = window.document;
  const actions = document.querySelector('.room-actions');
  const mapLabelContainer = document.querySelector('.map-label');
  if (!actions || !mapLabelContainer || document.querySelector('#pve-start')) return;
  addStyles(document);

  const start = document.createElement('button');
  start.id = 'pve-start';
  start.className = 'room-action room-action-primary';
  start.type = 'button';
  start.textContent = 'PLAY VS AI';
  start.hidden = true;
  start.title = 'Start a fresh match against the deterministic opponent';

  const newMap = document.createElement('button');
  newMap.id = 'pve-new-map';
  newMap.className = 'room-action room-action-primary';
  newMap.type = 'button';
  newMap.textContent = 'NEW MAP';
  newMap.hidden = true;
  newMap.title = 'Start a new Play vs AI match with fresh map and policy seeds';

  const feedback = document.createElement('span');
  feedback.id = 'pve-entry-status';
  feedback.className = 'pve-entry-status';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  const insertBefore = actions.querySelector('#room-join') || actions.querySelector('#room-invite');
  actions.insertBefore(start, insertBefore);
  actions.insertBefore(newMap, insertBefore);
  actions.append(feedback);

  const run = addRunStamp(document, mapLabelContainer);
  const roomCreate = document.querySelector('#room-create');
  const roomJoin = document.querySelector('#room-join');
  const location = new URL(window.location.href);
  let roomsEnabled = false;
  let currentOptions = launchOptionsFrom({
    mode: location.searchParams.get('mode'),
    mapSeed: location.searchParams.get('mapSeed'),
    policySeed: location.searchParams.get('policySeed'),
  });

  const setStatus = (message = '', error = false) => {
    feedback.textContent = message;
    feedback.dataset.error = String(error);
  };
  const setMode = (options) => {
    currentOptions = options;
    const isPve = Boolean(options);
    start.hidden = !roomsEnabled || isPve;
    newMap.hidden = !roomsEnabled || !isPve;
    run.stamp.hidden = !isPve;
    mapLabelContainer.classList.toggle('pve-run-active', isPve);
    if (isPve) {
      if (roomCreate) roomCreate.hidden = true;
      if (roomJoin) roomJoin.hidden = true;
    } else if (roomsEnabled) {
      if (roomCreate) roomCreate.hidden = false;
      if (roomJoin) roomJoin.hidden = false;
    }
    const mapPicker = document.querySelector('#map-select')?.closest('.map-picker');
    if (mapPicker) mapPicker.hidden = isPve;
    const studio = document.querySelector('#map-studio-open');
    if (studio) studio.hidden = isPve;
    if (isPve) {
      for (const button of document.querySelectorAll('.size-options button')) {
        button.disabled = true;
        button.title = 'Play vs AI uses the map’s authored starting army.';
      }
    } else {
      const resetButton = document.querySelector('#reset-army');
      if (resetButton) {
        for (const button of document.querySelectorAll('.size-options button')) {
          button.disabled = resetButton.disabled;
          button.title = resetButton.disabled
            ? 'Only the room host can change match size' : 'Change match size for both players';
        }
      }
    }
    if (isPve) {
      run.mapSeed.textContent = `MAP SEED ${options.mapSeed}`;
      run.policySeed.textContent = `POLICY SEED ${options.policySeed}`;
    }
  };
  setMode(currentOptions);

  const armySection = document.querySelector('.army-section');
  if (armySection && typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      if (!currentOptions) return;
      for (const button of document.querySelectorAll('.size-options button')) {
        // Reflected attribute writes enqueue mutations even if already true.
        // Only correct changes so this observer cannot starve rendering.
        if (!button.disabled) button.disabled = true;
        button.title = 'Play vs AI uses the map’s authored starting army.';
      }
    }).observe(armySection, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
  }
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      if (!currentOptions) return;
      if (roomCreate && !roomCreate.hidden) roomCreate.hidden = true;
      if (roomJoin && !roomJoin.hidden) roomJoin.hidden = true;
    }).observe(actions, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }

  const updateMapLabel = () => {
    if (!currentOptions) return;
    const label = document.querySelector('#footer-map-name')?.textContent?.trim();
    if (label) run.map.textContent = label;
  };
  const mapLabel = document.querySelector('#footer-map-name');
  if (mapLabel && typeof MutationObserver === 'function') {
    new MutationObserver(updateMapLabel).observe(mapLabel, { childList: true, characterData: true, subtree: true });
  }
  updateMapLabel();

  async function createNewMatch(button) {
    if (button.disabled) return;
    button.disabled = true;
    setStatus('CREATING FRESH MATCH…');
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'pve' }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Room creation failed.');
      window.location.assign(createPveRoomUrl(window.location.href, result).href);
    } catch (error) {
      setStatus(String(error?.message || 'ROOM CREATION FAILED').toUpperCase(), true);
      button.disabled = false;
    }
  }
  start.addEventListener('click', () => createNewMatch(start));
  newMap.addEventListener('click', () => createNewMatch(newMap));

  fetch('/api/rooms/status', { cache: 'no-store' })
    .then((response) => response.ok ? response.json() : null)
    .then((status) => {
      if (status?.enabled !== true) return;
      roomsEnabled = true;
      setMode(currentOptions);
    })
    .catch(() => {});

  if (location.searchParams.has('room') && ROOM_ID_PATTERN.test(location.searchParams.get('room') || '')) {
    fetch(`/api/rooms/${encodeURIComponent(location.searchParams.get('room'))}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((room) => {
        const fromRoom = launchOptionsFrom(room);
        if (fromRoom) {
          setMode(fromRoom);
          updateMapLabel();
        } else if (room) {
          setMode(null);
          const cleanUrl = new URL(window.location.href);
          for (const name of ['mode', 'mapSeed', 'policySeed', 'mapId']) cleanUrl.searchParams.delete(name);
          window.history.replaceState(window.history.state, '', cleanUrl.href);
        }
      })
      .catch(() => {});
  }
}

if (typeof window !== 'undefined') {
  if (window.document.readyState === 'loading') {
    window.document.addEventListener('DOMContentLoaded', mountPveEntry, { once: true });
  } else {
    mountPveEntry();
  }
}
