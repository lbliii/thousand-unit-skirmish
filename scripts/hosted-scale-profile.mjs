export function parseScaleProfile(args) {
  const keys = ['--stress-counts=', '--stress-seconds=', '--stress-waves='];
  if (args.some(arg => arg.startsWith('--stress-') && !keys.some(key => arg.startsWith(key)))) {
    throw new Error('Unknown or incomplete --stress option');
  }
  const values = keys.map(key => {
    const matches = args.filter(arg => arg.startsWith(key));
    if (matches.length > 1) throw new Error(`Duplicate ${key}`);
    return matches[0]?.slice(key.length);
  });
  if (values.some(value => value !== undefined) && !args.includes('--stress')) {
    throw new Error('Scale options require --stress');
  }
  const counts = (values[0] ?? '2000').split(',').map(Number);
  const seconds = Number(values[1] ?? 10);
  const waves = Number(values[2] ?? 1);
  if (!counts.length || counts.length > 4 || new Set(counts).size !== counts.length
    || counts.some(count => ![250, 500, 1000, 2000].includes(count))) {
    throw new Error('--stress-counts must list distinct supported sizes: 250,500,1000,2000');
  }
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 40) {
    throw new Error('--stress-seconds must be an integer from 10 to 40');
  }
  if (!Number.isInteger(waves) || waves < 1 || waves > 3) {
    throw new Error('--stress-waves must be an integer from 1 to 3');
  }
  return { counts, seconds, waves };
}

// One tagged order per seat/window. These are client-observed intervals, not RTT
// or authoritative simulation timings. Movement means the first selected unit
// displaced at least 0.05 world units from its pre-send position.
export function createOrderProbe({ token, ids, units, startedAt }) {
  const selected = new Set(ids);
  const positions = new Map(units.filter(row => selected.has(row[0]))
    .map(row => [row[0], [row[2], row[3], row[8]]]));
  let acknowledgedMs = null;
  let appliedMs = null;
  let movementMs = null;
  let appliedUnits = null;
  let finalNotice = null;
  return {
    observe(message, at) {
      if (at < startedAt) return;
      if (message.type === 'notice' && message.clientOrderToken === token) {
        acknowledgedMs ??= at - startedAt;
        finalNotice = message.message;
        const applied = /^(?:ATTACK )?MOVE ORDER · (\d+) UNITS$/.exec(message.message);
        if (applied) {
          appliedMs ??= at - startedAt;
          appliedUnits = Number(applied[1]);
        }
      }
      if (message.type === 'state' && movementMs === null) {
        if (message.units.some(row => {
          const start = positions.get(row[0]);
          return start && row[8] === start[2] && row[4] > 0
            && Math.hypot(row[2] - start[0], row[3] - start[1]) >= 0.05;
        })) movementMs = at - startedAt;
      }
    },
    report() {
      const round = value => value === null ? null : Number(value.toFixed(3));
      return { selectedUnits: selected.size, baselineUnits: positions.size,
        acknowledgedMs: round(acknowledgedMs), appliedMs: round(appliedMs),
        firstMovementMs: round(movementMs), appliedUnits, finalNotice };
    },
  };
}
