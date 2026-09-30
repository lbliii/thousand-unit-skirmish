// Bounded declarative regions share grid coordinates with terrain and objectives.
import { UNIT_DEFINITIONS } from './gameplay-definitions.mjs';
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function validateScenarioRegions(definition) {
  const regions = definition.regions ?? [];
  if (!Array.isArray(regions) || regions.length > 32) throw new Error('Map may contain at most 32 named regions.');
  const ids = new Set();
  for (const region of regions) {
    const zone = region?.zone;
    if (!region || !idPattern.test(region.id) || typeof region.id !== 'string' || region.id.length > 48 || ids.has(region.id)
      || typeof region.name !== 'string' || !region.name.trim() || region.name.length > 48
      || !zone || !['column', 'row', 'width', 'height'].every((key) => Number.isInteger(zone[key]))
      || zone.column < 0 || zone.row < 0 || zone.width < 1 || zone.height < 1
      || zone.column + zone.width > definition.width || zone.row + zone.height > definition.height) {
      throw new Error('Map contains an invalid named region.');
    }
    ids.add(region.id);
  }
  return regions;
}
export function validRegionEntryTrigger(trigger, regions) {
  return trigger?.type === 'region-entry' && !Array.isArray(trigger)
    && Object.keys(trigger).every((key) => ['type', 'regionId', 'team', 'unitKind', 'minimumUnits'].includes(key))
    && regions.some((region) => region.id === trigger.regionId)
    && ['0', '1', 'either'].includes(trigger.team)
    && (trigger.unitKind === undefined || Object.hasOwn(UNIT_DEFINITIONS, trigger.unitKind))
    && (trigger.minimumUnits === undefined || (Number.isInteger(trigger.minimumUnits)
      && trigger.minimumUnits >= 1 && trigger.minimumUnits <= 1000));
}
// First qualifying presence activates once. Initial occupants qualify when the match clock starts.
// Team 0 wins a simultaneous either-team tie; this is independent of unit iteration order.
export function regionEntryTeam(trigger, regions, units, width, height) {
  const region = regions.find((item) => item.id === trigger.regionId);
  if (!region) return -1;
  const counts = [0, 0];
  const zone = region.zone;
  for (const unit of units) {
    if (unit.hp <= 0 || (trigger.unitKind && unit.kind !== trigger.unitKind)) continue;
    const column = Math.floor(unit.x + width / 2);
    const row = Math.floor(unit.z + height / 2);
    if (column >= zone.column && column < zone.column + zone.width
      && row >= zone.row && row < zone.row + zone.height) counts[unit.team]++;
  }
  return (trigger.team === 'either' ? [0, 1] : [Number(trigger.team)])
    .find((team) => counts[team] >= (trigger.minimumUnits ?? 1)) ?? -1;
}
