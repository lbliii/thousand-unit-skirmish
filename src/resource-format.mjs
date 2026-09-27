// Display whole resource units conservatively. Never round a stock up to a cost,
// or a positive shortfall down to zero. Gameplay comparisons keep exact values.
export function formatResourceStock(value) {
  return Math.floor(Math.max(0, value)).toLocaleString();
}

export function formatResourceRequirement(value) {
  return Math.ceil(Math.max(0, value)).toLocaleString();
}
