// Scenario-only snapshots are bounded independently of terrain and gameplay state.
export class ScenarioEditHistory {
  constructor(limit = 64) { this.limit = limit; this.clear(); }
  clear() { this.states = []; this.index = -1; }
  record(state) {
    const encoded = JSON.stringify(state);
    if (this.states[this.index] === encoded) return;
    this.states.splice(this.index + 1);
    this.states.push(encoded);
    if (this.states.length > this.limit + 1) this.states.shift();
    this.index = this.states.length - 1;
  }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.states.length - 1; }
  undo() { return this.canUndo ? JSON.parse(this.states[--this.index]) : null; }
  redo() { return this.canRedo ? JSON.parse(this.states[++this.index]) : null; }
}
export function regionGestureZone(drag, width, height) {
  const { start, current, zone } = drag;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (drag.tool === 'region-move') return { ...zone,
    column: clamp(zone.column + current.column - start.column, 0, width-zone.width),
    row: clamp(zone.row + current.row-start.row, 0, height-zone.height) };
  if (drag.tool === 'region-resize') return { ...zone,
    width: clamp(current.column-zone.column+1, 1, width-zone.column),
    height: clamp(current.row-zone.row+1, 1, height-zone.row) };
  const column = clamp(Math.min(start.column,current.column),0,width-1);
  const row = clamp(Math.min(start.row,current.row),0,height-1);
  return {column,row,width:clamp(Math.abs(start.column-current.column)+1,1,width-column),
    height:clamp(Math.abs(start.row-current.row)+1,1,height-row)};
}
