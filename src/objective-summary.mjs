// Uses only the objective state already disclosed to this client.
const time = (value) => {
  const seconds = Math.ceil(Math.max(0, Number(value) || 0));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
export function objectiveSummary(definition = {}, states = [], { team = null, hold, elapsed = 0, started = false, winner = -1 } = {}) {
  const triggers = definition.triggers || [];
  const byId = new Map(states.map((state) => [state.id, state]));
  const urgent = [];
  if (winner >= 0) return { action: winner === 2 ? 'Match drawn' : `${winner === 0 ? 'Azure' : 'Ember'} wins`, urgent: '' };
  if (started) {
    for (let index = 0; index < 2; index++) {
      if (hold?.activeTeams?.[index]) urgent.push(`${index === 0 ? 'Azure' : 'Ember'} wins in ${time((definition.victoryHoldSeconds || 0) - (hold.progressSeconds?.[index] || 0))}`);
    }
    if (definition.timedVictory) {
      const zone = triggers.find((item) => item.id === definition.timedVictory.objectiveId);
      urgent.push(`Deadline ${time(definition.timedVictory.afterSeconds - elapsed)} · ${zone?.name || 'decisive zone'}`);
    }
  }
  if (team !== 0 && team !== 1) return { action: 'Spectating · open objectives for the win rule', urgent: urgent.join(' · ') };
  const victories = triggers.filter((item) => item.victory);
  const pending = victories.filter((item) => byId.get(item.id)?.owner !== team);
  const alreadyWinning = definition.victoryMode !== 'all' && victories.some((item) => byId.get(item.id)?.owner === team);
  let target = alreadyWinning ? null : pending[0];
  if (!victories.length && definition.timedVictory) target = triggers.find((item) => item.id === definition.timedVictory.objectiveId);
  // Follow authored prerequisite chains, guarding malformed/cyclic input.
  const seen = new Set();
  while (target && !seen.has(target.id)) {
    seen.add(target.id);
    const requires = target.requiresAll || (target.requires ? [target.requires] : []);
    const missing = requires.find((id) => byId.get(id)?.owner !== team);
    if (!missing) break;
    const prerequisite = triggers.find((item) => item.id === missing);
    if (!prerequisite || seen.has(prerequisite.id)) break;
    target = prerequisite;
  }
  const action = target ? `Capture ${target.name} · ${target.requiredUnits} units`
    : victories.length ? 'Defend your victory zones' : 'Eliminate the opposing army';
  return { action, urgent: urgent.join(' · ') };
}

export function rememberNotice(history, message, now = Date.now()) {
  const text = String(message || '').trim();
  if (!text) return history;
  const existing = history.find((notice) => notice.text === text && now - notice.at < 15000);
  const item = { text, count: (existing?.count || 0) + 1, at: now };
  return [item, ...history.filter((notice) => notice !== existing)].slice(0, 12);
}
