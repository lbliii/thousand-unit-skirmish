// Regional identity is reusable; local layouts and gameplay rules belong to maps.
export const REGIONS = Object.freeze(Object.fromEntries([
  ['bellweather','Bellweather','meadow','bellweather'],
  ['underbough','Underbough','forest-floor','underbough'],
  ['sereward','Sereward','sand','sereward'],
  ['ellionar','Ellionar','garden-loam','ellionar'],
  ['veyrholds','Veyrholds','scree','veyrholds'],
  ['pale-meridian','Pale Meridian','snow','pale-meridian'],
  ['siltmouths','Siltmouths','tidal-mud','siltmouths'],
  ['vesperra','Vesperra','jungle-loam','vesperra'],
  ['sombral-mere','Sombral Mere','lunar-soil','sombral-mere'],
  ['ru-lora-fringe','Ru’Lora fringe','jungle-loam','vesperra'],
  ['ru-lora-interior','Ru’Lora interior','salt-crust','ru-lora'],
].map(([id,name,ground,vegetation])=>[id,Object.freeze({id,name,ground,vegetation,audioPackId:`vaelora-${id}`})])));
export function validateMapRegion(region) {
  if (region !== undefined && !Object.hasOwn(REGIONS, region)) throw new Error('Map region must name a registered Vaelora palette.');
  return region === undefined ? null : REGIONS[region];
}
