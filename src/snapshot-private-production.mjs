/** Reuse the public no-fog roster while withholding each seat's private production metadata. */
export function privateProductionView(payload, team) {
  if (team === null) return payload;
  const mask = (rows) => rows.map((building) => building.team === team ? building : {
    ...building, productionQueue: [],
    ...(Array.isArray(building.productionOptions) ? { productionOptions: [] } : {}),
    ...(Array.isArray(building.researchOptions) ? { researchOptions: [] } : {}),
  });
  return {
    ...payload,
    ...(Array.isArray(payload.population) ? { population: payload.population.map((record, owner) => owner === team ? record : null) } : {}),
    buildings: mask(payload.buildings),
    ...(Array.isArray(payload.homeTownCenters) ? { homeTownCenters: mask(payload.homeTownCenters) } : {}),
  };
}
