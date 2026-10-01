// Runtime scale/pivot contract; validated against each selected plant manifest.
export const PLANT_ASSETS = Object.freeze({
  "vesperra-spiral-podvine": {"kind": "decorative-forest-understory", "worldWidth": 1.10431, "worldHeight": 0.55, "pivot": [0.5, 1]},
  "vesperra-veilcap": {"kind": "decorative-forest-understory", "worldWidth": 0.61614, "worldHeight": 0.65, "pivot": [0.5, 1]},
  "veyrholds-alpine-moss": {"kind": "decorative-land-scenery", "worldWidth": 0.95945, "worldHeight": 0.55, "pivot": [0.5, 1]},
  "bellweather-wild-barley": { "kind": "decorative-land-scenery", "worldWidth": 0.84795, "worldHeight": 0.95, "pivot": [0.5, 1] },
  "bellweather-meadow-clover": { "kind": "decorative-forest-understory", "worldWidth": 0.79703, "worldHeight": 0.65, "pivot": [0.5, 1] },
  "ellionar-garden-vine": { "kind": "decorative-forest-understory", "worldWidth": 0.96324, "worldHeight": 0.65, "pivot": [0.5, 1] },
  "bellweather-meadow-herbs": {
    "kind": "decorative-forest-understory",
    "worldWidth": 1.15561,
    "worldHeight": 0.72,
    "pivot": [
      0.5,
      1
    ]
  },
  "ellionar-sunbloom": {
    "kind": "decorative-forest-understory",
    "worldWidth": 0.88654,
    "worldHeight": 0.85,
    "pivot": [
      0.5,
      1
    ]
  },
  "sombral-mere-mirelily": {
    "kind": "decorative-water-decal",
    "worldWidth": 0.75,
    "worldDepth": 0.7229,
    "pivot": [
      0.5,
      0.5
    ],
    "waterSurfaceLift": 0.008
  },
  "pale-meridian-frostberry": {
    "kind": "decorative-forest-understory",
    "worldWidth": 1.10553,
    "worldHeight": 0.8,
    "pivot": [
      0.5,
      1
    ]
  },
  "pale-meridian-violet-lichen": {
    "kind": "decorative-stone-scenery",
    "worldWidth": 2.8818,
    "worldHeight": 1.5,
    "pivot": [
      0.5,
      1
    ]
  },
  "pale-meridian-silver-moss": {
    "kind": "decorative-forest-understory",
    "worldWidth": 0.83027,
    "worldHeight": 0.45,
    "pivot": [
      0.5,
      1
    ]
  },
  "ru-lora-fringe-broadleaf": {
    "kind": "decorative-forest-understory",
    "worldWidth": 1.09551,
    "worldHeight": 0.72,
    "pivot": [
      0.5,
      1
    ]
  },
  "ru-lora-god-bone": {
    "kind": "decorative-stone-scenery",
    "worldWidth": 2.83966,
    "worldHeight": 1.65,
    "pivot": [
      0.5,
      1
    ]
  },
  "sereward-succulent-02": {
    "kind": "decorative-forest-understory",
    "worldWidth": 1.05931,
    "worldHeight": 0.75,
    "pivot": [
      0.5,
      1
    ]
  },
  "sereward-succulent": {
    "kind": "decorative-forest-understory",
    "worldWidth": 0.97338,
    "worldHeight": 0.75,
    "pivot": [
      0.5,
      1
    ]
  },
  "siltmouths-marsh-tuber": {
    "kind": "decorative-forest-understory",
    "worldWidth": 1.01564,
    "worldHeight": 0.85,
    "pivot": [
      0.5,
      1
    ]
  },
  "siltmouths-silver-reed": {
    "kind": "decorative-forest-understory",
    "worldWidth": 1.29076,
    "worldHeight": 1.05,
    "pivot": [
      0.5,
      1
    ]
  },
  "sombral-mere-noctilune": {
    "kind": "decorative-forest-understory",
    "worldWidth": 1.0104,
    "worldHeight": 0.95,
    "pivot": [
      0.5,
      1
    ]
  },
  "sombral-mere-lunewort": {
    "kind": "decorative-forest-understory",
    "worldWidth": 0.88203,
    "worldHeight": 1.15,
    "pivot": [
      0.5,
      1
    ]
  },
  "underbough-rootward-fungus-02": {
    "kind": "decorative-forest-understory",
    "worldWidth": 0.65989,
    "worldHeight": 0.65,
    "pivot": [
      0.5,
      1
    ]
  },
  "underbough-rootward-fungus": {
    "kind": "decorative-forest-understory",
    "worldWidth": 1.08404,
    "worldHeight": 0.65,
    "pivot": [
      0.5,
      1
    ]
  },
  "vesperra-shade-fern-02": {
    "kind": "decorative-forest-understory",
    "worldWidth": 1.05628,
    "worldHeight": 0.72,
    "pivot": [
      0.5,
      1
    ]
  },
  "vesperra-shade-fern": {
    "kind": "decorative-forest-understory",
    "worldWidth": 1.07475,
    "worldHeight": 0.72,
    "pivot": [
      0.5,
      1
    ]
  },
  "veyrholds-suncrest": {
    "kind": "decorative-forest-understory",
    "worldWidth": 0.80124,
    "worldHeight": 0.7,
    "pivot": [
      0.5,
      1
    ]
  },
  "veyrholds-ridgegrass": {
    "kind": "decorative-forest-understory",
    "worldWidth": 1.15218,
    "worldHeight": 0.8,
    "pivot": [
      0.5,
      1
    ]
  }
});

export function assertPlantDimensions(name, width, vertical, water = false) {
  const spec = PLANT_ASSETS[name];
  if (!spec) return null; // Generic trees/rocks retain their existing dimensions.
  const expected = water ? spec.worldDepth : spec.worldHeight;
  if ((spec.kind === "decorative-water-decal") !== water || width !== spec.worldWidth || vertical !== expected) {
    throw new Error(`Plant ${name} runtime dimensions/surface disagree with its registered contract`);
  }
  return spec;
}
