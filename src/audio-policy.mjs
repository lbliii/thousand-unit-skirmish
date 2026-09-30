// Audio decisions live outside the renderer so every unit snapshot can be reduced
// to a few meaningful events rather than a sound per unit.
export function cueForNotice(message, { localTeam = null, tokenized = false } = {}) {
  const notice = String(message || '').toUpperCase();
  const teamName = localTeam === 0 ? 'AZURE' : localTeam === 1 ? 'EMBER' : null;
  if (!notice) return null;
  if (teamName && notice.startsWith(`${teamName} `) && notice.includes(' DESTROYED ·')) return 'base-lost';
  if (notice.startsWith('RESOURCE NODE EMPTY ·')) return 'resource-empty';
  if (/(REJECTED|FAILED|UNAVAILABLE|UNREACHABLE|SERVER BUSY|CANCELLED|SUPERSEDED|MATCH OVER|UNIT CAP REACHED)/.test(notice)) return 'reject';
  if (notice.startsWith('RALLY POINT ')) return 'rally';
  if (/^(WORKER|INFANTRY|ARCHER) QUEUED ·/.test(notice)) return 'queue';
  if (/^.+ STARTED ·/.test(notice) && !notice.startsWith('PLANNING ')) return 'queue';
  if (teamName && (notice.startsWith(`${teamName} INFANTRY FORGING COMPLETE ·`)
    || notice.startsWith(`${teamName} ARCHER FLETCHING COMPLETE ·`))) return 'research-complete';
  if (notice.includes(' COMPLETE ·') && teamName && notice.startsWith(`${teamName} `)) return 'complete';
  if (teamName && notice.startsWith(`${teamName} `) && notice.endsWith(' READY')) return 'complete';
  // Tokenized build success is emitted by OrderAudioGate after BUILD ORDER, not while path planning.
  return null;
}

export function cueForScenarioEvent(message, { localTeam = null } = {}) {
  if (localTeam !== 0 && localTeam !== 1) return null;
  const affectedTeams = Array.isArray(message?.rewardTeams) ? message.rewardTeams
    : message?.team === 'both' ? [0, 1]
      : message?.team === 0 || message?.team === 1 ? [message.team] : [];
  return affectedTeams.includes(localTeam) ? 'scenario-reward' : null;
}

export function isLocalRejection(message) {
  return /^(NO |SELECT YOUR|SELECT WORKERS|SELECT MILITARY|SPECTATORS CANNOT|SERVER CONNECTION IS OFFLINE|COMMAND TOO LARGE|MOVE THE POINTER OVER)/
    .test(String(message || '').toUpperCase())
    || /( REJECTED| FAILED| QUEUE FULL| SITE BLOCKED| NEEDS \d+| TARGET UNREACHABLE)/
      .test(String(message || '').toUpperCase());
}

export class CombatAudioGate {
  constructor() {
    this.lastDamageAt = -Infinity;
    this.lastSelectedAt = -Infinity;
    this.lastBaseAt = -Infinity;
  }

  reset() {
    this.lastDamageAt = -Infinity;
    this.lastSelectedAt = -Infinity;
    this.lastBaseAt = -Infinity;
  }

  observe({ friendlyDamage = 0, selectedDamage = 0, buildingDamage = 0 }, now) {
    if (buildingDamage > 0 && now - this.lastBaseAt >= 12000) {
      this.lastBaseAt = now;
      this.lastDamageAt = now;
      return 'base-alert';
    }
    if (selectedDamage > 0 && now - this.lastSelectedAt >= 12000) {
      this.lastSelectedAt = now;
      this.lastDamageAt = now;
      return 'selected-alert';
    }
    if (friendlyDamage > 0) {
      const newEngagement = now - this.lastDamageAt >= 9000;
      this.lastDamageAt = now;
      if (newEngagement) return 'battle-alert';
    }
    return null;
  }
}

// Only authoritative local rows can produce lifecycle feedback. Absence is fog,
// not death. Each snapshot emits at most one representative per cue.
export class UnitLifecycleAudioGate {
  constructor() { this.reset(); }
  reset() { this.units = new Map(); this.tick = -1; }
  observe({ units = [], tick, localTeam, reset = false } = {}) {
    if (reset) this.reset();
    if (!Number.isSafeInteger(tick) || tick <= this.tick) return [];
    this.tick = tick;
    const events = new Map();
    const next = new Map();
    for (const row of units) {
      const [id, team, , , hp, kind, , , generation = 0] = row;
      if (team !== localTeam || ![0, 1].includes(localTeam)) continue;
      const previous = this.units.get(id);
      next.set(id, { generation, hp });
      if (reset) continue;
      if (hp > 0 && (!previous || previous.generation !== generation)) {
        if (!events.has('ready')) events.set('ready', { cue: 'ready', kind });
      } else if (previous?.generation === generation && previous.hp > 0 && hp <= 0) {
        if (!events.has('death')) events.set('death', { cue: 'death', kind });
      }
    }
    this.units = next;
    return [...events.values()];
  }
}

export class OrderAudioGate {
  constructor() { this.pending = new Map(); }
  reset() { this.pending.clear(); }
  sent(token, event) {
    this.pending.set(token, event);
    while (this.pending.size > 32) this.pending.delete(this.pending.keys().next().value);
  }
  observe(token, message) {
    const event = this.pending.get(token);
    if (!event || typeof message !== 'string') return null;
    if (/(FAILED|REJECTED|UNAVAILABLE|UNREACHABLE|EMPTY|SUPERSEDED|CANCELLED|MATCH OVER)/.test(message)) { this.pending.delete(token); return null; }
    if (!/^(?:STOP ORDER|HOLD POSITION ORDER|PATROL ORDER|FOLLOW ORDER|MOVE ORDER|ATTACK MOVE ORDER|WAYPOINT ORDER|WAYPOINT QUEUED|ATTACK ORDER|ATTACK BUILDING ORDER|GATHER ORDER|BUILD ORDER|BUILD RESUME ORDER|REPAIR ORDER) · /.test(message)) return null;
    this.pending.delete(token); return event;
  }
}

// The server supplies execution at row 14; legacy snapshots stay silent.
export function workAudioEvents(rows, { localTeam, x = 0, z = 0, radius = 24 } = {}) {
  if (![0, 1].includes(localTeam)) return [];
  const resources = new Set();
  for (const row of rows || []) {
    if (row[1] !== localTeam || row[4] <= 0 || row[5] !== 'worker'
      || (row[2] - x) ** 2 + (row[3] - z) ** 2 > radius ** 2) continue;
    if (['wood', 'food', 'repair'].includes(row[14])) resources.add(row[14]);
  }
  return [...resources].sort().map((resource) => ({ cue: 'work', kind: 'worker', resource }));
}
