import * as THREE from 'three';
import {
  addObstacleEnvironmentSprites, createEnvironmentSprite, createEnvironmentSpriteInstances,
  createGroundSurfaces, environmentTheme, setEnvironmentSpriteInstance, TERRAIN_MATERIALS,
} from './environment-art.mjs';
import { unitActionPoseAllowed, unitCargoVisualState } from './unit-visual-state.mjs';
import {
  capturePrerequisiteIds, findInvalidCapturePrerequisite, findInvalidScenarioEventChain,
  findUnreachableCaptureZone, findUnreachableResourceNode, scenarioEventSourceIds,
} from './map-utils.mjs';
import { resizeWorldMarkers } from './map-resize.mjs';
import { classifyOrderNotice } from './order-feedback.mjs';
import { createGameAudio } from './audio.mjs';
import { CombatAudioGate, cueForNotice, isLocalRejection } from './audio-policy.mjs';
import {
  chooseUnitPickCandidate,
  isSameUnitDoubleClick,
  livingIdleWorkerIds,
  livingUnitIdsOfKinds,
  selectUnitIdsInScreenRect,
  summarizeUnitComposition,
  visibleLivingUnitIdsOfKind,
} from './unit-selection.mjs';

let mapDefinition = null;
let edgeScrollPointer = null;
let MAP_WIDTH = 64;
let MAP_HEIGHT = 64;
let MAP_HALF_X = MAP_WIDTH / 2;
let MAP_HALF_Z = MAP_HEIGHT / 2;
const MAX_UNITS = 2000;
const MAX_PER_TEAM = MAX_UNITS / 2;
const ATTACK_POSE_MS = 270;
const HIT_POSE_MS = 240;
const SPAWN_POSE_MS = 330;
const DEFEAT_POSE_MS = 430;
const IDLE_POSE_INTERVAL_MS = 75;
const MAX_ARROW_TRACES = 96;
const MAX_MAP_RESOURCE_NODES = 128;
const MAX_MAP_TRIGGERS = 32;
const MAX_MAP_SCENARIO_EVENTS = 32;
const MAX_SCENARIO_EVENT_REPEATS = 20;
const MIN_SCENARIO_EVENT_REPEAT_SECONDS = 5;
const CAMERA_EDGE_ZONE_PX = 28;
const CAMERA_EDGE_SPEED_PX_PER_SECOND = 420;
const MAX_OBJECTIVE_FOOD_REWARD = 10000;
const MAX_TRIGGER_UNIT_REWARD = 25;
const WORKERS_PER_TEAM = 4;
const WORKER_TASK_STATES = new Set(['idle', 'moving', 'gathering', 'returning', 'building', 'attacking']);
const INFANTRY_FOOD_COST = 50;
const INFANTRY_TRAIN_SECONDS = 12;
const WORKER_FOOD_COST = 50;
const WORKER_TRAIN_SECONDS = 25;
const WORKER_QUEUE_LIMIT = 5;
const ARCHER_FOOD_COST = 25;
const ARCHER_WOOD_COST = 45;
const ARCHERY_RANGE_WOOD_COST = 150;
const ARCHERY_RANGE_QUEUE_LIMIT = 5;
const ARCHERY_RANGE_SIZE = 3;
const BARRACKS_WOOD_COST = 175;
const BARRACKS_QUEUE_LIMIT = 5;
const BARRACKS_SIZE = 3;
const ATTACK_UPGRADE_RULES = Object.freeze({
  barracks: Object.freeze({
    type: 'infantry-attack', key: 'infantryAttack', label: 'INFANTRY FORGING',
    foodCost: 100, woodCost: 75, durationSeconds: 25,
  }),
  'archery-range': Object.freeze({
    type: 'archer-attack', key: 'archerAttack', label: 'ARCHER FLETCHING',
    foodCost: 125, woodCost: 125, durationSeconds: 25,
  }),
});
const TEAM_NAMES = ['Azure', 'Ember'];
const TEAM_HEX = [0x5aa7d7, 0xe67a5e];

const viewport = document.querySelector('#viewport');
const selectionBox = document.querySelector('#selection-box');
const toast = document.querySelector('#toast');
const matchResult = document.querySelector('#match-result');
const minimapCanvas = document.querySelector('#minimap-canvas');
const minimapContext = minimapCanvas.getContext('2d');
const minimapBackground = document.createElement('canvas');
minimapBackground.width = minimapCanvas.width;
minimapBackground.height = minimapCanvas.height;
const minimapBackgroundContext = minimapBackground.getContext('2d');
const minimapFogCanvas = document.createElement('canvas');
const minimapFogContext = minimapFogCanvas.getContext('2d');
const objectivePanel = document.querySelector('#objective-panel');
const roomPageUrl = new URL(window.location.href);
const ROOM_ID = roomPageUrl.searchParams.get('room');
const HAS_ROOM_PARAMETER = roomPageUrl.searchParams.has('room');
const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const ui = {
  total: document.querySelector('#unit-total'),
  selected: document.querySelector('#selected-total'),
  selectedBlue: document.querySelector('#selected-blue'),
  selectedRed: document.querySelector('#selected-red'),
  selectedWorkers: document.querySelector('#selected-workers'),
  selectedInfantry: document.querySelector('#selected-infantry'),
  selectedArchers: document.querySelector('#selected-archers-count'),
  selectedWaypoints: document.querySelector('#selected-waypoints'),
  selectedBuildingCard: document.querySelector('#building-selection-card'),
  selectedBuildingName: document.querySelector('#selected-building-name'),
  selectedBuildingState: document.querySelector('#selected-building-state'),
  selectedBuildingHealth: document.querySelector('#selected-building-health'),
  selectedBuildingHealthBar: document.querySelector('#selected-building-health-bar'),
  selectedBuildingProduction: document.querySelector('#selected-building-production'),
  aliveBlue: document.querySelector('#alive-blue'),
  aliveRed: document.querySelector('#alive-red'),
  foodStock: document.querySelector('#food-stock'),
  woodStock: document.querySelector('#wood-stock'),
  foodStatus: document.querySelector('#economy-status'),
  workerLoad: document.querySelector('#worker-load'),
  trainInfantry: document.querySelector('#train-infantry'),
  trainWorker: document.querySelector('#train-worker'),
  trainArcher: document.querySelector('#train-archer'),
  buildBarracks: document.querySelector('#build-barracks'),
  buildRange: document.querySelector('#build-range'),
  selectWorkers: document.querySelector('#select-workers'),
  selectIdleWorkers: document.querySelector('#select-idle-workers'),
  selectInfantry: document.querySelector('#select-infantry'),
  selectArchers: document.querySelector('#select-archers'),
  selectMilitary: document.querySelector('#select-military'),
  buildingStatus: document.querySelector('#building-status'),
  barracksStatus: document.querySelector('#barracks-status'),
  buildingCommandDetails: document.querySelector('#building-command-details'),
  buildingRallyReadout: document.querySelector('#building-rally-readout'),
  clearBuildingRally: document.querySelector('#clear-building-rally'),
  buildingResearchReadout: document.querySelector('#building-research-readout'),
  researchAttackUpgrade: document.querySelector('#research-attack-upgrade'),
  workerProductionStatus: document.querySelector('#worker-production-status'),
  resumeRange: document.querySelector('#resume-range'),
  resumeConstructionLabel: document.querySelector('#resume-construction-label'),
  resumeRangeProgress: document.querySelector('.resume-range-progress'),
  fieldHintAction: document.querySelector('#field-hint-action'),
  fieldHintPrimaryKey: document.querySelector('#field-hint-primary-key'),
  fieldHintSecondaryKey: document.querySelector('#field-hint-secondary-key'),
  fieldHintSecondary: document.querySelector('#field-hint-secondary'),
  placementStatus: document.querySelector('#placement-status'),
  fps: document.querySelector('#fps-value'),
  draws: document.querySelector('#draw-value'),
  triangles: document.querySelector('#tri-value'),
  networkStatus: document.querySelector('#network-status'),
  roomCreate: document.querySelector('#room-create'),
  roomJoin: document.querySelector('#room-join'),
  roomInvite: document.querySelector('#room-invite'),
  roomDialog: document.querySelector('#room-dialog'),
  roomJoinForm: document.querySelector('#room-join-form'),
  roomCode: document.querySelector('#room-code'),
  roomDialogError: document.querySelector('#room-dialog-error'),
  connectionDot: document.querySelector('#connection-dot'),
  playersOnline: document.querySelector('#players-online'),
  matchStatus: document.querySelector('#match-status'),
  commandMode: document.querySelector('.command-mode'),
  commandIcon: document.querySelector('.command-icon'),
  commandTitle: document.querySelector('#command-title'),
  commandHint: document.querySelector('#command-hint'),
  orderStatus: document.querySelector('#order-status'),
  attackMoveToggle: document.querySelector('#attack-move-toggle'),
  orderTargetToggle: document.querySelector('#order-target-toggle'),
  formationSelect: document.querySelector('#formation-select'),
  playerTeam: document.querySelector('#player-team'),
  mapSelect: document.querySelector('#map-select'),
  mapStudioOpen: document.querySelector('#map-studio-open'),
  mapStudio: document.querySelector('#map-studio'),
  mapStudioLayout: document.querySelector('#map-studio .studio-layout'),
  studioFooter: document.querySelector('#map-studio .studio-footer'),
  studioDraftRecovery: document.querySelector('#studio-draft-recovery'),
  studioDraftRecoveryMessage: document.querySelector('#studio-draft-recovery-message'),
  studioDraftStatus: document.querySelector('#studio-draft-status'),
  studioGrid: document.querySelector('#studio-grid'),
  studioName: document.querySelector('#studio-name'),
  studioId: document.querySelector('#studio-id'),
  studioSummary: document.querySelector('#studio-summary'),
  studioWidth: document.querySelector('#studio-width'),
  studioHeight: document.querySelector('#studio-height'),
  studioTerrainBase: document.querySelector('#studio-terrain-base'),
  studioGroundBrushSize: document.querySelector('#studio-ground-brush-size'),
  studioStartingArmySize: document.querySelector('#studio-starting-army-size'),
  studioStartingFood: document.querySelector('#studio-starting-food'),
  studioStartingWood: document.querySelector('#studio-starting-wood'),
  studioGridSize: document.querySelector('#studio-grid-size'),
  studioMessage: document.querySelector('#studio-message'),
  studioPublish: document.querySelector('#studio-publish'),
  studioImportFile: document.querySelector('#studio-import-file'),
  studioObjectiveName: document.querySelector('#studio-objective-name'),
  studioObjectiveMessage: document.querySelector('#studio-objective-message'),
  studioRequiredUnits: document.querySelector('#studio-required-units'),
  studioCaptureSeconds: document.querySelector('#studio-capture-seconds'),
  studioObjectiveFoodReward: document.querySelector('#studio-objective-food-reward'),
  studioObjectiveWoodReward: document.querySelector('#studio-objective-wood-reward'),
  studioObjectiveUnitCount: document.querySelector('#studio-objective-unit-count'),
  studioObjectiveUnitKind: document.querySelector('#studio-objective-unit-kind'),
  studioObjectiveVictory: document.querySelector('#studio-objective-victory'),
  studioObjectiveRequires: document.querySelector('#studio-objective-requires'),
  studioVictoryMode: document.querySelector('#studio-victory-mode'),
  studioVictoryHoldSeconds: document.querySelector('#studio-victory-hold-seconds'),
  studioDeadlineObjective: document.querySelector('#studio-deadline-objective'),
  studioDeadlineSeconds: document.querySelector('#studio-deadline-seconds'),
  studioFogOfWar: document.querySelector('#studio-fog-of-war'),
  studioTriggerList: document.querySelector('#studio-trigger-list'),
  studioTriggerCount: document.querySelector('#studio-trigger-count'),
  studioAddTrigger: document.querySelector('#studio-add-objective'),
  studioRemoveTrigger: document.querySelector('#studio-remove-objective'),
  studioResourceCount: document.querySelector('#studio-resource-count'),
  studioResourceStock: document.querySelector('#studio-resource-stock'),
  studioRemoveResource: document.querySelector('#studio-remove-resource'),
  studioEventList: document.querySelector('#studio-event-list'),
  studioEventCount: document.querySelector('#studio-event-count'),
  studioAddEvent: document.querySelector('#studio-add-event'),
  studioRemoveEvent: document.querySelector('#studio-remove-event'),
  studioEventName: document.querySelector('#studio-event-name'),
  studioEventTrigger: document.querySelector('#studio-event-trigger'),
  studioEventObjectiveControl: document.querySelector('#studio-event-objective-control'),
  studioEventObjective: document.querySelector('#studio-event-objective'),
  studioEventSourceControl: document.querySelector('#studio-event-source-control'),
  studioEventSources: document.querySelector('#studio-event-sources'),
  studioEventOccurrenceControl: document.querySelector('#studio-event-occurrence-control'),
  studioEventOccurrence: document.querySelector('#studio-event-occurrence'),
  studioEventAfterLabel: document.querySelector('#studio-event-after-label'),
  studioEventAfter: document.querySelector('#studio-event-after'),
  studioEventRepeatCount: document.querySelector('#studio-event-repeat-count'),
  studioEventRepeatEvery: document.querySelector('#studio-event-repeat-every'),
  studioEventTeam: document.querySelector('#studio-event-team'),
  studioEventFood: document.querySelector('#studio-event-food'),
  studioEventWood: document.querySelector('#studio-event-wood'),
  studioEventUnitCount: document.querySelector('#studio-event-unit-count'),
  studioEventUnitKind: document.querySelector('#studio-event-unit-kind'),
  studioEventTechnologyReward: document.querySelector('#studio-event-technology-reward'),
  studioEventMessage: document.querySelector('#studio-event-message'),
  controlGroups: [...document.querySelectorAll('.control-group')],
  audioEnabled: document.querySelector('#audio-enabled'),
  audioVolume: document.querySelector('#audio-volume'),
  audioVolumeValue: document.querySelector('#audio-volume-value'),
  audioAmbience: document.querySelector('#audio-ambience'),
  audioStatus: document.querySelector('#audio-status'),
};
const audio = createGameAudio({
  onStatusChange: () => syncAudioControls(),
  onCue: (cue) => {
    ui.audioStatus.dataset.lastCue = cue;
    ui.audioStatus.dataset.cueCount = String((Number(ui.audioStatus.dataset.cueCount) || 0) + 1);
  },
});
const combatAudioGate = new CombatAudioGate();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x859175);
scene.fog = new THREE.Fog(0x859175, 145, 235);

const camera = new THREE.OrthographicCamera(-32, 32, 32, -32, 0.1, 300);
const cameraTarget = new THREE.Vector3(0, 0, 0);
const cameraOffset = new THREE.Vector3(0.78, 1.12, 0.78).normalize();
const baseFrustum = 43;
let zoom = 0.91;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x859175, 1);
viewport.prepend(renderer.domElement);
renderer.domElement.setAttribute('aria-label', 'Online isometric battlefield. Push the pointer against a battlefield edge to scroll the camera, or middle-drag / Space-drag to pan. Click a friendly unit to select it; pause briefly, then click the same spot to cycle through stacked units. Double-click a friendly unit to select visible on-screen friendlies of its type, or hold Shift to add them. Drag left to right to select units enclosed by the box; drag right to left to select units the box crosses; hold Shift to add either selection. Right-click ground to move or attack-move (M), Shift plus right-click to queue a waypoint, or right-click an enemy to attack and pause briefly before clicking again to cycle stacked targets. On touch screens, select units, open Orders, choose Target battlefield, then tap a destination, enemy, or resource.');
renderer.domElement.tabIndex = 0;

scene.add(new THREE.HemisphereLight(0xe5ebcb, 0x3e4935, 2.05));
const sun = new THREE.DirectionalLight(0xfff2d4, 2.15);
sun.position.set(-24, 38, 20);
scene.add(sun);

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const groundHit = new THREE.Vector3();
const screenPoint = new THREE.Vector3();
const dummy = new THREE.Object3D();
const color = new THREE.Color();
const workerBodyTint = new THREE.Color(0xe1bc63);
const archerBodyTint = new THREE.Color(0xc3c995);
const unitDamageFlashTint = new THREE.Color(0xffedc9);
const unitCargoPackColors = {
  none: new THREE.Color(0x9c754c),
  wood: new THREE.Color(0x9bb877),
  food: new THREE.Color(0xe4bd63),
  unknown: new THREE.Color(0xb8ad92),
};
const unitCargoPackColorDirty = [false, false];
const facing = new THREE.Quaternion();
const worldUp = new THREE.Vector3(0, 1, 0);
const ringRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

const units = [];
const teamUnits = [[], []];
const selected = new Set();
const controlGroups = Array.from({ length: 10 }, () => new Set());
const bodyMeshes = [null, null];
const headMeshes = [null, null];
const bowMeshes = [null, null];
const shieldMeshes = [null, null];
const spearMeshes = [null, null];
const toolMeshes = [null, null];
const packMeshes = [null, null];
const quiverMeshes = [null, null];
const unitArtMeshes = [bodyMeshes, headMeshes, bowMeshes, shieldMeshes, spearMeshes, toolMeshes, packMeshes, quiverMeshes];
const mapObjects = [];
const townCenterProductionLamps = [null, null];
let fogTexture = null;
let fogMesh = null;
let latestFogCells = null;
let minimapFogImage = null;
const objectiveVisuals = new Map();
const scenarioEventVisuals = new Map();
let timedVictoryVisual = null;
let victoryHoldVisual = null;
const resourceNodeVisuals = new Map();
const woodTreeNodeSlots = new Map();
const buildingVisuals = new Map();
let woodTreeMeshes = [];
let localTeam = null;
let isHost = false;
let currentArmySize = 1000;
let latestRosterSize = 1000;
let matchWinner = -1;
let matchWinnerReason = null;
let attackMoveMode = false;
let tapOrderArmed = false;
let tapOrderPointer = null;
let knownMaps = [];
let editorDefinition = null;
let editorDraftSourceMapId = null;
let editorDraftStorageKey = null;
let editorDraftDirty = false;
let editorDraftWriteTimer = 0;
let editorCellMaterials = new Int8Array(0);
let editorCellElevations = new Float64Array(0);
let editorGroundMaterials = new Int8Array(0);
let editorTriggers = [];
let editorScenarioEvents = [];
let selectedEditorTriggerId = null;
let selectedEditorScenarioEventId = null;
let editorTriggerCreationPending = false;
let editorResourceNodes = [];
let selectedEditorResourceId = null;
let editorTool = 'stone';
let editorDrag = null;
let socket = null;
let connectedPlayers = 0;
let waitingForResume = false;
let selectionDirty = false;
let latestObjectiveStates = new Map();
let latestScenarioEventStates = new Map();
let latestMatchElapsedSeconds = 0;
let latestScenarioClockStarted = false;
let scenarioClockSynchronizedAt = 0;
let lastScenarioEventUiUpdateAt = -Infinity;
let latestFood = [0, 0];
let latestWood = [0, 0];
let latestBuildings = [];
let selectedBuildingId = null;
let latestWorkerProduction = [null, null];
let latestTeamResearch = [null, null];
let latestResourceStocks = new Map();
let minimapLastDrawAt = -Infinity;
let minimapPointerId = null;
let activeControlGroup = null;
let lastControlGroupRecall = null;
let lastFriendlyUnitClick = null;
let lastUnitPickState = null;
let moveMarkerAge = 0;
let buildPlacementActive = false;
let buildPlacementType = 'archery-range';
let buildPlacementPending = false;
let pendingBuildOrderToken = null;
let pendingBuildBaseline = new Set();
let toastTimer = 0;
let fieldOrderFeedbackTimer = 0;
let nextClientOrderToken = 1;
let currentOrderToken = null;
let orderStatusTimeout = null;
let reconnectTimer = null;
let reconnectDelayMs = 500;
let pageLeaving = false;
const SESSION_STORAGE_KEY = 'thousand-unit-skirmish-session';
const ROOM_SESSION_STORAGE_KEY = `${SESSION_STORAGE_KEY}:${ROOM_ID || 'default'}`;
const ROOM_INSTANCE_STORAGE_KEY = `${SESSION_STORAGE_KEY}:instance:${location.host}:${ROOM_ID || 'default'}`;
const ROOM_MATCH_STORAGE_KEY = `${SESSION_STORAGE_KEY}:match:${location.host}:${ROOM_ID || 'default'}`;

function setCamera() {
  const distance = 125;
  camera.position.copy(cameraTarget).addScaledVector(cameraOffset, distance);
  camera.lookAt(cameraTarget);
  camera.updateMatrixWorld();
  if (!mapDefinition) return;

  const bounds = cameraGroundBounds();
  if (!bounds) return;
  const minOffsetX = bounds.left - cameraTarget.x;
  const maxOffsetX = bounds.right - cameraTarget.x;
  const minOffsetZ = bounds.top - cameraTarget.z;
  const maxOffsetZ = bounds.bottom - cameraTarget.z;
  const minTargetX = -MAP_HALF_X - minOffsetX;
  const maxTargetX = MAP_HALF_X - maxOffsetX;
  const minTargetZ = -MAP_HALF_Z - minOffsetZ;
  const maxTargetZ = MAP_HALF_Z - maxOffsetZ;
  const clampedX = minTargetX <= maxTargetX
    ? THREE.MathUtils.clamp(cameraTarget.x, minTargetX, maxTargetX) : 0;
  const clampedZ = minTargetZ <= maxTargetZ
    ? THREE.MathUtils.clamp(cameraTarget.z, minTargetZ, maxTargetZ) : 0;
  if (clampedX !== cameraTarget.x || clampedZ !== cameraTarget.z) {
    cameraTarget.x = clampedX;
    cameraTarget.z = clampedZ;
    camera.position.copy(cameraTarget).addScaledVector(cameraOffset, distance);
    camera.lookAt(cameraTarget);
    camera.updateMatrixWorld();
  }
}

function cameraGroundBounds() {
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const [x, y] of corners) {
    pointerNdc.set(x, y);
    raycaster.setFromCamera(pointerNdc, camera);
    const point = raycaster.ray.intersectPlane(groundPlane, groundHit);
    if (!point) return null;
    bounds.left = Math.min(bounds.left, point.x);
    bounds.right = Math.max(bounds.right, point.x);
    bounds.top = Math.min(bounds.top, point.z);
    bounds.bottom = Math.max(bounds.bottom, point.z);
  }
  return bounds;
}

function resize() {
  lastUnitPickState = null;
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  const aspect = width / height;
  camera.left = (-baseFrustum * aspect) / 2;
  camera.right = (baseFrustum * aspect) / 2;
  camera.top = baseFrustum / 2;
  camera.bottom = -baseFrustum / 2;
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  setCamera();
  drawMinimap(performance.now(), true);
}

function addMapObject(object) {
  scene.add(object);
  mapObjects.push(object);
}

function clearMapObjects() {
  for (const object of mapObjects) {
    scene.remove(object);
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose();
  }
  mapObjects.length = 0;
  townCenterProductionLamps[0] = null;
  townCenterProductionLamps[1] = null;
}

function addTownCenterVisual(spawn) {
  const outward = spawn.team === 0 ? -1 : 1;
  const x = THREE.MathUtils.clamp(spawn.x + outward * 3, -MAP_HALF_X + 1.5, MAP_HALF_X - 1.5);
  const stone = new THREE.MeshBasicMaterial({ color: 0x9b9580 });
  const slate = new THREE.MeshBasicMaterial({ color: 0x363d3f });
  const timber = new THREE.MeshBasicMaterial({ color: 0x514333 });
  const doorMaterial = new THREE.MeshBasicMaterial({ color: 0x2d302b });
  const teamMaterial = new THREE.MeshBasicMaterial({ color: TEAM_HEX[spawn.team], side: THREE.DoubleSide });
  const piece = (geometry, material, px, py, pz, angle = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x + px, py, spawn.z + pz);
    mesh.rotation.z = angle;
    addMapObject(mesh);
    return mesh;
  };
  piece(new THREE.BoxGeometry(2.65, 0.22, 2.4), stone, 0, 0.11, 0);
  piece(new THREE.BoxGeometry(2.1, 0.91, 1.85), stone, 0, 0.67, -0.14);
  piece(new THREE.BoxGeometry(0.62, 0.67, 0.09), doorMaterial, 0, 0.56, 0.84);
  piece(new THREE.BoxGeometry(0.82, 0.12, 0.21), timber, 0, 0.95, 0.88);
  for (const side of [-1, 1]) {
    piece(new THREE.BoxGeometry(1.25, 0.13, 2.32), slate, side * 0.51, 1.37, -0.14, -side * 0.48);
    piece(new THREE.BoxGeometry(0.13, 0.88, 0.13), timber, side * 1.04, 0.68, 0.82);
    piece(new THREE.BoxGeometry(0.13, 0.35, 0.08), teamMaterial, side * 0.88, 0.72, 0.84);
  }
  piece(new THREE.BoxGeometry(0.16, 0.08, 2.24), teamMaterial, 0, 1.67, -0.14);
  piece(new THREE.BoxGeometry(0.74, 1.64, 0.74), stone, -0.73, 1.03, -0.63);
  piece(new THREE.ConeGeometry(0.67, 0.62, 4), slate, -0.73, 2.13, -0.63).rotation.y = Math.PI / 4;
  piece(new THREE.BoxGeometry(0.56, 0.83, 0.055), teamMaterial, -0.73, 1.45, -0.23);
  piece(new THREE.BoxGeometry(0.08, 0.76, 0.08), timber, -0.73, 1.68, -0.18);
  const productionLamp = piece(
    new THREE.OctahedronGeometry(0.15, 0),
    new THREE.MeshBasicMaterial({ color: TEAM_HEX[spawn.team], transparent: true, opacity: 0.88 }),
    0, 1.09, 0.93,
  );
  productionLamp.visible = false;
  townCenterProductionLamps[spawn.team] = productionLamp;
}

function clearBuildingVisuals() {
  selectedBuildingId = null;
  for (const visual of buildingVisuals.values()) {
    scene.remove(visual.group);
    visual.group.traverse((object) => {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material?.dispose();
    });
  }
  buildingVisuals.clear();
  updateCommandUI();
}

function createBuildingRallyMarker() {
  const marker = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: 0xd5ef78, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 28), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.045;
  ring.renderOrder = 4;
  marker.add(ring);
  const markerPost = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.38, 4), material);
  markerPost.position.set(0.16, 0.23, 0);
  markerPost.renderOrder = 4;
  marker.add(markerPost);
  marker.visible = false;
  return marker;
}

function updateBuildingRallyMarker(visual, building) {
  if (!visual.rallyMarker) return;
  if (!Number.isInteger(building.rallyCell) || building.rallyCell < 0) {
    visual.rallyMarker.visible = false;
    return;
  }
  const column = building.rallyCell % MAP_WIDTH;
  const row = Math.floor(building.rallyCell / MAP_WIDTH);
  visual.rallyMarker.position.set(
    column - MAP_HALF_X + 0.5 - building.x,
    0,
    row - MAP_HALF_Z + 0.5 - building.z,
  );
  visual.rallyMarker.visible = true;
}

function updateBuildingSelectionVisual(visual, isSelected) {
  if (!visual.outline) return;
  visual.outline.material.color.setHex(isSelected ? 0xd5ef78 : visual.teamColor);
  visual.outline.material.opacity = isSelected ? 1 : 0.9;
}

function createBuildingHealthIndicator() {
  const group = new THREE.Group();
  const width = 1.9;
  const background = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.055, 0.16),
    new THREE.MeshBasicMaterial({ color: 0x1a201b }),
  );
  const fill = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.06, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x9bd77d }),
  );
  background.position.set(0, 2.62, 0);
  fill.position.set(0, 2.66, 0);
  group.add(background, fill);
  return { group, fill, width };
}

function updateBuildingHealthIndicator(visual, building) {
  const health = visual.healthIndicator;
  if (!health) return;
  const maxHp = Number(building.maxHp) || 1800;
  const hp = THREE.MathUtils.clamp(Number(building.hp) || maxHp, 0, maxHp);
  const ratio = hp / maxHp;
  health.group.visible = ratio < 0.999;
  health.fill.scale.x = Math.max(0.001, ratio);
  health.fill.position.x = -health.width * (1 - ratio) * 0.5;
  health.fill.material.color.setHex(ratio > 0.55 ? 0x9bd77d : ratio > 0.25 ? 0xe3c46f : 0xe27461);
}

function createBuildingCombatFeedback() {
  const targetRing = new THREE.Mesh(
    new THREE.RingGeometry(2.02, 2.16, 48),
    new THREE.MeshBasicMaterial({
      color: 0xf2765e, transparent: true, opacity: 0.78,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.y = 0.055;
  targetRing.visible = false;
  targetRing.renderOrder = 2;

  const impactFlash = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.42, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffd997, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  impactFlash.rotation.x = -Math.PI / 2;
  impactFlash.position.y = 2.7;
  impactFlash.visible = false;
  impactFlash.renderOrder = 3;
  return { targetRing, impactFlash, attackerCount: 0, lastHp: null, impactStartedAt: -Infinity };
}

function updateBuildingCombatFeedback(visual, building) {
  const feedback = visual.combatFeedback;
  if (!feedback) return;
  const hp = Number(building.hp);
  if (Number.isFinite(hp) && Number.isFinite(feedback.lastHp) && hp < feedback.lastHp - 0.001) {
    feedback.impactStartedAt = performance.now();
    feedback.impactFlash.visible = true;
  }
  if (Number.isFinite(hp)) feedback.lastHp = hp;
  feedback.attackerCount = Number.isInteger(building.attackers) ? Math.max(0, building.attackers) : 0;
  feedback.targetRing.visible = feedback.attackerCount > 0;
  if (feedback.attackerCount <= 0) {
    if (feedback.badge) feedback.badge.sprite.visible = false;
    return;
  }
  if (!feedback.badge) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 72;
    const context = canvas.getContext('2d');
    if (!context) return;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    sprite.position.set(0, 3.45, 0);
    sprite.scale.set(3.45, 0.97, 1);
    sprite.renderOrder = 4;
    visual.group.add(sprite);
    feedback.badge = { canvas, context, texture, sprite, lastCount: -1 };
  }
  const badge = feedback.badge;
  badge.sprite.visible = true;
  if (badge.lastCount === feedback.attackerCount) return;
  const { context, canvas } = badge;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(35, 23, 21, 0.9)';
  context.strokeStyle = '#ff8e72';
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 22);
  context.fill();
  context.stroke();
  context.fillStyle = '#fff0d4';
  context.font = '700 25px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const label = feedback.attackerCount === 1 ? ' ATTACKER' : ' ATTACKERS';
  context.fillText(`${feedback.attackerCount.toLocaleString()}${label}`, canvas.width / 2, canvas.height / 2 + 1);
  badge.lastCount = feedback.attackerCount;
  badge.texture.needsUpdate = true;
}

function animateBuildingCombatFeedback(now) {
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.0065);
  for (const visual of buildingVisuals.values()) {
    if (visual.productionLamp?.visible) {
      visual.productionLamp.scale.setScalar(0.82 + pulse * 0.33);
      visual.productionLamp.material.opacity = 0.58 + pulse * 0.35;
    }
    const feedback = visual.combatFeedback;
    if (!feedback) continue;
    if (feedback.attackerCount > 0) {
      feedback.targetRing.material.opacity = 0.58 + pulse * 0.3;
      const scale = 1 + pulse * 0.035;
      feedback.targetRing.scale.set(scale, scale, scale);
    }
    if (!feedback.impactFlash.visible) continue;
    const age = (now - feedback.impactStartedAt) / 360;
    if (age >= 1) {
      feedback.impactFlash.visible = false;
      feedback.impactFlash.material.opacity = 0;
      continue;
    }
    const scale = 0.8 + Math.max(0, age) * 1.8;
    feedback.impactFlash.scale.set(scale, scale, scale);
    feedback.impactFlash.material.opacity = (1 - Math.max(0, age)) * 0.88;
  }
  for (let team = 0; team < 2; team++) {
    const lamp = townCenterProductionLamps[team];
    if (!lamp) continue;
    const production = latestWorkerProduction[team];
    lamp.visible = Boolean(production?.queue > 0 && !production.productionBlocked);
    if (lamp.visible) {
      lamp.scale.setScalar(0.82 + pulse * 0.33);
      lamp.material.opacity = 0.58 + pulse * 0.35;
    }
  }
}

function createBuildingProductionLamp(group, team, x, y, z) {
  const lamp = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.13, 0),
    new THREE.MeshBasicMaterial({ color: TEAM_HEX[team], transparent: true, opacity: 0.88 }),
  );
  lamp.position.set(x, y, z);
  lamp.visible = false;
  group.add(lamp);
  return lamp;
}

function disposeBuildingVisual(visual) {
  scene.remove(visual.group);
  visual.group.traverse((object) => {
    if (!object.isSprite) object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material?.map?.dispose();
      material?.dispose();
    }
  });
}

function addBuildingStandard(group, team, x, z, height = 1.85) {
  const standard = new THREE.Group();
  standard.position.set(x, 0, z);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, height, 5),
    new THREE.MeshBasicMaterial({ color: 0x594938 }),
  );
  pole.position.y = height / 2;
  standard.add(pole);
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, height - 0.13);
  flagShape.lineTo(0.67, height - 0.13);
  flagShape.lineTo(0.63, height - 0.7);
  flagShape.lineTo(0.32, height - 0.58);
  flagShape.lineTo(0.04, height - 0.7);
  flagShape.closePath();
  const flag = new THREE.Mesh(
    new THREE.ShapeGeometry(flagShape),
    new THREE.MeshBasicMaterial({ color: TEAM_HEX[team], side: THREE.DoubleSide }),
  );
  flag.position.z = 0.035;
  standard.add(flag);
  group.add(standard);
  return standard;
}

function createArcheryRangeVisual(building) {
  const group = new THREE.Group();
  const teamColor = TEAM_HEX[building.team] || 0x9ba78b;
  const timberMaterial = new THREE.MeshBasicMaterial({ color: 0x5a4837 });
  const roofMaterial = new THREE.MeshBasicMaterial({ color: 0x454744 });
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.18, 2.9), timberMaterial);
  foundation.position.y = 0.12;
  group.add(foundation);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 1, 0.2), timberMaterial, 4);
  posts.count = 4;
  const corners = [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]];
  for (let index = 0; index < corners.length; index++) {
    const [x, z] = corners[index];
    dummy.position.set(x, 0.25, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 0.08, 1);
    dummy.updateMatrix();
    posts.setMatrixAt(index, dummy.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  group.add(posts);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.38, 0.13, 2.6), roofMaterial);
  roof.rotation.x = -0.12;
  roof.position.y = 0.38;
  const canopyTrim = new THREE.Mesh(
    new THREE.BoxGeometry(3.42, 0.105, 0.13),
    new THREE.MeshBasicMaterial({ color: teamColor }),
  );
  canopyTrim.position.set(0, 0, 1.27);
  roof.add(canopyTrim);
  group.add(roof);
  const finishPieces = [];
  const targetRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.31, 0.065, 5, 12),
    new THREE.MeshBasicMaterial({ color: 0xa3895b }),
  );
  targetRim.position.set(0.82, 0.82, 1.28);
  group.add(targetRim);
  finishPieces.push(targetRim);
  const targetCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.045, 10),
    new THREE.MeshBasicMaterial({ color: 0x7e5142 }),
  );
  targetCore.geometry.rotateX(Math.PI / 2);
  targetCore.position.set(0.82, 0.82, 1.3);
  group.add(targetCore);
  finishPieces.push(targetCore);
  const standard = addBuildingStandard(group, building.team, -1.18, 1.17, 2.02);
  finishPieces.push(standard);
  const productionLamp = createBuildingProductionLamp(group, building.team, -0.76, 1.35, 1.31);

  const outlinePoints = [
    new THREE.Vector3(-1.5, 0.025, -1.5), new THREE.Vector3(1.5, 0.025, -1.5),
    new THREE.Vector3(1.5, 0.025, -1.5), new THREE.Vector3(1.5, 0.025, 1.5),
    new THREE.Vector3(1.5, 0.025, 1.5), new THREE.Vector3(-1.5, 0.025, 1.5),
    new THREE.Vector3(-1.5, 0.025, 1.5), new THREE.Vector3(-1.5, 0.025, -1.5),
  ];
  const outline = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(outlinePoints),
    new THREE.LineBasicMaterial({ color: teamColor, transparent: true, opacity: 0.9 }),
  );
  group.add(outline);
  const rallyMarker = createBuildingRallyMarker();
  group.add(rallyMarker);
  const healthIndicator = createBuildingHealthIndicator();
  group.add(healthIndicator.group);
  const combatFeedback = createBuildingCombatFeedback();
  group.add(combatFeedback.targetRing, combatFeedback.impactFlash);
  scene.add(group);
  const visual = { group, posts, roof, finishPieces, productionLamp,
    teamColor, outline, rallyMarker, healthIndicator, combatFeedback };
  updateArcheryRangeVisual(visual, building);
  return visual;
}

function updateArcheryRangeVisual(visual, building) {
  const progress = THREE.MathUtils.clamp(Number(building.progress) || 0, 0, 1);
  visual.group.position.set(building.x, 0, building.z);
  visual.group.visible = true;
  const postHeight = 0.95 * progress;
  for (let index = 0; index < 4; index++) {
    const x = index % 2 === 0 ? -1.25 : 1.25;
    const z = index < 2 ? -1.25 : 1.25;
    dummy.position.set(x, 0.23 + postHeight / 2, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, Math.max(0.06, postHeight), 1);
    dummy.updateMatrix();
    visual.posts.setMatrixAt(index, dummy.matrix);
  }
  visual.posts.instanceMatrix.needsUpdate = true;
  visual.roof.position.y = 0.23 + postHeight + 0.19;
  const finished = building.complete === true || progress >= 0.9;
  visual.roof.visible = finished;
  for (const piece of visual.finishPieces) piece.visible = finished;
  visual.productionLamp.visible = finished && getBuildingQueueLength(building) > 0
    && building.productionBlocked !== true;
  updateBuildingHealthIndicator(visual, building);
}

function createBarracksVisual(building) {
  const group = new THREE.Group();
  const teamColor = TEAM_HEX[building.team] || 0x9ba78b;
  const timberMaterial = new THREE.MeshBasicMaterial({ color: 0x504133 });
  const roofMaterial = new THREE.MeshBasicMaterial({ color: 0x363e3d });
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.18, 2.9), timberMaterial);
  foundation.position.y = 0.12;
  group.add(foundation);

  const wallSpecs = [
    [2.35, 1, 0.18, 0, 0, -1.12],
    [0.18, 1, 2.15, -1.12, 0, 0],
    [0.18, 1, 2.15, 1.12, 0, 0],
    [0.88, 1, 0.18, -0.73, 0, 1.12],
    [0.88, 1, 0.18, 0.73, 0, 1.12],
  ];
  const walls = wallSpecs.map(([width, height, depth, x, y, z]) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), timberMaterial);
    wall.position.set(x, y, z);
    group.add(wall);
    return wall;
  });

  const roofPanels = [-1, 1].map((side) => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.16, 3.12), roofMaterial);
    panel.position.set(side * 0.72, 1.23, 0);
    panel.rotation.z = -side * 0.42;
    group.add(panel);
    return panel;
  });
  const ridge = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, 3.18),
    new THREE.MeshBasicMaterial({ color: teamColor }),
  );
  ridge.position.y = 1.63;
  group.add(ridge);
  const finishPieces = [];
  const gate = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.77, 0.09),
    new THREE.MeshBasicMaterial({ color: 0x252b29 }),
  );
  gate.position.set(0, 0.61, 1.19);
  group.add(gate);
  finishPieces.push(gate);
  const shieldSign = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.15, 0.055, 6),
    new THREE.MeshBasicMaterial({ color: teamColor }),
  );
  shieldSign.geometry.rotateX(Math.PI / 2);
  shieldSign.position.set(0, 1.12, 1.25);
  group.add(shieldSign);
  finishPieces.push(shieldSign);
  const standard = addBuildingStandard(group, building.team, 1.24, 1.15, 2.06);
  finishPieces.push(standard);
  const productionLamp = createBuildingProductionLamp(group, building.team, 0, 1.17, 1.27);

  const outlinePoints = [
    new THREE.Vector3(-1.5, 0.025, -1.5), new THREE.Vector3(1.5, 0.025, -1.5),
    new THREE.Vector3(1.5, 0.025, -1.5), new THREE.Vector3(1.5, 0.025, 1.5),
    new THREE.Vector3(1.5, 0.025, 1.5), new THREE.Vector3(-1.5, 0.025, 1.5),
    new THREE.Vector3(-1.5, 0.025, 1.5), new THREE.Vector3(-1.5, 0.025, -1.5),
  ];
  const outline = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(outlinePoints),
    new THREE.LineBasicMaterial({ color: teamColor, transparent: true, opacity: 0.9 }),
  );
  group.add(outline);
  const rallyMarker = createBuildingRallyMarker();
  group.add(rallyMarker);
  const healthIndicator = createBuildingHealthIndicator();
  group.add(healthIndicator.group);
  const combatFeedback = createBuildingCombatFeedback();
  group.add(combatFeedback.targetRing, combatFeedback.impactFlash);
  scene.add(group);
  const visual = { group, walls, roofPanels, ridge, finishPieces, productionLamp,
    teamColor, outline, rallyMarker, healthIndicator, combatFeedback };
  updateBarracksVisual(visual, building);
  return visual;
}

function updateBarracksVisual(visual, building) {
  const progress = THREE.MathUtils.clamp(Number(building.progress) || 0, 0, 1);
  visual.group.position.set(building.x, 0, building.z);
  visual.group.visible = true;
  for (const wall of visual.walls) {
    wall.scale.y = progress;
    wall.position.y = 0.23 + progress * 0.5;
    wall.visible = progress > 0.01;
  }
  const roofVisible = building.complete === true || progress >= 0.9;
  for (const panel of visual.roofPanels) panel.visible = roofVisible;
  visual.ridge.visible = roofVisible;
  for (const piece of visual.finishPieces) piece.visible = roofVisible;
  visual.productionLamp.visible = roofVisible && getBuildingQueueLength(building) > 0
    && building.productionBlocked !== true;
  updateBuildingHealthIndicator(visual, building);
}

function reconcileBuildings(buildings = [], initial = false) {
  const rows = Array.isArray(buildings)
    ? buildings.filter((building) => building && ['archery-range', 'barracks'].includes(building.type)
      && [0, 1].includes(building.team) && Number.isFinite(building.x) && Number.isFinite(building.z))
    : [];
  const priorSelectedBuildingId = selectedBuildingId;
  const previousBuildings = new Map(latestBuildings.map((building) => [building.id, building]));
  let buildingDamage = 0;
  let finishedFriendlyConstruction = false;
  let finishedFriendlyProduction = false;
  const priorSelectedRallyCell = latestBuildings.find((building) => building.id === selectedBuildingId)?.rallyCell ?? -1;
  if (selectedBuildingId !== null && !rows.some((building) => building.id === selectedBuildingId
    && building.team === localTeam)) selectedBuildingId = null;
  const seen = new Set();
  for (const building of rows) {
    const previous = previousBuildings.get(building.id);
    if (previous && building.team === localTeam) {
      if (Number.isFinite(previous.hp) && Number.isFinite(building.hp) && building.hp < previous.hp) buildingDamage++;
      if (previous.complete !== true && building.complete === true) finishedFriendlyConstruction = true;
      if (getBuildingQueueLength(previous) > getBuildingQueueLength(building)) finishedFriendlyProduction = true;
    }
    seen.add(building.id);
    let visual = buildingVisuals.get(building.id);
    if (!visual) {
      visual = building.type === 'barracks'
        ? createBarracksVisual(building) : createArcheryRangeVisual(building);
      buildingVisuals.set(building.id, visual);
    } else if (visual.type !== building.type) {
      disposeBuildingVisual(visual);
      visual = building.type === 'barracks'
        ? createBarracksVisual(building) : createArcheryRangeVisual(building);
      buildingVisuals.set(building.id, visual);
    } else if (building.type === 'barracks') updateBarracksVisual(visual, building);
    else updateArcheryRangeVisual(visual, building);
    visual.type = building.type;
    updateBuildingRallyMarker(visual, building);
    updateBuildingSelectionVisual(visual, building.id === selectedBuildingId);
    updateBuildingCombatFeedback(visual, building);
  }
  for (const [id, visual] of buildingVisuals) {
    if (seen.has(id)) continue;
    disposeBuildingVisual(visual);
    buildingVisuals.delete(id);
  }
  latestBuildings = rows;
  if (!initial && finishedFriendlyConstruction) audio.play('building-complete');
  if (!initial && finishedFriendlyProduction) audio.play('complete');
  const selectedBuilding = rows.find((building) => building.id === selectedBuildingId
    && building.team === localTeam) || null;
  if (priorSelectedBuildingId !== selectedBuildingId
    || (selectedBuilding && priorSelectedRallyCell !== selectedBuilding.rallyCell)) {
    updateCommandUI();
  }
  if (priorSelectedBuildingId !== selectedBuildingId) {
    updateEconomyUI();
  }
  if (buildPlacementPending && rows.some((building) => building.team === localTeam
    && !pendingBuildBaseline.has(building.id))) {
    const placed = rows.find((building) => building.team === localTeam && !pendingBuildBaseline.has(building.id));
    buildPlacementPending = false;
    pendingBuildOrderToken = null;
    cancelBuildPlacement(false);
    showToast(`${buildingLabel(placed?.type || buildPlacementType)} PLACED · WORKERS CONSTRUCTING`, 1800);
  }
  drawMinimap(performance.now(), true);
  return buildingDamage;
}

function getBuildingQueueLength(building) {
  if (Array.isArray(building?.queue)) return building.queue.length;
  return Number.isFinite(building?.queue) ? Math.max(0, Math.floor(building.queue)) : 0;
}

function findTrainableArcheryRange(team) {
  const selectedBuilding = latestBuildings.find((building) => building.id === selectedBuildingId
    && building.team === team && building.type === 'archery-range' && building.complete === true
    && building.productionBlocked !== true);
  if (selectedBuilding) return selectedBuilding;
  return latestBuildings.find((building) => building.team === team && building.type === 'archery-range'
    && building.complete === true && building.productionBlocked !== true
    && getBuildingQueueLength(building) < ARCHERY_RANGE_QUEUE_LIMIT) || null;
}

function findTrainableBarracks(team) {
  const selectedBuilding = latestBuildings.find((building) => building.id === selectedBuildingId
    && building.team === team && building.type === 'barracks' && building.complete === true
    && building.productionBlocked !== true);
  if (selectedBuilding) return selectedBuilding;
  return latestBuildings.find((building) => building.team === team && building.type === 'barracks'
    && building.complete === true && building.productionBlocked !== true
    && getBuildingQueueLength(building) < BARRACKS_QUEUE_LIMIT) || null;
}

function buildingLabel(type) {
  return type === 'barracks' ? 'BARRACKS' : 'ARCHERY RANGE';
}

function updateBuildingResearchControls(selectedBuilding) {
  const rules = selectedBuilding ? ATTACK_UPGRADE_RULES[selectedBuilding.type] : null;
  const teamState = localTeam === null ? null : latestTeamResearch[localTeam];
  const active = teamState?.active || null;
  const researchingHere = Boolean(rules && active?.type === rules.type
    && active.buildingId === selectedBuilding.id);
  const alreadyComplete = Boolean(rules && teamState?.[rules.key] === true);
  const food = localTeam === null ? 0 : latestFood[localTeam];
  const wood = localTeam === null ? 0 : latestWood[localTeam];
  const canStart = Boolean(selectedBuilding && rules && selectedBuilding.complete === true
    && !alreadyComplete && !active && matchWinner < 0
    && food >= rules.foodCost && wood >= rules.woodCost);

  if (ui.buildingResearchReadout) {
    if (!selectedBuilding || !rules) ui.buildingResearchReadout.textContent = 'RESEARCH · SELECT A PRODUCTION BUILDING';
    else if (alreadyComplete) ui.buildingResearchReadout.textContent = `${rules.label} · COMPLETED · +20% ATTACK`;
    else if (researchingHere) {
      const percent = Math.round(Math.max(0, Math.min(1, Number(active.progress) || 0)) * 100);
      const remaining = Math.max(0, Math.ceil(Number(active.remaining) || 0));
      ui.buildingResearchReadout.textContent = `${rules.label} · RESEARCHING ${percent}% · ${remaining}S`;
    } else if (active) {
      const activeRules = ATTACK_UPGRADE_RULES[active.type === 'infantry-attack' ? 'barracks' : 'archery-range'];
      const activeBuilding = latestBuildings.find((building) => building.id === active.buildingId);
      ui.buildingResearchReadout.textContent = `RESEARCH BUSY · ${activeRules?.label || 'UPGRADE'}${activeBuilding ? ` AT #${activeBuilding.id}` : ''}`;
    } else if (!selectedBuilding.complete) {
      ui.buildingResearchReadout.textContent = `${rules.label} · COMPLETE BUILDING TO RESEARCH`;
    } else {
      const short = [];
      if (food < rules.foodCost) short.push(`${rules.foodCost - food} FOOD`);
      if (wood < rules.woodCost) short.push(`${rules.woodCost - wood} WOOD`);
      ui.buildingResearchReadout.textContent = `${rules.label} · +20% ATTACK · ${rules.foodCost} FOOD / ${rules.woodCost} WOOD · ${rules.durationSeconds}S${short.length ? ` · NEED ${short.join(' + ')}` : ''}`;
    }
  }
  if (ui.researchAttackUpgrade) {
    ui.researchAttackUpgrade.disabled = !canStart;
    ui.researchAttackUpgrade.setAttribute('aria-label', rules
      ? `Research ${rules.label.toLowerCase()} for ${rules.foodCost} food and ${rules.woodCost} wood; completes in ${rules.durationSeconds} seconds`
      : 'Select a friendly Barracks or Archery Range to research an attack upgrade');
  }
}

function buildingWoodCost(type) {
  return type === 'barracks' ? BARRACKS_WOOD_COST : ARCHERY_RANGE_WOOD_COST;
}

function buildingFootprint(type) {
  return type === 'barracks' ? BARRACKS_SIZE : ARCHERY_RANGE_SIZE;
}

function addResourceNodeVisual(node) {
  const nodeType = node.type === 'wood' ? 'wood' : 'food';
  const ringColor = nodeType === 'wood' ? 0x9bb877 : 0xe4bd63;
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: ringColor, side: THREE.DoubleSide, transparent: true, opacity: 0.78, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.66, 24), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(node.x, 0.035, node.z);
  ring.renderOrder = 2;
  addMapObject(ring);

  const props = [];
  if (nodeType !== 'wood') {
    const berries = createEnvironmentSprite('berries', 2.55, 1.56, node.x, node.z);
    addMapObject(berries);
    props.push(berries);
  }
  resourceNodeVisuals.set(node.id, { type: nodeType, ring, props, stock: node.stock });
}

function updateResourceNodeVisual(id, stock) {
  latestResourceStocks.set(id, stock);
  const visual = resourceNodeVisuals.get(id);
  if (!visual) return;
  visual.stock = stock;
  const nodeColor = visual.type === 'wood' ? 0x9bb877 : 0xe4bd63;
  visual.ring.material.color.setHex(stock > 0 ? nodeColor : 0x77806b);
  visual.ring.material.opacity = stock > 0 ? 0.78 : 0.35;
  for (const prop of visual.props) prop.visible = stock > 0;
  if (visual.type === 'wood') setWoodNodeTreesVisible(id, stock > 0);
}

function setWoodNodeTreesVisible(id, visible) {
  const slots = woodTreeNodeSlots.get(id);
  if (!slots?.length) return;
  for (const slot of slots) {
    for (const mesh of woodTreeMeshes) {
      setEnvironmentSpriteInstance(mesh, slot.index, slot.x, slot.z, visible ? slot.scale : 0);
    }
  }
  for (const mesh of woodTreeMeshes) mesh.instanceMatrix.needsUpdate = true;
}

function buildWoodNodeInstances(nodes = []) {
  woodTreeMeshes = [];
  woodTreeNodeSlots.clear();
  const woodNodes = nodes.filter((node) => node.type === 'wood');
  if (woodNodes.length === 0) return;
  const positions = woodNodes.map((node, index) => ({
    x: node.x, z: node.z, scale: 0.85 + (index % 3) * 0.07,
  }));
  const trees = createEnvironmentSpriteInstances('oak', 4.1, 3.75, positions);
  for (let index = 0; index < woodNodes.length; index++) {
    woodTreeNodeSlots.set(woodNodes[index].id, [{ index, ...positions[index] }]);
  }
  addMapObject(trees);
  woodTreeMeshes = [trees];
}

function buildFogOverlay(definition) {
  const pixels = new Uint8Array(MAP_WIDTH * MAP_HEIGHT * 4);
  for (let index = 0; index < MAP_WIDTH * MAP_HEIGHT; index++) {
    const offset = index * 4;
    pixels[offset] = 8;
    pixels[offset + 1] = 14;
    pixels[offset + 2] = 12;
    pixels[offset + 3] = definition.fogOfWar ? 255 : 0;
  }
  fogTexture = new THREE.DataTexture(pixels, MAP_WIDTH, MAP_HEIGHT, THREE.RGBAFormat);
  fogTexture.magFilter = THREE.NearestFilter;
  fogTexture.minFilter = THREE.NearestFilter;
  fogTexture.generateMipmaps = false;
  fogTexture.colorSpace = THREE.SRGBColorSpace;
  fogTexture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({
    map: fogTexture, transparent: true, depthTest: false, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
  });
  fogMesh = new THREE.Mesh(new THREE.PlaneGeometry(MAP_WIDTH, MAP_HEIGHT), material);
  fogMesh.rotation.x = -Math.PI / 2;
  fogMesh.position.y = 0.08;
  fogMesh.renderOrder = 12;
  fogMesh.frustumCulled = false;
  fogMesh.visible = definition.fogOfWar && localTeam !== null;
  addMapObject(fogMesh);
  minimapFogCanvas.width = MAP_WIDTH;
  minimapFogCanvas.height = MAP_HEIGHT;
  minimapFogImage = minimapFogContext.createImageData(MAP_WIDTH, MAP_HEIGHT);
  latestFogCells = null;
}

function updateFogFromState(state) {
  const fog = state.fogOfWar === true && localTeam !== null && state.visibility;
  if (!fog || !fogMesh || state.visibility.columns !== MAP_WIDTH || state.visibility.rows !== MAP_HEIGHT) {
    if (fogMesh) fogMesh.visible = false;
    latestFogCells = null;
    drawMinimap(performance.now(), true);
    return;
  }
  const binary = atob(state.visibility.data);
  const cellCount = MAP_WIDTH * MAP_HEIGHT;
  if (binary.length !== Math.ceil(cellCount / 4)) return;
  const texturePixels = fogTexture.image.data;
  const fogCells = latestFogCells?.length === cellCount ? latestFogCells : new Uint8Array(cellCount);
  const minimapPixels = minimapFogImage.data;
  const colorForState = [
    [8, 14, 12, 255],
    [8, 14, 12, 154],
    [8, 14, 12, 0],
  ];
  for (let cell = 0; cell < cellCount; cell++) {
    const stateCode = (binary.charCodeAt(cell >> 2) >> ((cell & 3) * 2)) & 3;
    fogCells[cell] = stateCode;
    const colorValue = colorForState[stateCode] || colorForState[0];
    const column = cell % MAP_WIDTH;
    const row = Math.floor(cell / MAP_WIDTH);
    const textureOffset = ((MAP_HEIGHT - 1 - row) * MAP_WIDTH + column) * 4;
    const minimapOffset = cell * 4;
    for (let channel = 0; channel < 4; channel++) {
      texturePixels[textureOffset + channel] = colorValue[channel];
      minimapPixels[minimapOffset + channel] = colorValue[channel];
    }
  }
  fogTexture.needsUpdate = true;
  minimapFogContext.putImageData(minimapFogImage, 0, 0);
  latestFogCells = fogCells;
  fogMesh.visible = true;
  drawMinimap(performance.now(), true);
}

function buildMap(definition) {
  fogTexture?.dispose();
  clearMapObjects();
  objectiveVisuals.clear();
  scenarioEventVisuals.clear();
  timedVictoryVisual = null;
  victoryHoldVisual = null;
  resourceNodeVisuals.clear();
  latestResourceStocks = new Map();
  objectivePanel.replaceChildren();
  if (tapOrderArmed) setTapOrderArmed(false, false);
  MAP_WIDTH = definition.width;
  MAP_HEIGHT = definition.height;
  MAP_HALF_X = MAP_WIDTH / 2;
  MAP_HALF_Z = MAP_HEIGHT / 2;
  clearBuildingVisuals();
  woodTreeNodeSlots.clear();
  woodTreeMeshes = [];
  latestBuildings = [];
  latestWorkerProduction = [null, null];
  if (buildPlacementActive) cancelBuildPlacement(false);

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_WIDTH + 4, MAP_HEIGHT + 4),
    new THREE.MeshStandardMaterial({ color: TERRAIN_COLORS[environmentTheme(definition)] || TERRAIN_COLORS.meadow, roughness: 1 }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.075;
  addMapObject(base);
  for (const surface of createGroundSurfaces(definition)) addMapObject(surface);

  // Rock silhouettes carry the visual boundary. Flat block tops made the ridge
  // look like a strip of square tiles when viewed from the oblique camera.
  const obstacleCount = definition.obstacles.reduce((count, obstacle) => (
    count + (obstacle.material === 'stone' ? 0 : obstacle.width * obstacle.height)
  ), 0);
  const obstacles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.02, 1.12, 1.02),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, flatShading: true }),
    obstacleCount,
  );
  const obstacleTints = { stone: [0x444944, 0x55594f], forest: [0x304934, 0x38533b], water: [0x3e6570, 0x4d7982] };
  let obstacleIndex = 0;
  for (const obstacle of definition.obstacles) {
    if (obstacle.material === 'stone') continue;
    const tints = obstacleTints[obstacle.material] || obstacleTints.stone;
    const visibleHeight = obstacle.material === 'forest' ? 0.17
      : 0.025;
    for (let row = obstacle.row; row < obstacle.row + obstacle.height; row++) {
      for (let column = obstacle.column; column < obstacle.column + obstacle.width; column++) {
        dummy.position.set(column - MAP_HALF_X + 0.5, visibleHeight / 2, row - MAP_HALF_Z + 0.5);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, visibleHeight / 1.12, 1);
        dummy.updateMatrix();
        obstacles.setMatrixAt(obstacleIndex, dummy.matrix);
        color.setHex((row + column + obstacleIndex) % 3 === 0 ? tints[0] : tints[1]);
        obstacles.setColorAt(obstacleIndex, color);
        obstacleIndex++;
      }
    }
  }
  obstacles.instanceMatrix.needsUpdate = true;
  if (obstacles.instanceColor) obstacles.instanceColor.needsUpdate = true;
  obstacles.castShadow = false;
  obstacles.receiveShadow = false;
  addMapObject(obstacles);
  addObstacleEnvironmentSprites(definition, MAP_HALF_X, MAP_HALF_Z, addMapObject);

  for (const spawn of definition.spawnPoints || []) addTownCenterVisual(spawn);
  buildWoodNodeInstances(definition.resourceNodes || []);
  for (const node of definition.resourceNodes || []) {
    addResourceNodeVisual(node);
    latestResourceStocks.set(node.id, node.stock);
  }

  for (const trigger of definition.triggers || []) {
    if (trigger.type !== 'capture-zone' || !trigger.zone) continue;
    const zone = trigger.zone;
    const x = zone.column - MAP_HALF_X + Math.min(zone.width - 0.5, 1.3);
    const z = zone.row - MAP_HALF_Z + Math.min(zone.height - 0.5, 1.3);
    addMapObject(createEnvironmentSprite('seamstone', 2.0, 2.6, x, z));
  }

  const edgeX = MAP_HALF_X;
  const edgeZ = MAP_HALF_Z;
  const borderPoints = [
    new THREE.Vector3(-edgeX, 0.004, -edgeZ), new THREE.Vector3(edgeX, 0.004, -edgeZ),
    new THREE.Vector3(edgeX, 0.004, -edgeZ), new THREE.Vector3(edgeX, 0.004, edgeZ),
    new THREE.Vector3(edgeX, 0.004, edgeZ), new THREE.Vector3(-edgeX, 0.004, edgeZ),
    new THREE.Vector3(-edgeX, 0.004, edgeZ), new THREE.Vector3(-edgeX, 0.004, -edgeZ),
  ];
  addMapObject(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(borderPoints),
    new THREE.LineBasicMaterial({ color: 0xc5d59b, transparent: true, opacity: 0.64 }),
  ));

  const gridPoints = [];
  for (let x = -edgeX + 8; x < edgeX; x += 8) {
    gridPoints.push(new THREE.Vector3(x, 0.003, -edgeZ), new THREE.Vector3(x, 0.003, edgeZ));
  }
  for (let z = -edgeZ + 8; z < edgeZ; z += 8) {
    gridPoints.push(new THREE.Vector3(-edgeX, 0.003, z), new THREE.Vector3(edgeX, 0.003, z));
  }
  addMapObject(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(gridPoints),
    new THREE.LineBasicMaterial({ color: 0xb4c98a, transparent: true, opacity: 0.14 }),
  ));

  const triggers = definition.triggers || [];
  const scenarioEvents = definition.scenarioEvents || [];
  objectivePanel.hidden = triggers.length + scenarioEvents.length === 0 && !definition.timedVictory;
  for (const trigger of triggers) {
    const zone = trigger.zone;
    const left = zone.column - MAP_HALF_X;
    const top = zone.row - MAP_HALF_Z;
    const right = left + zone.width;
    const bottom = top + zone.height;
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: 0xd5ef78, side: THREE.DoubleSide, transparent: true, opacity: 0.09, depthWrite: false,
    });
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(zone.width, zone.height), fillMaterial);
    fill.rotation.x = -Math.PI / 2;
    fill.position.set((left + right) / 2, 0.012, (top + bottom) / 2);
    fill.renderOrder = 1;
    addMapObject(fill);

    const outlinePoints = [
      new THREE.Vector3(left, 0.021, top), new THREE.Vector3(right, 0.021, top),
      new THREE.Vector3(right, 0.021, top), new THREE.Vector3(right, 0.021, bottom),
      new THREE.Vector3(right, 0.021, bottom), new THREE.Vector3(left, 0.021, bottom),
      new THREE.Vector3(left, 0.021, bottom), new THREE.Vector3(left, 0.021, top),
    ];
    const outlineMaterial = new THREE.LineBasicMaterial({ color: 0xd5ef78, transparent: true, opacity: 0.82 });
    const outline = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(outlinePoints), outlineMaterial);
    outline.renderOrder = 2;
    addMapObject(outline);

    const card = document.createElement('div');
    card.className = 'objective-card';
    const heading = document.createElement('div');
    heading.className = 'objective-heading';
    const label = document.createElement('span');
    label.className = 'objective-kicker';
    label.textContent = trigger.victory === true
      ? (definition.victoryMode === 'all' ? 'VICTORY · HOLD ALL' : 'VICTORY OBJECTIVE')
      : 'SCENARIO OBJECTIVE';
    const status = document.createElement('span');
    status.className = 'objective-status';
    status.textContent = 'NEUTRAL';
    heading.append(label, status);
    const title = document.createElement('strong');
    title.className = 'objective-title';
    title.textContent = trigger.name;
    const detail = document.createElement('small');
    detail.className = 'objective-detail';
    const foodReward = trigger.foodReward ?? 0;
    const woodReward = trigger.woodReward ?? 0;
    const unitCount = trigger.unitCount ?? 0;
    const rewards = [];
    if (foodReward > 0) rewards.push(`+${foodReward} food`);
    if (woodReward > 0) rewards.push(`+${woodReward} wood`);
    if (unitCount > 0) rewards.push(`${unitCount} ${(trigger.unitKind ?? 'infantry').toLowerCase()} on capture`);
    const prerequisiteIds = capturePrerequisiteIds(trigger);
    const prerequisiteNames = prerequisiteIds.map((id) => (
      definition.triggers.find((item) => item.id === id)?.name || id
    ));
    const prerequisite = prerequisiteNames.length ? `requires ${prerequisiteNames.join(' + ')}` : '';
    detail.textContent = [
      `${trigger.requiredUnits} units · ${trigger.captureSeconds}s to capture`,
      prerequisite,
      ...rewards,
    ].filter(Boolean).join(' · ');
    const progressTrack = document.createElement('div');
    progressTrack.className = 'objective-progress';
    const progressFill = document.createElement('i');
    progressTrack.append(progressFill);
    card.append(heading, title, detail, progressTrack);
    objectivePanel.append(card);
    objectiveVisuals.set(trigger.id, { fillMaterial, outlineMaterial, card, status, progressFill, trigger });
  }

  if ((definition.victoryHoldSeconds ?? 0) > 0) {
    const card = document.createElement('div');
    card.className = 'objective-card victory-hold-card';
    const heading = document.createElement('div');
    heading.className = 'objective-heading';
    const label = document.createElement('span');
    label.className = 'objective-kicker';
    label.textContent = 'VICTORY HOLD';
    const status = document.createElement('span');
    status.className = 'objective-status';
    heading.append(label, status);
    const title = document.createElement('strong');
    title.className = 'objective-title';
    title.textContent = definition.victoryMode === 'all' ? 'Hold every marked zone' : 'Hold a marked zone';
    const detail = document.createElement('small');
    detail.className = 'objective-detail';
    detail.textContent = `Maintain control for ${formatVictoryHoldTime(definition.victoryHoldSeconds)}. Losing the condition resets progress.`;
    const progressTrack = document.createElement('div');
    progressTrack.className = 'objective-progress';
    const progressFill = document.createElement('i');
    progressTrack.append(progressFill);
    card.append(heading, title, detail, progressTrack);
    objectivePanel.append(card);
    victoryHoldVisual = { card, status, progressFill, durationSeconds: definition.victoryHoldSeconds };
  }

  if (definition.timedVictory) {
    const objective = triggers.find((trigger) => trigger.id === definition.timedVictory.objectiveId);
    const card = document.createElement('div');
    card.className = 'objective-card timed-victory-card';
    const heading = document.createElement('div');
    heading.className = 'objective-heading';
    const label = document.createElement('span');
    label.className = 'objective-kicker';
    label.textContent = 'DEADLINE VICTORY';
    const status = document.createElement('span');
    status.className = 'objective-status';
    heading.append(label, status);
    const title = document.createElement('strong');
    title.className = 'objective-title';
    title.textContent = `Hold ${objective?.name || 'the decisive zone'}`;
    const detail = document.createElement('small');
    detail.className = 'objective-detail';
    const wholeSeconds = Math.ceil(definition.timedVictory.afterSeconds);
    const time = `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
    detail.textContent = `At ${time}, its current owner wins; unclaimed is a draw.`;
    card.append(heading, title, detail);
    objectivePanel.prepend(card);
    timedVictoryVisual = { card, status, rule: definition.timedVictory, objective };
  }

  for (const event of scenarioEvents) {
    const card = document.createElement('div');
    card.className = 'objective-card scenario-event-card';
    const heading = document.createElement('div');
    heading.className = 'objective-heading';
    const label = document.createElement('span');
    label.className = 'objective-kicker';
    const eventSourceIds = scenarioEventSourceIds(event.trigger);
    label.textContent = event.trigger?.type === 'capture' ? 'CAPTURE EVENT'
      : eventSourceIds.length > 1 ? 'JOINED EVENT'
        : event.trigger?.type === 'event' ? 'CHAINED EVENT' : 'TIMED EVENT';
    const status = document.createElement('span');
    status.className = 'objective-status';
    heading.append(label, status);
    const title = document.createElement('strong');
    title.className = 'objective-title';
    title.textContent = event.name;
    const detail = document.createElement('small');
    detail.className = 'objective-detail';
    const teamLabel = event.team === 'both' ? 'BOTH TEAMS'
      : event.team === 'capturing' ? 'CAPTURING TEAM' : event.team === '0' ? 'AZURE' : 'EMBER';
    const rewards = [];
    if (event.foodReward > 0) rewards.push(`+${event.foodReward} FOOD`);
    if ((event.woodReward ?? 0) > 0) rewards.push(`+${event.woodReward} WOOD`);
    if ((event.unitCount ?? 0) > 0) {
      rewards.push(`+${event.unitCount} ${(event.unitKind ?? 'infantry').toUpperCase()} / TEAM`);
    }
    if (event.technologyReward) {
      rewards.push(event.technologyReward === 'infantry-attack' ? 'INFANTRY FORGING' : 'ARCHER FLETCHING');
    }
    const objective = event.trigger?.type === 'capture'
      ? definition.triggers.find((trigger) => trigger.id === event.trigger.objectiveId) : null;
    const sourceEvents = eventSourceIds.map((sourceId) => (
      scenarioEvents.find((source) => source.id === sourceId)
    )).filter(Boolean);
    const triggerLabel = objective
      ? `${event.trigger.occurrence === 'recapture' ? 'ON RECAPTURE OF' : 'ON FIRST CAPTURE OF'} ${objective.name.toUpperCase()} · ${event.afterSeconds}s DELAY · `
      : sourceEvents.length > 1
        ? `AFTER ALL ${sourceEvents.map((source) => source.name.toUpperCase()).join(' + ')} · ${event.afterSeconds}s DELAY · `
        : sourceEvents.length === 1
          ? `AFTER ${sourceEvents[0].name.toUpperCase()} · ${event.afterSeconds}s DELAY · ` : '';
    const repeatLabel = event.repeatCount
      ? ` · ${event.repeatCount} REPEATS EVERY ${event.repeatEverySeconds}s` : '';
    detail.textContent = `${triggerLabel}${rewards.length > 0 ? rewards.join(' · ') : 'ANNOUNCEMENT ONLY'} · ${teamLabel}${repeatLabel}`;
    card.append(heading, title, detail);
    objectivePanel.append(card);
    scenarioEventVisuals.set(event.id, { card, status, event });
  }

  const title = document.querySelector('#map-label-title');
  const summary = document.querySelector('#map-summary');
  if (title) title.textContent = definition.name || definition.id.toUpperCase();
  if (summary) summary.textContent = definition.summary || `${MAP_WIDTH} × ${MAP_HEIGHT}`;
  document.querySelector('#scenario-brief-name').textContent = definition.name || definition.id.toUpperCase();
  document.querySelector('#scenario-brief-summary').textContent = definition.summary || 'Control the marked objectives and protect your army.';
  const deadline = document.querySelector('#scenario-brief-deadline');
  const decisiveZone = definition.triggers?.find((trigger) => trigger.id === definition.timedVictory?.objectiveId);
  deadline.hidden = !definition.timedVictory;
  deadline.textContent = definition.timedVictory
    ? `DEADLINE · ${formatVictoryHoldTime(definition.timedVictory.afterSeconds)} · Hold ${decisiveZone?.name || 'the decisive zone'} when time expires. Unclaimed is a draw.`
    : '';
  const victoryZones = (definition.triggers || []).filter((trigger) => trigger.victory === true);
  const holdSeconds = definition.victoryHoldSeconds ?? 0;
  const target = victoryZones.length === 1 ? 'the victory zone'
    : definition.victoryMode === 'all' ? `all ${victoryZones.length} victory zones` : 'any victory zone';
  document.querySelector('#scenario-brief-win-rule').textContent = victoryZones.length === 0
    ? 'Eliminate the opposing army to win.'
    : `${holdSeconds > 0 ? 'Hold' : 'Capture'} ${target}${holdSeconds > 0 ? ` for ${formatVictoryHoldTime(holdSeconds)}` : ''} to win.${holdSeconds > 0 ? ' Losing control resets the hold.' : ''}`;
  const briefZones = document.querySelector('#scenario-brief-zones');
  const briefZoneList = document.querySelector('#scenario-brief-zone-list');
  briefZones.hidden = !definition.triggers?.length;
  briefZoneList.replaceChildren();
  for (const trigger of definition.triggers || []) {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = trigger.name;
    const details = document.createElement('small');
    const prerequisites = capturePrerequisiteIds(trigger).map((id) => (
      definition.triggers.find((zone) => zone.id === id)?.name || id
    ));
    details.textContent = `${trigger.victory === true ? 'Victory zone' : 'Capture zone'} · ${trigger.requiredUnits} units · ${trigger.captureSeconds}s to capture${prerequisites.length ? ` · requires ${prerequisites.join(' + ')}` : ''}`;
    item.append(name, details);
    briefZoneList.append(item);
  }
  const footerMap = document.querySelector('#footer-map-name');
  if (footerMap) footerMap.textContent = definition.name || definition.id.toUpperCase();
  buildMinimapBackground(definition);
  buildFogOverlay(definition);
  latestObjectiveStates = new Map();
  latestScenarioEventStates = new Map();
  latestMatchElapsedSeconds = 0;
  latestScenarioClockStarted = false;
  scenarioClockSynchronizedAt = performance.now();
  setCamera();
}

function buildMinimapBackground(definition) {
  const context = minimapBackgroundContext;
  const width = minimapBackground.width;
  const height = minimapBackground.height;
  const rect = minimapMapRect(width, height, definition.width, definition.height);
  context.clearRect(0, 0, width, height);
  const baseTerrain = environmentTheme(definition);
  context.fillStyle = '#20231f';
  context.fillRect(0, 0, width, height);
  context.fillStyle = TERRAIN_COLORS[baseTerrain] || TERRAIN_COLORS.meadow;
  context.fillRect(rect.left, rect.top, rect.width, rect.height);
  for (const patch of definition.terrainPatches || []) {
    context.fillStyle = TERRAIN_COLORS[patch.material] || TERRAIN_COLORS.meadow;
    context.fillRect(rect.left + patch.column * rect.scale, rect.top + patch.row * rect.scale,
      patch.width * rect.scale, patch.height * rect.scale);
  }

  context.strokeStyle = 'rgba(220, 232, 193, 0.09)';
  context.lineWidth = 1;
  context.beginPath();
  for (let column = 0; column <= definition.width; column += 8) {
    const x = rect.left + column * rect.scale;
    context.moveTo(x, rect.top);
    context.lineTo(x, rect.top + rect.height);
  }
  for (let row = 0; row <= definition.height; row += 8) {
    const y = rect.top + row * rect.scale;
    context.moveTo(rect.left, y);
    context.lineTo(rect.left + rect.width, y);
  }
  context.stroke();

  const obstacleColors = { stone: '#343936', forest: '#304b32', water: '#286173' };
  for (const obstacle of definition.obstacles) {
    context.fillStyle = obstacleColors[obstacle.material] || obstacleColors.stone;
    context.fillRect(
      rect.left + obstacle.column * rect.scale,
      rect.top + obstacle.row * rect.scale,
      obstacle.width * rect.scale,
      obstacle.height * rect.scale,
    );
  }

  for (const trigger of definition.triggers || []) {
    const zone = trigger.zone;
    context.fillStyle = 'rgba(213, 239, 120, 0.11)';
    context.fillRect(
      rect.left + zone.column * rect.scale,
      rect.top + zone.row * rect.scale,
      zone.width * rect.scale,
      zone.height * rect.scale,
    );
    context.strokeStyle = 'rgba(213, 239, 120, 0.9)';
    context.lineWidth = Math.max(1.5, width / 240);
    context.strokeRect(
      rect.left + zone.column * rect.scale + 0.5,
      rect.top + zone.row * rect.scale + 0.5,
      zone.width * rect.scale - 1,
      zone.height * rect.scale - 1,
    );
  }

  for (const node of definition.resourceNodes || []) {
    context.beginPath();
    context.arc(
      rect.left + (node.x + MAP_HALF_X) * rect.scale,
      rect.top + (node.z + MAP_HALF_Z) * rect.scale,
      Math.max(2.5, Math.min(5.5, rect.scale * 0.55)),
      0, Math.PI * 2,
    );
    context.fillStyle = node.type === 'wood' ? '#9bb877' : '#e4bd63';
    context.fill();
    context.strokeStyle = 'rgba(17,25,18,.92)';
    context.lineWidth = 1.5;
    context.stroke();
  }

  for (const spawn of definition.spawnPoints) {
    const x = rect.left + (spawn.x + MAP_HALF_X) * rect.scale;
    const y = rect.top + (spawn.z + MAP_HALF_Z) * rect.scale;
    context.beginPath();
    context.arc(x, y, Math.max(3, Math.min(7, rect.scale * 0.42)), 0, Math.PI * 2);
    context.fillStyle = spawn.team === 0 ? '#73b8e8' : '#ef886c';
    context.fill();
    context.strokeStyle = 'rgba(13, 19, 15, 0.9)';
    context.lineWidth = 2;
    context.stroke();
  }

  context.strokeStyle = 'rgba(222, 235, 203, 0.8)';
  context.lineWidth = 2;
  context.strokeRect(rect.left + 1, rect.top + 1, rect.width - 2, rect.height - 2);
  minimapLastDrawAt = -Infinity;
}

function minimapMapRect(width, height, worldWidth = MAP_WIDTH, worldHeight = MAP_HEIGHT) {
  const scale = Math.min(width / worldWidth, height / worldHeight);
  const mapWidth = worldWidth * scale;
  const mapHeight = worldHeight * scale;
  return {
    left: (width - mapWidth) / 2,
    top: (height - mapHeight) / 2,
    width: mapWidth,
    height: mapHeight,
    scale,
  };
}

function minimapPoint(x, z, rect) {
  return {
    x: rect.left + (x + MAP_HALF_X) * rect.scale,
    y: rect.top + (z + MAP_HALF_Z) * rect.scale,
  };
}

function drawMinimap(now = performance.now(), force = false) {
  if (!mapDefinition || now - minimapLastDrawAt < 100 && !force) return;
  minimapLastDrawAt = now;
  const context = minimapContext;
  const width = minimapCanvas.width;
  const height = minimapCanvas.height;
  const rect = minimapMapRect(width, height);
  context.drawImage(minimapBackground, 0, 0);

  for (const trigger of mapDefinition.triggers || []) {
    const state = latestObjectiveStates.get(trigger.id);
    if (!state) continue;
    const zone = trigger.zone;
    const team = state.progressTeam >= 0 ? state.progressTeam : state.owner;
    const colorValue = team === 0 ? '115, 184, 232' : team === 1 ? '239, 136, 108' : '213, 239, 120';
    const alpha = state.progressTeam >= 0 ? 0.12 + state.progress * 0.24 : state.owner >= 0 ? 0.16 : 0.06;
    context.fillStyle = `rgba(${colorValue}, ${alpha})`;
    context.fillRect(
      rect.left + zone.column * rect.scale,
      rect.top + zone.row * rect.scale,
      zone.width * rect.scale,
      zone.height * rect.scale,
    );
  }

  for (const building of latestBuildings) {
    const point = minimapPoint(building.x, building.z, rect);
    const radius = building.type === 'barracks' ? 5 : 4;
    context.globalAlpha = building.complete === true ? 1 : 0.58;
    context.fillStyle = building.team === 0 ? '#73b8e8' : '#ef886c';
    context.strokeStyle = 'rgba(15,22,17,.95)';
    context.lineWidth = 1.5;
    context.beginPath();
    if (building.type === 'barracks') {
      context.moveTo(point.x, point.y - radius);
      context.lineTo(point.x + radius, point.y);
      context.lineTo(point.x, point.y + radius);
      context.lineTo(point.x - radius, point.y);
      context.closePath();
      context.fill();
      context.stroke();
    } else {
      context.rect(point.x - radius, point.y - radius, radius * 2, radius * 2);
      context.fill();
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  if (latestFogCells && minimapFogCanvas.width === MAP_WIDTH) {
    context.save();
    context.imageSmoothingEnabled = false;
    context.drawImage(minimapFogCanvas, rect.left, rect.top, rect.width, rect.height);
    context.restore();
  }

  for (let team = 0; team < teamUnits.length; team++) {
    context.fillStyle = team === 0 ? '#73b8e8' : '#ef886c';
    context.strokeStyle = 'rgba(13, 21, 15, .94)';
    context.lineWidth = 0.8;
    context.beginPath();
    for (const unit of teamUnits[team]) {
      if (unit.hp <= 0 || unit.visible === false) continue;
      const point = minimapPoint(unit.renderX, unit.renderZ, rect);
      const radius = selected.has(unit.id) ? 3.4 : 2.2;
      if (team === 0) {
        context.rect(point.x - radius, point.y - radius, radius * 2, radius * 2);
      } else {
        context.moveTo(point.x, point.y - radius);
        context.lineTo(point.x + radius, point.y);
        context.lineTo(point.x, point.y + radius);
        context.lineTo(point.x - radius, point.y);
        context.closePath();
      }
    }
    context.fill();
    context.stroke();
  }

  // Resource markers stay legible when hundreds of unit dots cover the same area.
  for (const node of mapDefinition.resourceNodes || []) {
    const column = Math.floor(node.x + MAP_HALF_X);
    const row = Math.floor(node.z + MAP_HALF_Z);
    const fogState = latestFogCells?.[row * MAP_WIDTH + column] ?? 2;
    if (fogState === 0) continue;
    const point = minimapPoint(node.x, node.z, rect);
    const stock = latestResourceStocks.get(node.id) ?? node.stock;
    context.globalAlpha = fogState === 1 ? 0.55 : 1;
    context.beginPath();
    context.arc(point.x, point.y, 6, 0, Math.PI * 2);
    context.fillStyle = 'rgba(13, 21, 15, .94)';
    context.fill();
    context.beginPath();
    context.arc(point.x, point.y, 3.8, 0, Math.PI * 2);
    context.fillStyle = stock > 0
      ? node.type === 'wood' ? '#9bb877' : '#e4bd63'
      : '#717b68';
    context.fill();
  }
  context.globalAlpha = 1;

  const viewportCorners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  let hasAllCorners = true;
  context.beginPath();
  viewportCorners.forEach(([x, y], index) => {
    pointerNdc.set(x, y);
    raycaster.setFromCamera(pointerNdc, camera);
    const point = raycaster.ray.intersectPlane(groundPlane, groundHit);
    if (!point) { hasAllCorners = false; return; }
    const mapped = minimapPoint(point.x, point.z, rect);
    if (index === 0) context.moveTo(mapped.x, mapped.y);
    else context.lineTo(mapped.x, mapped.y);
  });
  if (hasAllCorners) {
    context.closePath();
    context.fillStyle = 'rgba(213, 239, 120, 0.08)';
    context.fill();
    context.strokeStyle = '#e1f5a0';
    context.lineWidth = 2.5;
    context.setLineDash([8, 5]);
    context.stroke();
    context.setLineDash([]);
  }
}

function focusCameraFromMinimap(event) {
  const rect = minimapCanvas.getBoundingClientRect();
  const mapRect = minimapMapRect(rect.width, rect.height);
  const pixelX = THREE.MathUtils.clamp(event.clientX - rect.left, 0, rect.width);
  const pixelY = THREE.MathUtils.clamp(event.clientY - rect.top, 0, rect.height);
  cameraTarget.x = (pixelX - mapRect.left) / mapRect.scale - MAP_HALF_X;
  cameraTarget.z = (pixelY - mapRect.top) / mapRect.scale - MAP_HALF_Z;
  cameraTarget.x = THREE.MathUtils.clamp(cameraTarget.x, -MAP_HALF_X, MAP_HALF_X);
  cameraTarget.z = THREE.MathUtils.clamp(cameraTarget.z, -MAP_HALF_Z, MAP_HALF_Z);
  setCamera();
  drawMinimap(performance.now(), true);
}

function makeInstances(geometry, material, capacity) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);
  return mesh;
}

function addPaintedFacets(geometry) {
  const normals = geometry.getAttribute('normal');
  const shades = new Float32Array(normals.count * 3);
  for (let index = 0; index < normals.count; index++) {
    const value = THREE.MathUtils.clamp(
      0.77 - normals.getX(index) * 0.13 + normals.getY(index) * 0.17 + normals.getZ(index) * 0.06,
      0.63, 1,
    );
    shades[index * 3] = value;
    shades[index * 3 + 1] = value;
    shades[index * 3 + 2] = value;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(shades, 3));
  return geometry;
}

for (let team = 0; team < 2; team++) {
  bodyMeshes[team] = makeInstances(
    addPaintedFacets(new THREE.CylinderGeometry(0.16, 0.235, 0.48, 6, 1)),
    new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }),
    MAX_PER_TEAM,
  );
  headMeshes[team] = makeInstances(
    addPaintedFacets(new THREE.SphereGeometry(0.145, 7, 5)),
    new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }),
    MAX_PER_TEAM,
  );
  bowMeshes[team] = makeInstances(
    new THREE.TorusGeometry(0.3, 0.04, 4, 9, Math.PI * 1.28),
    new THREE.MeshBasicMaterial({ color: 0xb88c58 }),
    MAX_PER_TEAM,
  );
  const shieldGeometry = new THREE.CylinderGeometry(0.3, 0.28, 0.065, 6);
  shieldGeometry.rotateX(Math.PI / 2);
  shieldMeshes[team] = makeInstances(
    shieldGeometry,
    new THREE.MeshBasicMaterial({ color: team === 0 ? 0x315b76 : 0x8a4639 }),
    MAX_PER_TEAM,
  );
  const spearGeometry = new THREE.LatheGeometry([
    new THREE.Vector2(0.025, 0), new THREE.Vector2(0.025, 0.69),
    new THREE.Vector2(0.072, 0.76), new THREE.Vector2(0, 0.98),
  ], 5);
  spearGeometry.translate(0, -0.43, 0);
  spearMeshes[team] = makeInstances(
    spearGeometry,
    new THREE.MeshBasicMaterial({ color: 0x5c5649 }),
    MAX_PER_TEAM,
  );
  const toolShape = new THREE.Shape();
  toolShape.moveTo(-0.027, -0.32);
  toolShape.lineTo(0.027, -0.32);
  toolShape.lineTo(0.027, 0.12);
  toolShape.lineTo(0.19, 0.16);
  toolShape.lineTo(0.19, 0.23);
  toolShape.lineTo(-0.18, 0.23);
  toolShape.lineTo(-0.18, 0.16);
  toolShape.lineTo(-0.027, 0.12);
  toolShape.closePath();
  const toolGeometry = new THREE.ExtrudeGeometry(toolShape, { depth: 0.035, bevelEnabled: false });
  toolMeshes[team] = makeInstances(
    toolGeometry,
    new THREE.MeshBasicMaterial({ color: 0x6f644d, side: THREE.DoubleSide }),
    MAX_PER_TEAM,
  );
  packMeshes[team] = makeInstances(
    new THREE.BoxGeometry(0.34, 0.32, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    MAX_PER_TEAM,
  );
  quiverMeshes[team] = makeInstances(
    new THREE.ConeGeometry(0.15, 0.52, 5),
    new THREE.MeshBasicMaterial({ color: 0x75553d }),
    MAX_PER_TEAM,
  );
}

const selectionMesh = makeInstances(
  new THREE.RingGeometry(0.31, 0.39, 18),
  new THREE.MeshBasicMaterial({ color: 0xd8f47b, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
  MAX_UNITS,
);
selectionMesh.renderOrder = 2;

const attackFocusMesh = makeInstances(
  new THREE.RingGeometry(0.56, 0.72, 24),
  new THREE.MeshBasicMaterial({
    color: 0xffd86f, side: THREE.DoubleSide, transparent: true,
    opacity: 0.96, depthWrite: false,
  }),
  MAX_UNITS,
);
attackFocusMesh.renderOrder = 2.25;
let attackFocusDirty = false;
let nextAttackFocusSlot = 0;

const moveMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.5, 0.57, 36),
  new THREE.MeshBasicMaterial({ color: 0xe5f79a, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }),
);
moveMarker.rotation.x = -Math.PI / 2;
moveMarker.position.y = 0.04;
moveMarker.visible = false;
moveMarker.renderOrder = 3;
scene.add(moveMarker);

const arrowTraces = [];
const arrowImpacts = [];
const arrowAxis = new THREE.Vector3(0, 0, 1);
const arrowDirection = new THREE.Vector3();
const arrowMesh = makeInstances(
  new THREE.BoxGeometry(0.035, 0.035, 0.28),
  new THREE.MeshBasicMaterial({ color: 0xe9ce94, transparent: true, opacity: 0.86, depthWrite: false }),
  MAX_ARROW_TRACES,
);
arrowMesh.renderOrder = 3;
const arrowImpactMesh = makeInstances(
  new THREE.RingGeometry(0.12, 0.2, 8),
  new THREE.MeshBasicMaterial({
    color: 0xe9ce94, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false,
  }),
  MAX_ARROW_TRACES,
);
arrowImpactMesh.renderOrder = 3;

function addArrowTrace(fromX, fromZ, toX, toZ, now) {
  if (!Number.isFinite(fromX) || !Number.isFinite(fromZ)
    || !Number.isFinite(toX) || !Number.isFinite(toZ)) return;
  if (Math.hypot(toX - fromX, toZ - fromZ) < 0.45) return;
  if (arrowTraces.length >= MAX_ARROW_TRACES) arrowTraces.shift();
  arrowTraces.push({ fromX, fromZ, toX, toZ, startedAt: now });
}

function animateArrowEffects(now) {
  let traceCount = 0;
  for (let index = 0; index < arrowTraces.length; index++) {
    const trace = arrowTraces[index];
    const progress = (now - trace.startedAt) / 180;
    if (progress >= 1) {
      if (arrowImpacts.length >= MAX_ARROW_TRACES) arrowImpacts.shift();
      arrowImpacts.push({ x: trace.toX, z: trace.toZ, startedAt: now });
      continue;
    }
    arrowTraces[traceCount] = trace;
    arrowDirection.set(trace.toX - trace.fromX, 0, trace.toZ - trace.fromZ).normalize();
    dummy.position.set(
      THREE.MathUtils.lerp(trace.fromX, trace.toX, progress),
      0.46 + Math.sin(progress * Math.PI) * 0.12,
      THREE.MathUtils.lerp(trace.fromZ, trace.toZ, progress),
    );
    dummy.quaternion.setFromUnitVectors(arrowAxis, arrowDirection);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    arrowMesh.setMatrixAt(traceCount++, dummy.matrix);
  }
  arrowTraces.length = traceCount;
  arrowMesh.count = traceCount;
  if (traceCount) arrowMesh.instanceMatrix.needsUpdate = true;

  let impactCount = 0;
  for (let index = 0; index < arrowImpacts.length; index++) {
    const impact = arrowImpacts[index];
    const progress = (now - impact.startedAt) / 170;
    if (progress >= 1) continue;
    arrowImpacts[impactCount] = impact;
    dummy.position.set(impact.x, 0.045, impact.z);
    dummy.quaternion.copy(ringRotation);
    dummy.scale.setScalar(0.55 + progress * 1.25);
    dummy.updateMatrix();
    arrowImpactMesh.setMatrixAt(impactCount++, dummy.matrix);
  }
  arrowImpacts.length = impactCount;
  arrowImpactMesh.count = impactCount;
  if (impactCount) arrowImpactMesh.instanceMatrix.needsUpdate = true;
}

const placementGhost = new THREE.Group();
const placementGhostMaterials = [
  new THREE.MeshBasicMaterial({ color: 0x9cdb8a, transparent: true, opacity: 0.25, depthWrite: false }),
  new THREE.MeshBasicMaterial({ color: 0x9cdb8a, transparent: true, opacity: 0.52, depthWrite: false }),
];
const ghostFootprint = new THREE.Mesh(new THREE.PlaneGeometry(ARCHERY_RANGE_SIZE, ARCHERY_RANGE_SIZE), placementGhostMaterials[0]);
ghostFootprint.rotation.x = -Math.PI / 2;
ghostFootprint.position.y = 0.025;
placementGhost.add(ghostFootprint);
const ghostFoundation = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 2.8), placementGhostMaterials[1]);
ghostFoundation.position.y = 0.13;
placementGhost.add(ghostFoundation);
const ghostRoof = new THREE.Mesh(new THREE.BoxGeometry(3.38, 0.13, 2.6), placementGhostMaterials[1]);
ghostRoof.rotation.x = -0.12;
ghostRoof.position.y = 1.3;
placementGhost.add(ghostRoof);
const ghostBarracksWalls = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.72, 2.35), placementGhostMaterials[1]);
ghostBarracksWalls.position.y = 0.52;
ghostBarracksWalls.visible = false;
placementGhost.add(ghostBarracksWalls);
const ghostBarracksRoofPanels = [-1, 1].map((side) => {
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.16, 3.12), placementGhostMaterials[1]);
  panel.position.set(side * 0.72, 1.02, 0);
  panel.rotation.z = -side * 0.42;
  panel.visible = false;
  placementGhost.add(panel);
  return panel;
});
placementGhost.visible = false;
placementGhost.renderOrder = 4;
scene.add(placementGhost);

function updateUnitCargoCueColor(unit) {
  const state = unitCargoVisualState(unit.kind, unit.hp, unit.visible, unit.cargo, unit.cargoType);
  if (unit.cargoVisualState === state) return;
  // Cargo color is state data, not team identity, and stays in the existing backpack batch.
  packMeshes[unit.team].setColorAt(unit.slot, unitCargoPackColors[state]);
  unitCargoPackColorDirty[unit.team] = true;
  unit.cargoVisualState = state;
}

function flushUnitCargoPackColor(team) {
  if (!unitCargoPackColorDirty[team]) return;
  if (packMeshes[team].instanceColor) packMeshes[team].instanceColor.needsUpdate = true;
  unitCargoPackColorDirty[team] = false;
}

function setUnitTint(unit) {
  const health = Math.max(0, unit.hp) / 100;
  const strength = unit.hp > 0 ? 0.7 + health * 0.3 : unit.defeatStartedAt > 0 ? 0.58 : 0;
  const flashing = unit.damageFlashUntil > performance.now();
  color.setHex(TEAM_HEX[unit.team]);
  if (unit.kind === 'worker') color.lerp(workerBodyTint, 0.42);
  else if (unit.kind === 'archer') color.lerp(archerBodyTint, 0.27);
  if (flashing) color.lerp(unitDamageFlashTint, 0.78);
  color.multiplyScalar(unit.tintVariation * strength);
  bodyMeshes[unit.team].setColorAt(unit.slot, color);
  color.setHex(unit.kind === 'worker' ? 0xd7be8f : unit.kind === 'archer' ? 0x839477 : 0xabb2ad);
  if (flashing) color.lerp(unitDamageFlashTint, 0.82);
  color.multiplyScalar((0.91 + ((unit.id * 7) % 10) / 100) * strength);
  headMeshes[unit.team].setColorAt(unit.slot, color);
  bodyMeshes[unit.team].instanceColor.needsUpdate = true;
  headMeshes[unit.team].instanceColor.needsUpdate = true;
}

function updateUnitTransform(unit, now = performance.now()) {
  const spawnProgress = unit.spawnStartedAt > 0
    ? THREE.MathUtils.clamp((now - unit.spawnStartedAt) / SPAWN_POSE_MS, 0, 1) : 1;
  const defeatProgress = unit.defeatStartedAt > 0
    ? THREE.MathUtils.clamp((now - unit.defeatStartedAt) / DEFEAT_POSE_MS, 0, 1) : 0;
  const visibleScale = unit.visible === false ? 0 : unit.hp > 0
    ? unit.scale * (0.28 + spawnProgress * 0.72)
    : unit.defeatStartedAt > 0 ? unit.scale * (1 - defeatProgress) : 0;
  const isWorker = unit.kind === 'worker';
  const isArcher = unit.kind === 'archer';
  const bodyScale = isWorker ? visibleScale * 0.82 : isArcher ? visibleScale * 0.9 : visibleScale;
  const actionPoseAllowed = unitActionPoseAllowed(unit.hp, unit.defeatStartedAt);
  const stride = actionPoseAllowed && unit.walking ? Math.sin(unit.motionPhase || 0) * 0.038 : 0;
  const idleBreath = actionPoseAllowed && !unit.walking
    && unit.task !== 'gathering' && unit.task !== 'building' && unit.attackStartedAt === 0
    ? Math.sin(now * 0.0024 + unit.id * 1.7) * 0.018 : 0;
  const attackAge = actionPoseAllowed && unit.attackStartedAt > 0
    ? (now - unit.attackStartedAt) / ATTACK_POSE_MS : 1;
  const attackPose = attackAge >= 0 && attackAge < 1 ? Math.sin(attackAge * Math.PI) : 0;
  const hitAge = actionPoseAllowed && unit.hitStartedAt > 0
    ? (now - unit.hitStartedAt) / HIT_POSE_MS : 1;
  const hitPose = hitAge >= 0 && hitAge < 1 ? Math.sin(hitAge * Math.PI) : 0;
  const workSwing = actionPoseAllowed && isWorker && !unit.walking
    && (unit.task === 'gathering' || unit.task === 'building')
    ? Math.sin(unit.motionPhase || 0) * 0.46 : isWorker ? attackPose * 0.55 : 0;
  const forwardX = Math.sin(unit.angle);
  const forwardZ = Math.cos(unit.angle);
  const sideX = Math.cos(unit.angle);
  const sideZ = -Math.sin(unit.angle);
  facing.setFromAxisAngle(worldUp, unit.angle);
  dummy.position.set(unit.renderX + forwardX * (attackPose * 0.05 - hitPose * 0.075),
    (isWorker ? 0.23 : isArcher ? 0.25 : 0.27) + Math.max(0, stride) + idleBreath
      - defeatProgress * 0.16,
    unit.renderZ + forwardZ * (attackPose * 0.05 - hitPose * 0.075));
  dummy.quaternion.copy(facing);
  dummy.rotateX(attackPose * (isArcher ? -0.13 : 0.18) - hitPose * 0.18);
  dummy.rotateZ(defeatProgress * 0.9);
  dummy.scale.setScalar(bodyScale);
  dummy.updateMatrix();
  bodyMeshes[unit.team].setMatrixAt(unit.slot, dummy.matrix);

  dummy.position.set(unit.renderX + sideX * defeatProgress * 0.16,
    (isWorker ? 0.48 : isArcher ? 0.54 : 0.61) + Math.max(0, stride) + idleBreath * 0.7
      - hitPose * 0.035 - defeatProgress * 0.34,
    unit.renderZ + sideZ * defeatProgress * 0.16);
  dummy.quaternion.identity();
  dummy.scale.setScalar(bodyScale);
  dummy.updateMatrix();
  headMeshes[unit.team].setMatrixAt(unit.slot, dummy.matrix);

  const bowScale = isArcher ? visibleScale : 0;
  dummy.position.set(
    unit.renderX + sideX * 0.25 + forwardX * 0.09,
    isArcher ? 0.43 : 0,
    unit.renderZ + sideZ * 0.25 + forwardZ * 0.09,
  );
  dummy.quaternion.copy(facing);
  dummy.rotateY(attackPose * 0.22);
  dummy.scale.setScalar(bowScale);
  dummy.updateMatrix();
  bowMeshes[unit.team].setMatrixAt(unit.slot, dummy.matrix);

  dummy.position.set(unit.renderX - sideX * 0.235 + forwardX * 0.1, 0.42 + Math.max(0, stride),
    unit.renderZ - sideZ * 0.235 + forwardZ * 0.1);
  dummy.quaternion.copy(facing);
  dummy.rotateX(-attackPose * 0.16 + hitPose * 0.22);
  dummy.scale.setScalar(isWorker || isArcher ? 0 : visibleScale);
  dummy.updateMatrix();
  shieldMeshes[unit.team].setMatrixAt(unit.slot, dummy.matrix);

  dummy.position.set(unit.renderX + sideX * 0.24, 0.57 + Math.max(0, stride),
    unit.renderZ + sideZ * 0.24);
  dummy.quaternion.copy(facing);
  dummy.rotateX(attackPose * 0.66);
  dummy.scale.setScalar(isWorker || isArcher ? 0 : visibleScale);
  dummy.updateMatrix();
  spearMeshes[unit.team].setMatrixAt(unit.slot, dummy.matrix);

  dummy.position.set(unit.renderX + sideX * 0.265, 0.43 + Math.max(0, stride), unit.renderZ + sideZ * 0.265);
  dummy.quaternion.copy(facing);
  dummy.rotateZ(-0.2 + workSwing);
  dummy.scale.setScalar(isWorker ? visibleScale : 0);
  dummy.updateMatrix();
  toolMeshes[unit.team].setMatrixAt(unit.slot, dummy.matrix);

  dummy.position.set(unit.renderX - forwardX * 0.19, 0.32 + Math.max(0, stride), unit.renderZ - forwardZ * 0.19);
  dummy.quaternion.copy(facing);
  dummy.scale.setScalar(isWorker ? visibleScale : 0);
  dummy.updateMatrix();
  packMeshes[unit.team].setMatrixAt(unit.slot, dummy.matrix);

  dummy.position.set(unit.renderX - forwardX * 0.18 + sideX * 0.17, 0.42 + Math.max(0, stride),
    unit.renderZ - forwardZ * 0.18 + sideZ * 0.17);
  dummy.quaternion.copy(facing);
  dummy.scale.setScalar(isArcher ? visibleScale : 0);
  dummy.updateMatrix();
  quiverMeshes[unit.team].setMatrixAt(unit.slot, dummy.matrix);

  const focused = unit.hp > 0 && unit.visible !== false && unit.targetedBy >= 2;
  if (focused || unit.focused || !unit.focusMatrixInitialized) {
    const focusScale = focused
      ? unit.scale * (0.96 + Math.min(0.3, (unit.targetedBy - 2) * 0.018)) : 0;
    dummy.position.set(unit.renderX, 0.03, unit.renderZ);
    dummy.quaternion.copy(ringRotation);
    dummy.scale.setScalar(focusScale);
    dummy.updateMatrix();
    attackFocusMesh.setMatrixAt(unit.focusSlot, dummy.matrix);
    unit.focused = focused;
    unit.focusMatrixInitialized = true;
    attackFocusDirty = true;
  }
}

function setArmySize(count, showMessage = false) {
  if (buildPlacementActive) cancelBuildPlacement(false);
  lastFriendlyUnitClick = null;
  lastUnitPickState = null;
  selected.clear();
  clearControlGroups();
  units.length = 0;
  teamUnits[0].length = 0;
  teamUnits[1].length = 0;
  unitArtMeshes.forEach((pair) => pair.forEach((mesh) => { mesh.count = 0; }));
  arrowTraces.length = 0;
  arrowImpacts.length = 0;
  arrowMesh.count = 0;
  arrowImpactMesh.count = 0;
  attackFocusMesh.count = 0;
  attackFocusDirty = false;
  nextAttackFocusSlot = 0;
  currentArmySize = Math.min(MAX_UNITS, count);
  const teamCount = currentArmySize / 2;
  const columns = Math.ceil(Math.sqrt(teamCount * 1.3));
  const rows = Math.ceil(teamCount / columns);
  const spacing = currentArmySize > 1000 ? 0.68 : 0.88;

  for (let id = 0; id < currentArmySize; id++) {
    const team = id < teamCount ? 0 : 1;
    const slot = teamUnits[team].length;
    const spawn = mapDefinition?.spawnPoints?.find((point) => point.team === team) || { x: team === 0 ? -18 : 18, z: 0 };
    const kind = slot < WORKERS_PER_TEAM ? 'worker' : 'infantry';
    const workerOffsets = [[-1.1, -0.9], [1.1, -0.9], [-1.1, 0.9], [1.1, 0.9]];
    const offset = workerOffsets[slot];
    const x = spawn.x + (offset?.[0] ?? (slot % columns - (columns - 1) / 2) * spacing);
    const z = spawn.z + (offset?.[1] ?? (Math.floor(slot / columns) - (rows - 1) / 2) * spacing);
    const unit = {
      id, team, slot, focusSlot: nextAttackFocusSlot++, renderX: x, renderZ: z, serverX: x, serverZ: z,
      hp: 100, generation: 0, scale: 0.94 + ((id * 17) % 12) / 100,
      tintVariation: 0.88 + ((id * 13) % 15) / 100, kind, cargo: 0, cargoType: null,
      targetedBy: 0, focused: false, focusMatrixInitialized: false,
      walking: false, motionPhase: id * 1.7,
      attackStartedAt: 0, hitStartedAt: 0, spawnStartedAt: 0,
      defeatStartedAt: 0, lastPlayedAttackTick: -1,
      task: kind === 'worker' ? 'unknown' : null,
      visible: !mapDefinition?.fogOfWar || localTeam === null || team === localTeam,
      angle: team === 0 ? Math.PI / 2 : -Math.PI / 2,
      targetAngle: team === 0 ? Math.PI / 2 : -Math.PI / 2,
    };
    units.push(unit);
    teamUnits[team].push(unit);
    unitArtMeshes.forEach((pair) => { pair[team].count = slot + 1; });
    setUnitTint(unit);
    updateUnitTransform(unit);
    updateUnitCargoCueColor(unit);
  }
  for (let team = 0; team < 2; team++) {
    unitArtMeshes.forEach((pair) => { pair[team].instanceMatrix.needsUpdate = true; });
    flushUnitCargoPackColor(team);
  }
  attackFocusMesh.count = nextAttackFocusSlot;
  if (attackFocusDirty) {
    attackFocusMesh.instanceMatrix.needsUpdate = true;
    attackFocusDirty = false;
  }
  ui.total.textContent = currentArmySize.toLocaleString();
  document.querySelectorAll('.size-options button').forEach((button) => {
    const active = Number(button.dataset.count) === currentArmySize;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  selectionDirty = true;
  syncSelectionMesh();
  updateSelectionUI();
  updateEconomyUI();
  if (showMessage) showToast(`BATTLEFIELD RESET · ${currentArmySize.toLocaleString()} UNITS`, 1500);
}

function updateSelectionUI() {
  const selectedBuilding = latestBuildings.find((building) => building.id === selectedBuildingId
    && building.team === localTeam) || null;
  ui.selectedBuildingCard.hidden = !selectedBuilding;
  document.querySelector('#dock-selection').dataset.focus = selectedBuilding ? 'building' : 'units';
  if (selectedBuilding) {
    const maxHp = Math.max(1, Number(selectedBuilding.maxHp) || 1800);
    const hp = Math.max(0, Math.min(maxHp, Number(selectedBuilding.hp) || 0));
    const healthRatio = hp / maxHp;
    const construction = Math.round(Math.max(0, Math.min(1, Number(selectedBuilding.progress) || 0)) * 100);
    const queued = getBuildingQueueLength(selectedBuilding);
    const troop = selectedBuilding.type === 'barracks' ? 'infantry' : 'archers';
    const training = Math.round(Math.max(0, Math.min(1, Number(selectedBuilding.trainingProgress) || 0)) * 100);
    ui.selectedBuildingName.textContent = `${buildingLabel(selectedBuilding.type)} #${selectedBuilding.id}`;
    ui.selectedBuildingState.textContent = selectedBuilding.attackers > 0 ? 'UNDER ATTACK'
      : selectedBuilding.complete ? 'READY' : `BUILDING · ${construction}%`;
    ui.selectedBuildingCard.dataset.danger = healthRatio <= 0.25 || selectedBuilding.attackers > 0 ? 'high'
      : healthRatio <= 0.55 ? 'medium' : 'none';
    ui.selectedBuildingHealth.textContent = `${Math.round(hp).toLocaleString()} / ${Math.round(maxHp).toLocaleString()} HP`;
    ui.selectedBuildingHealthBar.style.setProperty('--health-ratio', healthRatio);
    ui.selectedBuildingHealthBar.setAttribute('aria-valuemax', String(Math.round(maxHp)));
    ui.selectedBuildingHealthBar.setAttribute('aria-valuenow', String(Math.round(hp)));
    ui.selectedBuildingProduction.textContent = !selectedBuilding.complete
      ? 'Finish construction to unlock production.'
      : selectedBuilding.productionBlocked ? 'Production blocked · clear the spawn area.'
        : queued > 0 ? `${queued.toLocaleString()} ${troop} queued · ${training}% training`
          : `Ready to train ${troop}.`;
  }
  let blue = 0;
  let red = 0;
  let workers = 0;
  let infantry = 0;
  let archers = 0;
  let unitsWithQueuedWaypoints = 0;
  let queuedWaypointTotal = 0;
  for (const id of selected) {
    const unit = units[id];
    if (!unit || unit.hp <= 0) continue;
    if (unit.team === 0) blue++;
    else red++;
    if (unit.kind === 'worker') workers++;
    else if (unit.kind === 'archer') archers++;
    else if (unit.kind === 'infantry') infantry++;
    const queuedWaypoints = Number.isInteger(unit.queuedWaypointCount) ? unit.queuedWaypointCount : 0;
    if (queuedWaypoints > 0) {
      unitsWithQueuedWaypoints++;
      queuedWaypointTotal += queuedWaypoints;
    }
  }
  ui.selected.textContent = selected.size.toLocaleString();
  ui.selectedBlue.textContent = blue.toLocaleString();
  ui.selectedRed.textContent = red.toLocaleString();
  ui.selectedWorkers.textContent = workers.toLocaleString();
  ui.selectedInfantry.textContent = infantry.toLocaleString();
  ui.selectedArchers.textContent = archers.toLocaleString();
  if (ui.selectedWaypoints) {
    ui.selectedWaypoints.hidden = selected.size === 0 || queuedWaypointTotal === 0;
    ui.selectedWaypoints.textContent = `${queuedWaypointTotal.toLocaleString()} QUEUED WAYPOINTS · ${unitsWithQueuedWaypoints.toLocaleString()} UNITS`;
  }
}

function updateControlGroupUI() {
  for (let index = 0; index < controlGroups.length; index++) {
    const button = ui.controlGroups[index];
    const group = controlGroups[index];
    if (!button) continue;
    const number = controlGroupKeyLabel(index);
    const count = group.size;
    const composition = summarizeUnitComposition(units, group, localTeam);
    const compositionCount = composition.workers + composition.infantry + composition.archers;
    const countElement = button.querySelector('.control-group-count');
    if (countElement) countElement.textContent = count.toLocaleString();
    button.classList.toggle('filled', count > 0);
    button.classList.toggle('has-composition', compositionCount > 0);
    button.style.setProperty('--group-worker-color', composition.workers > 0 ? '#76c596' : 'rgba(118,197,150,.14)');
    button.style.setProperty('--group-infantry-color', composition.infantry > 0 ? '#d5ef78' : 'rgba(213,239,120,.14)');
    button.style.setProperty('--group-archer-color', composition.archers > 0 ? '#efa071' : 'rgba(239,160,113,.14)');
    button.classList.toggle('active', activeControlGroup === index);
    button.setAttribute('aria-pressed', String(activeControlGroup === index));
    const compositionLabel = `${composition.workers.toLocaleString()} workers, ${composition.infantry.toLocaleString()} infantry, ${composition.archers.toLocaleString()} archers`;
    button.setAttribute('aria-label', `Control group ${number}: ${count.toLocaleString()} living friendly units; ${compositionLabel}`);
    button.title = `${count.toLocaleString()} living units · ${compositionLabel} · Ctrl/⌘ + ${number} replaces · Shift + ${number} adds · ${number} recalls`;
    button.disabled = localTeam === null;
  }
}

function controlGroupKeyLabel(index) {
  return String((index + 1) % 10);
}

function clearControlGroups() {
  for (const group of controlGroups) group.clear();
  activeControlGroup = null;
  lastControlGroupRecall = null;
  updateControlGroupUI();
}

function revalidateControlGroups() {
  let changed = false;
  for (const group of controlGroups) {
    for (const id of group) {
      const unit = units[id];
      if (!unit || unit.hp <= 0 || unit.team !== localTeam) {
        group.delete(id);
        changed = true;
      }
    }
  }
  if (activeControlGroup !== null && controlGroups[activeControlGroup].size === 0) {
    activeControlGroup = null;
    changed = true;
  }
  if (changed) updateControlGroupUI();
}

function clearActiveControlGroup() {
  lastControlGroupRecall = null;
  const buildingChanged = selectedBuildingId !== null;
  if (buildingChanged) {
    selectedBuildingId = null;
    for (const visual of buildingVisuals.values()) updateBuildingSelectionVisual(visual, false);
  }
  if (activeControlGroup !== null) {
    activeControlGroup = null;
    updateControlGroupUI();
  }
  if (buildingChanged) {
    updateCommandUI();
    updateEconomyUI();
  }
}

function assignControlGroup(index, append = false) {
  if (localTeam === null) {
    showToast('SPECTATORS CANNOT ASSIGN CONTROL GROUPS');
    return;
  }
  const ids = selectedIds();
  if (ids.length === 0) {
    showToast('SELECT FRIENDLY UNITS BEFORE ASSIGNING A GROUP');
    return;
  }
  revalidateControlGroups();
  const group = controlGroups[index];
  const previousCount = group.size;
  if (!append) group.clear();
  for (const id of ids) group.add(id);
  const addedCount = group.size - previousCount;
  activeControlGroup = index;
  lastControlGroupRecall = null;
  updateControlGroupUI();
  const keyLabel = controlGroupKeyLabel(index);
  showToast(append
    ? `CONTROL GROUP ${keyLabel} UPDATED · +${addedCount.toLocaleString()} · ${group.size.toLocaleString()} TOTAL`
    : `CONTROL GROUP ${keyLabel} SET · ${group.size.toLocaleString()} UNITS`);
}

function centerCameraOnControlGroup(groupUnits) {
  let x = 0;
  let z = 0;
  for (const unit of groupUnits) {
    x += unit.renderX;
    z += unit.renderZ;
  }
  cameraTarget.x = x / groupUnits.length;
  cameraTarget.z = z / groupUnits.length;
  setCamera();
  drawMinimap(performance.now(), true);
}

function recallControlGroup(index) {
  if (localTeam === null) {
    showToast('SPECTATORS CANNOT RECALL CONTROL GROUPS');
    return;
  }
  const group = controlGroups[index];
  const groupUnits = [...group]
    .map((id) => units[id])
    .filter((unit) => unit && unit.hp > 0 && unit.team === localTeam);
  if (groupUnits.length !== group.size) {
    group.clear();
    for (const unit of groupUnits) group.add(unit.id);
  }
  if (groupUnits.length === 0) {
    activeControlGroup = null;
    lastControlGroupRecall = null;
    updateControlGroupUI();
    showToast(`CONTROL GROUP ${controlGroupKeyLabel(index)} IS EMPTY`);
    return;
  }

  if (selectedBuildingId !== null) clearActiveControlGroup();
  const now = performance.now();
  const centerOnGroup = lastControlGroupRecall?.index === index
    && now - lastControlGroupRecall.at <= 380;
  lastControlGroupRecall = { index, at: now };
  selected.clear();
  for (const unit of groupUnits) selected.add(unit.id);
  activeControlGroup = index;
  selectionDirty = true;
  syncSelectionMesh();
  updateSelectionUI();
  updateControlGroupUI();
  audio.play('select');
  if (centerOnGroup) {
    centerCameraOnControlGroup(groupUnits);
    showToast(`CENTERED ON GROUP ${controlGroupKeyLabel(index)} · ${groupUnits.length.toLocaleString()} UNITS`);
  } else {
    showToast(`GROUP ${controlGroupKeyLabel(index)} RECALLED · ${groupUnits.length.toLocaleString()} UNITS`);
  }
}

function syncSelectionMesh() {
  if (!selectionDirty) return;
  let slot = 0;
  const ringScale = selected.size > 80 ? 1.08 : 1.24;
  for (const id of selected) {
    const unit = units[id];
    if (!unit || unit.hp <= 0) continue;
    dummy.position.set(unit.renderX, 0.022, unit.renderZ);
    dummy.quaternion.copy(ringRotation);
    dummy.scale.setScalar(unit.scale * ringScale);
    dummy.updateMatrix();
    selectionMesh.setMatrixAt(slot++, dummy.matrix);
  }
  selectionMesh.count = slot;
  selectionMesh.material.opacity = slot > 80 ? 0.48 : slot > 24 ? 0.68 : 0.9;
  selectionMesh.instanceMatrix.needsUpdate = true;
  selectionDirty = false;
}

function updateObjectives(objectives = []) {
  const states = new Map(objectives.map((objective) => [objective.id, objective]));
  latestObjectiveStates = states;
  for (const [id, visual] of objectiveVisuals) {
    const state = states.get(id);
    if (!state) continue;
    const team = state.progressTeam >= 0 ? state.progressTeam : state.owner;
    const colorHex = team === 0 ? TEAM_HEX[0] : team === 1 ? TEAM_HEX[1] : 0xd5ef78;
    visual.fillMaterial.color.setHex(colorHex);
    visual.outlineMaterial.color.setHex(colorHex);
    visual.card.dataset.team = team < 0 ? 'neutral' : TEAM_NAMES[team].toLowerCase();
    const prerequisiteIds = Array.isArray(state.requiresAll) ? state.requiresAll
      : state.requires ? [state.requires] : [];
    const prerequisiteOwners = Array.isArray(state.requiredOwners) ? state.requiredOwners
      : state.requires ? [state.requiredOwner] : [];
    const blockedPrerequisites = prerequisiteIds.map((prerequisiteId, index) => ({
      id: prerequisiteId,
      name: mapDefinition?.triggers?.find((trigger) => trigger.id === prerequisiteId)?.name || prerequisiteId,
      owner: prerequisiteOwners[index] ?? -1,
    })).filter((prerequisite) => prerequisite.owner !== localTeam);
    const isLocked = blockedPrerequisites.length > 0;
    visual.card.dataset.locked = String(isLocked);
    if (isLocked) {
      const gateStatus = `LOCKED · ${blockedPrerequisites.map((prerequisite) => (
        prerequisite.owner < 0
          ? `NEED ${prerequisite.name.toUpperCase()}`
          : `${TEAM_NAMES[prerequisite.owner].toUpperCase()} HOLDS ${prerequisite.name.toUpperCase()}`
      )).join(' · ')}`;
      visual.status.textContent = state.owner >= 0
        ? `${TEAM_NAMES[state.owner].toUpperCase()} CONTROL · ${gateStatus}`
        : gateStatus;
    } else if (state.progressTeam >= 0) {
      visual.status.textContent = `${TEAM_NAMES[state.progressTeam].toUpperCase()} CAPTURING · ${Math.round(state.progress * 100)}%`;
    } else if (state.owner >= 0) {
      visual.status.textContent = `${TEAM_NAMES[state.owner].toUpperCase()} CONTROL`;
    } else {
      visual.status.textContent = 'NEUTRAL';
    }
    visual.progressFill.style.transform = `scaleX(${Math.max(0, Math.min(1, state.progress))})`;
  }
}

function formatVictoryHoldTime(seconds) {
  const wholeSeconds = Math.ceil(Math.max(0, Number(seconds) || 0));
  if (wholeSeconds < 60) return `${wholeSeconds}s`;
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

function updateVictoryHoldCard(hold = null, winner = -1, winnerReason = null, clockStarted = false) {
  if (!victoryHoldVisual) return;
  const { card, status, progressFill, durationSeconds } = victoryHoldVisual;
  const activeTeams = Array.isArray(hold?.activeTeams) ? hold.activeTeams : [false, false];
  const progressSeconds = Array.isArray(hold?.progressSeconds) ? hold.progressSeconds : [0, 0];
  if (winner >= 0) {
    card.dataset.state = 'ended';
    const winnerLabel = winner === 2 ? 'DRAW'
      : `${TEAM_NAMES[winner].toUpperCase()} WINS`;
    status.textContent = winnerReason === 'capture-hold'
      ? winnerLabel : 'MATCH ENDED';
    const displayTeam = winner === 2 ? -1 : winner;
    card.dataset.team = displayTeam < 0 ? 'neutral' : TEAM_NAMES[displayTeam].toLowerCase();
    const finalProgress = winner < 2 ? progressSeconds[winner] : durationSeconds;
    progressFill.style.transform = `scaleX(${Math.max(0, Math.min(1, finalProgress / durationSeconds))})`;
    return;
  }
  if (!clockStarted) {
    card.dataset.state = 'waiting';
    card.dataset.team = 'neutral';
    status.textContent = 'WAITING FOR BOTH TEAMS';
    progressFill.style.transform = 'scaleX(0)';
    return;
  }
  if (!hold || !Array.isArray(hold.progressSeconds)) {
    card.dataset.state = 'waiting';
    card.dataset.team = 'neutral';
    status.textContent = 'WAITING FOR BOTH TEAMS';
    progressFill.style.transform = 'scaleX(0)';
    return;
  }
  let displayTeam = localTeam;
  if (displayTeam !== 0 && displayTeam !== 1) {
    displayTeam = progressSeconds[0] >= progressSeconds[1] ? 0 : 1;
    if (!activeTeams[displayTeam]) displayTeam = activeTeams[1 - displayTeam] ? 1 - displayTeam : -1;
  } else if (!activeTeams[displayTeam] && activeTeams[1 - displayTeam]) {
    displayTeam = 1 - displayTeam;
  }
  card.dataset.state = 'active';
  card.dataset.team = displayTeam < 0 ? 'neutral' : TEAM_NAMES[displayTeam].toLowerCase();
  if (displayTeam < 0) {
    status.textContent = 'NO TEAM HOLDING';
    progressFill.style.transform = 'scaleX(0)';
    return;
  }
  const heldFor = Math.max(0, progressSeconds[displayTeam] || 0);
  status.textContent = activeTeams[displayTeam]
    ? `${TEAM_NAMES[displayTeam].toUpperCase()} · ${formatVictoryHoldTime(heldFor)}`
    : 'WAITING FOR CONTROL';
  progressFill.style.transform = `scaleX(${Math.max(0, Math.min(1, heldFor / durationSeconds))})`;
}

function updateScenarioEventCards(states = [], elapsedSeconds = 0, clockStarted = false) {
  latestScenarioEventStates = new Map(states.map((state) => [state.id, state]));
  latestMatchElapsedSeconds = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
  latestScenarioClockStarted = clockStarted === true;
  scenarioClockSynchronizedAt = performance.now();
  renderScenarioEventCountdown(scenarioClockSynchronizedAt);
}

function renderScenarioEventCountdown(now = performance.now()) {
  if (now - lastScenarioEventUiUpdateAt < 250) return;
  lastScenarioEventUiUpdateAt = now;
  const elapsed = latestScenarioClockStarted
    ? latestMatchElapsedSeconds + (matchWinner < 0 ? Math.max(0, now - scenarioClockSynchronizedAt) / 1000 : 0) : 0;
  for (const [id, visual] of scenarioEventVisuals) {
    const state = latestScenarioEventStates.get(id);
    if (state?.fired) {
      visual.card.dataset.state = 'fired';
      visual.status.textContent = 'DELIVERED';
    } else if (matchWinner >= 0) {
      visual.card.dataset.state = 'ended';
      visual.status.textContent = 'MATCH ENDED';
    } else if (!latestScenarioClockStarted) {
      visual.card.dataset.state = 'waiting';
      visual.status.textContent = 'WAITING FOR BOTH TEAMS';
    } else if (['capture', 'event'].includes(visual.event.trigger?.type)
      && !Number.isFinite(state?.activatedAtSeconds)) {
      visual.card.dataset.state = 'waiting';
      if (visual.event.trigger.type === 'event') {
        const sourceIds = scenarioEventSourceIds(visual.event.trigger);
        const waitingSources = sourceIds.filter((sourceId) => (
          latestScenarioEventStates.get(sourceId)?.fired !== true
        ));
        if (sourceIds.length > 1) {
          const completedCount = sourceIds.length - waitingSources.length;
          const names = waitingSources.map((sourceId) => mapDefinition?.scenarioEvents.find((event) => (
            event.id === sourceId
          ))?.name?.toUpperCase()).filter(Boolean);
          visual.status.textContent = `WAITING ${completedCount}/${sourceIds.length}${names.length
            ? ` · ${names.join(' + ')}` : ''}`;
        } else {
          const source = mapDefinition?.scenarioEvents.find((event) => event.id === sourceIds[0]);
          visual.status.textContent = `WAITING FOR ${source?.name?.toUpperCase() || 'SOURCE EVENT'}`;
        }
      } else {
        const objective = mapDefinition?.triggers.find((trigger) => (
          trigger.id === visual.event.trigger.objectiveId
        ));
        const condition = visual.event.trigger.occurrence === 'recapture' ? 'RECAPTURE OF ' : '';
        visual.status.textContent = `WAITING FOR ${condition}${objective?.name?.toUpperCase() || 'CAPTURE'}`;
      }
    } else {
      visual.card.dataset.state = 'pending';
      const repeating = visual.event.repeatCount > 0;
      const dueAt = repeating ? state?.nextFireAtSeconds
        : ['capture', 'event'].includes(visual.event.trigger?.type)
          ? state.activatedAtSeconds + visual.event.afterSeconds : visual.event.afterSeconds;
      const remaining = Math.max(0, dueAt - elapsed);
      const wholeSeconds = Math.ceil(remaining);
      const time = wholeSeconds >= 60
        ? `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`
        : `${wholeSeconds}s`;
      const delivery = repeating ? `${(state?.fireCount ?? 0) + 1}/${visual.event.repeatCount + 1} · ` : '';
      visual.status.textContent = remaining <= 0.1 ? `${delivery}DUE` : `${delivery}IN ${time}`;
    }
  }
  if (timedVictoryVisual) {
    const { card, status, rule } = timedVictoryVisual;
    if (matchWinner >= 0) {
      card.dataset.state = 'ended';
      status.textContent = matchWinnerReason === 'timed-control'
        ? matchWinner === 2 ? 'DRAW' : `${TEAM_NAMES[matchWinner].toUpperCase()} WINS`
        : 'MATCH ENDED';
    } else if (!latestScenarioClockStarted) {
      card.dataset.state = 'waiting';
      status.textContent = 'WAITING FOR BOTH TEAMS';
    } else {
      card.dataset.state = 'pending';
      const remaining = Math.max(0, rule.afterSeconds - elapsed);
      const wholeSeconds = Math.ceil(remaining);
      const time = `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
      status.textContent = remaining <= 0.1 ? 'RESOLVING' : `IN ${time}`;
    }
  }
}

function syncMatchResultActions() {
  document.querySelector('#match-play-again').hidden = !isHost;
  document.querySelector('#match-waiting-for-host').hidden = isHost;
}

function updateMatchResult(winner, triggerId = null, reason = null) {
  const previousWinner = matchWinner;
  const isDraw = winner === 2 && ['capture-hold', 'elimination', 'timed-control'].includes(reason);
  matchWinner = Number.isInteger(winner) && ([0, 1].includes(winner) || isDraw) ? winner : -1;
  if (previousWinner < 0 && matchWinner >= 0) {
    audio.play(matchWinner === 2 ? 'draw' : matchWinner === localTeam ? 'victory' : 'defeat');
  }
  matchWinnerReason = matchWinner >= 0 ? reason : null;
  if (matchWinner >= 0 && buildPlacementActive) cancelBuildPlacement(false);
  if (matchWinner >= 0) {
    attackMoveMode = false;
    if (tapOrderArmed) setTapOrderArmed(false, false);
  }
  if (!matchResult) return;
  matchResult.hidden = matchWinner < 0;
  if (matchWinner < 0) {
    document.querySelector('#match-result-title').textContent = '';
    document.querySelector('#match-result-detail').textContent = '';
    updateCommandUI();
    return;
  }
  let outcome;
  let detail;
  if (isDraw) {
    matchResult.dataset.team = 'neutral';
    outcome = 'DRAW';
    if (reason === 'timed-control') {
      const objectiveName = mapDefinition?.triggers?.find((trigger) => trigger.id === triggerId)?.name || 'THE ZONE';
      detail = `${objectiveName.toUpperCase()} UNCLAIMED AT DEADLINE`;
    } else if (reason === 'capture-hold') detail = 'BOTH TEAMS COMPLETED THE VICTORY HOLD';
    else detail = 'BOTH ARMIES ELIMINATED';
  } else {
    const teamName = TEAM_NAMES[matchWinner].toUpperCase();
    matchResult.dataset.team = TEAM_NAMES[matchWinner].toLowerCase();
    outcome = localTeam === null ? `${teamName} WINS` : localTeam === matchWinner ? 'VICTORY' : 'DEFEAT';
    if (reason === 'elimination') detail = localTeam === matchWinner ? 'ENEMY ELIMINATED'
      : localTeam === null ? `${teamName} WINS · ENEMY ELIMINATED` : 'YOUR ARMY ELIMINATED';
    else if (reason === 'timed-control') {
      const objectiveName = mapDefinition?.triggers?.find((trigger) => trigger.id === triggerId)?.name || 'THE ZONE';
      detail = `${teamName} CONTROLLED ${objectiveName.toUpperCase()} AT DEADLINE`;
    } else if (reason === 'capture-hold') {
      const condition = mapDefinition?.victoryMode === 'all' ? 'ALL VICTORY ZONES' : 'A VICTORY ZONE';
      const duration = formatVictoryHoldTime(mapDefinition?.victoryHoldSeconds ?? 0);
      detail = `HELD ${condition} FOR ${duration.toUpperCase()}`;
    } else {
      const resultTrigger = mapDefinition?.triggers?.find((trigger) => trigger.id === triggerId)
        || mapDefinition?.triggers?.find((trigger) => trigger.victory === true);
      const objectiveName = mapDefinition?.victoryMode === 'all'
        ? 'ALL OBJECTIVES' : resultTrigger?.name || 'THE OBJECTIVE';
      detail = `${teamName} SECURED ${objectiveName.toUpperCase()}`;
    }
  }
  document.querySelector('#match-result-title').textContent = outcome;
  document.querySelector('#match-result-detail').textContent = detail;
  syncMatchResultActions();
  updateCommandUI();
}

function updateCommandUI() {
  const selectedBuilding = latestBuildings.find((building) => building.id === selectedBuildingId
    && building.team === localTeam) || null;
  const rallyCell = Number.isInteger(selectedBuilding?.rallyCell) ? selectedBuilding.rallyCell : -1;
  const mode = selectedBuilding ? 'RALLY' : attackMoveMode ? 'ATTACK MOVE' : 'MOVE';
  if (ui.commandMode) {
    ui.commandMode.textContent = mode;
    ui.commandMode.dataset.mode = selectedBuilding ? 'rally' : attackMoveMode ? 'attack-move' : 'move';
  }
  if (ui.commandIcon) {
    ui.commandIcon.textContent = selectedBuilding ? '⚑' : attackMoveMode ? '⚔' : '⌖';
    ui.commandIcon.classList.toggle('attack-move', !selectedBuilding && attackMoveMode);
  }
  if (ui.commandTitle) ui.commandTitle.textContent = selectedBuilding
    ? `${buildingLabel(selectedBuilding.type)} #${selectedBuilding.id}`
    : attackMoveMode ? 'Advance and engage' : 'Move or attack';
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  if (ui.commandHint) ui.commandHint.textContent = tapOrderArmed
    ? selectedBuilding ? 'Tap or click ground to set the rally point'
      : attackMoveMode ? 'Tap or click ground to advance and engage' : 'Tap or click ground, an enemy, or a resource'
    : selectedBuilding ? coarsePointer ? 'Use Set rally point, then tap ground'
      : (rallyCell >= 0 ? 'Right-click ground to move the production rally' : 'Right-click ground to set a production rally')
      : coarsePointer ? 'Use Target battlefield, then tap a target'
        : attackMoveMode ? 'Right-click ground to advance and engage' : 'Right-click ground or an enemy';
  if (ui.buildingCommandDetails) ui.buildingCommandDetails.hidden = !selectedBuilding;
  if (ui.buildingRallyReadout) {
    if (rallyCell >= 0) {
      const point = mapCellToWorld(rallyCell);
      ui.buildingRallyReadout.textContent = `RALLY · ${point.x.toFixed(1)}, ${point.z.toFixed(1)}`;
    } else ui.buildingRallyReadout.textContent = 'RALLY · NONE';
  }
  if (ui.clearBuildingRally) {
    ui.clearBuildingRally.hidden = !selectedBuilding || rallyCell < 0;
    ui.clearBuildingRally.disabled = localTeam === null || matchWinner >= 0;
  }
  updateBuildingResearchControls(selectedBuilding);
  if (ui.attackMoveToggle) {
    ui.attackMoveToggle.classList.toggle('active', attackMoveMode);
    ui.attackMoveToggle.setAttribute('aria-pressed', String(attackMoveMode));
    ui.attackMoveToggle.disabled = localTeam === null || matchWinner >= 0 || Boolean(selectedBuilding);
  }
  if (ui.formationSelect) ui.formationSelect.disabled = localTeam === null || matchWinner >= 0 || Boolean(selectedBuilding);
  syncTargetOrderUI();
}

function syncTargetOrderUI() {
  if (!ui.orderTargetToggle) return;
  const selectedBuilding = latestBuildings.find((building) => building.id === selectedBuildingId
    && building.team === localTeam) || null;
  ui.orderTargetToggle.disabled = localTeam === null || matchWinner >= 0 || buildPlacementActive;
  ui.orderTargetToggle.classList.toggle('active', tapOrderArmed);
  ui.orderTargetToggle.setAttribute('aria-pressed', String(tapOrderArmed));
  ui.orderTargetToggle.querySelector('span').textContent = tapOrderArmed ? 'Cancel target'
    : selectedBuilding ? 'Set rally point' : 'Target battlefield';
  ui.orderTargetToggle.querySelector('small').textContent = tapOrderArmed
    ? 'Tap or click a battlefield target' : selectedBuilding ? 'Tap or click ground once' : 'Tap or click once to issue';
}

function appendUnitFromState(row, animateSpawn = false) {
  const [id, team, x, z, hp, kind = 'infantry', cargo = 0, cargoType, generation = 0, taskStatus,
    targetedBy = 0] = row;
  if (!Number.isInteger(id) || id < 0 || id >= MAX_UNITS || ![0, 1].includes(team)) return null;
  if (units[id]) return units[id];
  const slot = teamUnits[team].length;
  if (slot >= MAX_PER_TEAM) return null;
  const unit = {
    id, team, slot, focusSlot: nextAttackFocusSlot++, renderX: x, renderZ: z, serverX: x, serverZ: z,
    hp, generation: Number.isInteger(generation) ? generation : 0,
    targetedBy: Number.isInteger(targetedBy) ? Math.max(0, targetedBy) : 0,
    focused: false,
    focusMatrixInitialized: false,
    walking: false, motionPhase: id * 1.7,
    attackStartedAt: 0, hitStartedAt: 0, spawnStartedAt: animateSpawn ? performance.now() : 0,
    defeatStartedAt: 0, lastPlayedAttackTick: -1,
    damageFlashUntil: 0,
    kind, cargo, cargoType: cargoType === 'food' || cargoType === 'wood' ? cargoType : null,
    task: kind === 'worker' && WORKER_TASK_STATES.has(taskStatus) ? taskStatus
      : kind === 'worker' ? 'unknown' : null,
    queuedWaypointCount: 0,
    scale: 0.94 + ((id * 17) % 12) / 100,
    tintVariation: 0.88 + ((id * 13) % 15) / 100,
    visible: true,
    angle: team === 0 ? Math.PI / 2 : -Math.PI / 2,
    targetAngle: team === 0 ? Math.PI / 2 : -Math.PI / 2,
  };
  while (units.length < id) units.push(null);
  if (id === units.length) units.push(unit);
  else units[id] = unit;
  teamUnits[team].push(unit);
  unitArtMeshes.forEach((pair) => { pair[team].count = slot + 1; });
  attackFocusMesh.count = nextAttackFocusSlot;
  setUnitTint(unit);
  updateUnitTransform(unit);
  updateUnitCargoCueColor(unit);
  return unit;
}

function applyState(state, initial = false) {
  if (!state || (mapDefinition && state.mapId && state.mapId !== mapDefinition.id)) return;
  const audioReset = initial || (state.armySize && state.armySize !== currentArmySize)
    || (matchWinner >= 0 && state.winner === -1)
    || (Number.isFinite(state.matchElapsedSeconds) && state.matchElapsedSeconds + 1 < latestMatchElapsedSeconds);
  if (state.armySize && state.armySize !== currentArmySize) setArmySize(state.armySize);
  let changed = false;
  let controlGroupsChanged = false;
  let friendlyDamage = 0;
  let selectedDamage = 0;
  const visibleEnemyIds = new Set();
  for (const row of state.units || []) {
    const [id, team, x, z, hp, kind, cargo, cargoType, generation = 0, taskStatus,
      targetedBy = 0, attackTick = -1, attackX = null, attackZ = null] = row;
    const existingUnit = units[id];
    const unit = existingUnit || appendUnitFromState(row, !initial);
    if (!unit || unit.team !== team) continue;
    const wasVisible = unit.visible !== false;
    let cargoVisualMayChange = !existingUnit || !wasVisible;
    unit.visible = true;
    if (localTeam !== null && team !== localTeam) visibleEnemyIds.add(id);
    if (!existingUnit) changed = true;
    if (existingUnit && unit.generation !== generation) {
      selected.delete(id);
      for (const group of controlGroups) {
        if (group.delete(id)) controlGroupsChanged = true;
      }
      unit.generation = Number.isInteger(generation) ? generation : 0;
      unit.renderX = x;
      unit.renderZ = z;
      unit.kind = kind || 'infantry';
      unit.hp = hp;
      unit.targetedBy = Number.isInteger(targetedBy) ? Math.max(0, targetedBy) : 0;
      unit.damageFlashUntil = 0;
      unit.attackStartedAt = 0;
      unit.hitStartedAt = 0;
      unit.defeatStartedAt = 0;
      unit.spawnStartedAt = initial ? 0 : performance.now();
      unit.lastPlayedAttackTick = -1;
      unit.angle = team === 0 ? Math.PI / 2 : -Math.PI / 2;
      unit.targetAngle = unit.angle;
      cargoVisualMayChange = true;
      setUnitTint(unit);
      updateUnitTransform(unit);
      changed = true;
    }
    unit.serverX = x;
    unit.serverZ = z;
    if (kind && unit.kind !== kind) {
      unit.kind = kind;
      cargoVisualMayChange = true;
      setUnitTint(unit);
      updateUnitTransform(unit);
      changed = true;
    }
    const nextTask = unit.kind === 'worker' && WORKER_TASK_STATES.has(taskStatus) ? taskStatus
      : unit.kind === 'worker' ? 'unknown' : null;
    if (unit.task !== nextTask) {
      unit.task = nextTask;
      updateUnitTransform(unit);
      changed = true;
    }
    const nextCargo = Number.isFinite(cargo) ? cargo : unit.cargo || 0;
    const nextCargoType = cargoType === 'food' || cargoType === 'wood' ? cargoType
      : cargoType === null ? null : unit.cargoType;
    if (unit.cargo !== nextCargo || unit.cargoType !== nextCargoType) {
      unit.cargo = nextCargo;
      unit.cargoType = nextCargoType;
      cargoVisualMayChange = true;
    }
    if (unit.hp !== hp) {
      cargoVisualMayChange = true;
      const tookDamage = hp < unit.hp && hp > 0;
      if (!audioReset && hp < unit.hp && unit.team === localTeam) {
        friendlyDamage++;
        if (selected.has(id)) selectedDamage++;
      }
      const defeated = unit.hp > 0 && hp <= 0;
      const damageAt = performance.now();
      unit.hp = hp;
      unit.damageFlashUntil = tookDamage ? damageAt + 220 : 0;
      unit.hitStartedAt = tookDamage ? damageAt : 0;
      if (defeated) unit.defeatStartedAt = damageAt;
      setUnitTint(unit);
      updateUnitTransform(unit);
      if (hp <= 0) selected.delete(id);
      changed = true;
    }
    if (Number.isInteger(attackTick) && attackTick >= 0 && attackTick !== unit.lastPlayedAttackTick) {
      unit.lastPlayedAttackTick = attackTick;
      if (!initial && unit.hp > 0 && unit.visible !== false) {
        const now = performance.now();
        unit.attackStartedAt = now;
        if (Number.isFinite(attackX) && Number.isFinite(attackZ)) {
          unit.targetAngle = Math.atan2(attackX - unit.renderX, attackZ - unit.renderZ);
          if (unit.kind === 'archer' && (unit.id * 17 + attackTick) % 3 === 0) {
            addArrowTrace(unit.renderX, unit.renderZ, attackX, attackZ, now);
          }
        }
        updateUnitTransform(unit, now);
        changed = true;
      }
    }
    const nextTargetedBy = Number.isInteger(targetedBy) ? Math.max(0, targetedBy) : 0;
    if (unit.targetedBy !== nextTargetedBy) {
      unit.targetedBy = nextTargetedBy;
      updateUnitTransform(unit);
      changed = true;
    }
    if (initial || !wasVisible) {
      unit.renderX = x;
      unit.renderZ = z;
      updateUnitTransform(unit);
      changed = true;
    }
    if (cargoVisualMayChange) updateUnitCargoCueColor(unit);
  }
  if (state.fogOfWar === true && localTeam !== null) {
    for (const unit of teamUnits[1 - localTeam]) {
      if (visibleEnemyIds.has(unit.id) || unit.visible === false) continue;
      unit.visible = false;
      updateUnitCargoCueColor(unit);
      updateUnitTransform(unit);
      changed = true;
    }
  }
  if (Array.isArray(state.queuedWaypointCounts)) applyWaypointQueueCounts(state.queuedWaypointCounts);
  if (initial || changed) {
    for (let team = 0; team < 2; team++) {
      unitArtMeshes.forEach((pair) => { pair[team].instanceMatrix.needsUpdate = true; });
    }
  }
  for (let team = 0; team < 2; team++) flushUnitCargoPackColor(team);
  if (attackFocusDirty) {
    attackFocusMesh.instanceMatrix.needsUpdate = true;
    attackFocusDirty = false;
  }
  if (Array.isArray(state.alive)) {
    ui.aliveBlue.textContent = Number.isFinite(state.alive[0]) ? state.alive[0].toLocaleString() : '—';
    ui.aliveRed.textContent = Number.isFinite(state.alive[1]) ? state.alive[1].toLocaleString() : '—';
  }
  updateFogFromState(state);
  if (Array.isArray(state.objectives)) updateObjectives(state.objectives);
  updateVictoryHoldCard(state.victoryHold, state.winner, state.winnerReason, state.scenarioClockStarted);
  updateScenarioEventCards(state.scenarioEvents || [], state.matchElapsedSeconds, state.scenarioClockStarted);
  const buildingDamage = Array.isArray(state.buildings) ? reconcileBuildings(state.buildings, audioReset) : 0;
  if (audioReset) combatAudioGate.reset();
  else {
    const cue = combatAudioGate.observe({ friendlyDamage, selectedDamage, buildingDamage }, performance.now());
    if (cue) audio.play(cue);
  }
  if (Number.isInteger(state.winner)) {
    updateMatchResult(state.winner, state.winnerTriggerId, state.winnerReason);
  }
  if (Number.isInteger(state.connected)) updateRoomUI(state.connected);
  if (Number.isFinite(state.rosterSize)) ui.total.textContent = state.rosterSize.toLocaleString();
  updateEconomyUI(state, audioReset);
  revalidateControlGroups();
  if (controlGroupsChanged) updateControlGroupUI();
  selectionDirty = true;
  syncSelectionMesh();
  updateSelectionUI();
}

function applyWaypointQueueCounts(rows = []) {
  const counts = new Map(rows.filter((entry) => Array.isArray(entry)
    && Number.isInteger(entry[0]) && Number.isInteger(entry[1]) && entry[1] > 0));
  for (const unit of units) {
    if (!unit || (localTeam !== null && unit.team !== localTeam)) continue;
    unit.queuedWaypointCount = counts.get(unit.id) || 0;
  }
  updateSelectionUI();
}

function updateEconomyUI(state = {}, initial = false) {
  if (Number.isFinite(state.rosterSize)) latestRosterSize = Math.max(0, Math.floor(state.rosterSize));
  if (Array.isArray(state.food)) latestFood = [Number(state.food[0]) || 0, Number(state.food[1]) || 0];
  if (Array.isArray(state.wood)) latestWood = [Number(state.wood[0]) || 0, Number(state.wood[1]) || 0];
  if (Array.isArray(state.workerProduction)) {
    if (!initial && localTeam !== null && Number.isFinite(latestWorkerProduction[localTeam]?.queue)
      && Number(state.workerProduction[localTeam]?.queue) < latestWorkerProduction[localTeam].queue) audio.play('complete');
    latestWorkerProduction = [state.workerProduction[0] || null, state.workerProduction[1] || null];
  }
  if (Array.isArray(state.teamResearch)) {
    latestTeamResearch = [state.teamResearch[0] || null, state.teamResearch[1] || null];
  }
  if (Array.isArray(state.resourceNodes)) {
    for (const node of state.resourceNodes) {
      if (node && typeof node.id === 'string' && Number.isFinite(node.stock)) {
        updateResourceNodeVisual(node.id, Math.max(0, node.stock));
      }
    }
  }
  if (ui.foodStock) ui.foodStock.textContent = localTeam === null ? '—' : latestFood[localTeam].toLocaleString();
  if (ui.woodStock) ui.woodStock.textContent = localTeam === null ? '—' : latestWood[localTeam].toLocaleString();
  const ownedUnits = localTeam === null ? [] : teamUnits[localTeam].filter((unit) => unit.hp > 0);
  const teamRosterCount = ownedUnits.length;
  const queuedByTeam = localTeam === null ? 0 : latestBuildings
    .filter((building) => building.team === localTeam)
    .reduce((sum, building) => sum + getBuildingQueueLength(building), 0)
    + (latestWorkerProduction[localTeam]?.queue || 0);
  const queuedTotal = latestBuildings.reduce((sum, building) => sum + getBuildingQueueLength(building), 0)
    + latestWorkerProduction.reduce((sum, production) => sum + (production?.queue || 0), 0);
  const unitCapReached = teamRosterCount + queuedByTeam >= MAX_PER_TEAM
    || latestRosterSize + queuedTotal >= MAX_UNITS;
  const food = localTeam === null ? 0 : latestFood[localTeam];
  const wood = localTeam === null ? 0 : latestWood[localTeam];
  const ownedWorkers = ownedUnits.filter((unit) => unit.kind === 'worker');
  const idleWorkerIds = localTeam === null ? [] : livingIdleWorkerIds(ownedWorkers, localTeam);
  const ownedInfantry = ownedUnits.filter((unit) => unit.kind === 'infantry');
  const ownedArchers = ownedUnits.filter((unit) => unit.kind === 'archer');
  const ownBuildings = localTeam === null ? [] : latestBuildings
    .filter((building) => building.team === localTeam);
  const ownRanges = ownBuildings.filter((building) => building.type === 'archery-range');
  const ownBarracks = ownBuildings.filter((building) => building.type === 'barracks');
  const construction = ownBuildings.find((building) => building.complete !== true) || null;
  const rangeConstruction = ownRanges.find((building) => building.complete !== true) || null;
  const barracksConstruction = ownBarracks.find((building) => building.complete !== true) || null;
  const trainableRange = localTeam === null ? null : findTrainableArcheryRange(localTeam);
  const trainableBarracks = localTeam === null ? null : findTrainableBarracks(localTeam);
  const completedBarracks = trainableBarracks || ownBarracks.find((building) => building.complete === true) || null;
  const completedRange = trainableRange || ownRanges.find((building) => building.complete === true) || null;
  const queueLength = trainableRange ? getBuildingQueueLength(trainableRange)
    : completedRange ? getBuildingQueueLength(completedRange) : 0;
  const infantryQueueLength = trainableBarracks ? getBuildingQueueLength(trainableBarracks)
    : completedBarracks ? getBuildingQueueLength(completedBarracks) : 0;
  let carriedFood = 0;
  let carriedWood = 0;
  for (const worker of ownedWorkers) {
    if (worker.cargoType === 'wood') carriedWood += worker.cargo || 0;
    else if (worker.cargoType === 'food' || worker.cargo > 0) carriedFood += worker.cargo || 0;
  }
  if (ui.workerLoad) ui.workerLoad.textContent = localTeam === null
    ? 'WORKER CARGO · —'
    : `WORKER CARGO · ${Math.floor(carriedFood)} FOOD · ${Math.floor(carriedWood)} WOOD`;
  if (ui.trainInfantry) {
    ui.trainInfantry.disabled = localTeam === null || matchWinner >= 0 || !trainableBarracks
      || infantryQueueLength >= BARRACKS_QUEUE_LIMIT || food < INFANTRY_FOOD_COST || unitCapReached;
    ui.trainInfantry.setAttribute('aria-label', `Queue infantry for ${INFANTRY_FOOD_COST} food${
      trainableBarracks ? `, queue ${infantryQueueLength} of ${BARRACKS_QUEUE_LIMIT}` : ', requires a completed Barracks with an open queue slot'
    }${unitCapReached ? ', unit cap reached' : ''}`);
  }
  if (ui.buildBarracks) {
    ui.buildBarracks.disabled = localTeam === null || matchWinner >= 0 || wood < BARRACKS_WOOD_COST
      || ownedWorkers.length === 0 || buildPlacementPending;
    ui.buildBarracks.classList.toggle('active', buildPlacementActive && buildPlacementType === 'barracks');
    ui.buildBarracks.setAttribute('aria-pressed', String(buildPlacementActive && buildPlacementType === 'barracks'));
    ui.buildBarracks.setAttribute('aria-label', `Build Barracks for ${BARRACKS_WOOD_COST} wood${
      ownedWorkers.length === 0 ? ', no living workers' : ''
    }`);
  }
  if (ui.buildRange) {
    const selectedWorkerCount = ownedWorkers.length;
    ui.buildRange.disabled = localTeam === null || matchWinner >= 0 || wood < ARCHERY_RANGE_WOOD_COST
      || selectedWorkerCount === 0 || buildPlacementPending;
    ui.buildRange.classList.toggle('active', buildPlacementActive && buildPlacementType === 'archery-range');
    ui.buildRange.setAttribute('aria-pressed', String(buildPlacementActive && buildPlacementType === 'archery-range'));
    ui.buildRange.setAttribute('aria-label', `Build archery range for ${ARCHERY_RANGE_WOOD_COST} wood${
      selectedWorkerCount === 0 ? ', no living workers' : ''
    }`);
  }
  const workerProduction = localTeam === null ? null : latestWorkerProduction[localTeam];
  const workerQueue = Math.max(0, Math.floor(workerProduction?.queue || 0));
  if (ui.trainWorker) {
    ui.trainWorker.disabled = localTeam === null || matchWinner >= 0
      || food < WORKER_FOOD_COST || workerQueue >= WORKER_QUEUE_LIMIT || unitCapReached;
    ui.trainWorker.setAttribute('aria-label', 'Queue worker for ' + WORKER_FOOD_COST + ' food'
      + (workerQueue > 0 ? ', queue ' + workerQueue + ' of ' + WORKER_QUEUE_LIMIT : '')
      + (unitCapReached ? ', unit cap reached' : ''));
  }
  if (ui.trainArcher) {
    ui.trainArcher.disabled = localTeam === null || matchWinner >= 0 || !trainableRange
      || queueLength >= ARCHERY_RANGE_QUEUE_LIMIT || food < ARCHER_FOOD_COST || wood < ARCHER_WOOD_COST
      || unitCapReached;
    ui.trainArcher.setAttribute('aria-label', `Queue archer for ${ARCHER_FOOD_COST} food and ${ARCHER_WOOD_COST} wood${
      trainableRange ? `, queue ${queueLength} of ${ARCHERY_RANGE_QUEUE_LIMIT}` : ', requires a completed archery range'
    }`);
  }
  if (ui.selectWorkers) ui.selectWorkers.disabled = localTeam === null
    || ownedWorkers.length === 0;
  if (ui.selectIdleWorkers) {
    ui.selectIdleWorkers.disabled = idleWorkerIds.length === 0;
    ui.selectIdleWorkers.textContent = `Idle · ${idleWorkerIds.length}`;
    ui.selectIdleWorkers.setAttribute('aria-label', `Select idle workers (${idleWorkerIds.length})`);
  }
  if (ui.selectInfantry) ui.selectInfantry.disabled = localTeam === null || ownedInfantry.length === 0;
  if (ui.selectArchers) ui.selectArchers.disabled = localTeam === null || ownedArchers.length === 0;
  if (ui.resumeRange) {
    const progress = construction ? Math.round((Number(construction.progress) || 0) * 100) : 0;
    ui.resumeRange.hidden = !construction;
    ui.resumeRange.disabled = localTeam === null || matchWinner >= 0 || ownedWorkers.length === 0;
    ui.resumeRange.setAttribute('aria-label', construction
      ? `Send workers to finish ${buildingLabel(construction.type).toLowerCase()} ${construction.id}, ${progress} percent complete`
      : 'No unfinished friendly Barracks or archery range');
    if (ui.resumeConstructionLabel) ui.resumeConstructionLabel.textContent = construction
      ? `Send workers to ${buildingLabel(construction.type).toLowerCase()}` : 'Send workers to construction';
    if (ui.resumeRangeProgress) ui.resumeRangeProgress.textContent = construction ? `${progress}% · FOCUS` : '';
  }
  if (ui.buildingStatus) {
    if (rangeConstruction) {
      const rangeLabel = rangeConstruction.id === undefined ? 'RANGE' : `RANGE #${rangeConstruction.id}`;
      ui.buildingStatus.textContent = `${rangeLabel} UNDER CONSTRUCTION · ${Math.round((Number(rangeConstruction.progress) || 0) * 100)}%`;
    } else if (completedRange) {
      const trainingProgress = Math.round((Number(completedRange.trainingProgress) || 0) * 100);
      ui.buildingStatus.textContent = completedRange.productionBlocked === true
        ? `${ownRanges.length} RANGE${ownRanges.length === 1 ? '' : 'S'} · QUEUE ${queueLength}/${ARCHERY_RANGE_QUEUE_LIMIT} · WAITING FOR SPAWN SPACE`
        : `${ownRanges.length} RANGE${ownRanges.length === 1 ? '' : 'S'} · QUEUE ${queueLength}/${ARCHERY_RANGE_QUEUE_LIMIT} · TRAINING ${trainingProgress}%`;
    } else ui.buildingStatus.textContent = 'No completed archery range.';
  }
  if (ui.barracksStatus) {
    if (ownBarracks.length === 0) {
      ui.barracksStatus.textContent = `No Barracks built · ${BARRACKS_WOOD_COST} wood · ${INFANTRY_FOOD_COST} food / infantry · ${INFANTRY_TRAIN_SECONDS}s`;
    } else {
      const details = [];
      if (barracksConstruction) {
        const progress = Math.round((Number(barracksConstruction.progress) || 0) * 100);
        details.push(`BUILDING #${barracksConstruction.id} · ${progress}%`);
      }
      if (completedBarracks) {
        const trainingProgress = Math.round((Number(completedBarracks.trainingProgress) || 0) * 100);
        const remaining = Math.max(0, Math.ceil(Number(completedBarracks.trainingRemaining) || 0));
        const production = completedBarracks.productionBlocked === true
          ? 'WAITING FOR SPAWN SPACE'
          : infantryQueueLength > 0
            ? `TRAINING ${trainingProgress}% · ${remaining}s` : 'READY TO TRAIN';
        details.push(`BARRACKS #${completedBarracks.id} · QUEUE ${infantryQueueLength}/${BARRACKS_QUEUE_LIMIT} · ${production}`);
      }
      ui.barracksStatus.textContent = `${ownBarracks.length} BARRACKS · ${details.join(' · ') || 'UNDER CONSTRUCTION'}`;
    }
  }
  if (ui.workerProductionStatus) {
    if (localTeam === null) ui.workerProductionStatus.textContent = 'TOWN CENTER · JOIN A TEAM TO TRAIN WORKERS';
    else if (workerQueue > 0 && workerProduction?.productionBlocked) {
      ui.workerProductionStatus.textContent = 'TOWN CENTER · QUEUE ' + workerQueue + '/' + WORKER_QUEUE_LIMIT
        + ' · WAITING FOR SPAWN SPACE';
    } else if (workerQueue > 0) {
      const progress = Math.round((Number(workerProduction.trainingProgress) || 0) * 100);
      const remaining = Math.max(0, Math.ceil(Number(workerProduction.trainingRemaining) || 0));
      ui.workerProductionStatus.textContent = 'TOWN CENTER · QUEUE ' + workerQueue + '/' + WORKER_QUEUE_LIMIT
        + ' · TRAINING ' + progress + '% · ' + remaining + 'S';
    } else ui.workerProductionStatus.textContent = 'TOWN CENTER · READY · '
      + WORKER_FOOD_COST + ' FOOD · ' + WORKER_TRAIN_SECONDS + 'S';
  }
  if (ui.foodStatus) {
    if (localTeam === null) ui.foodStatus.textContent = 'Join a team to gather and train.';
    else if (!mapDefinition?.resourceNodes?.length) ui.foodStatus.textContent = 'This map has no food or wood nodes.';
    else if (ownedWorkers.length === 0) {
      ui.foodStatus.textContent = 'No living workers remain.';
    } else if (teamRosterCount >= MAX_PER_TEAM) ui.foodStatus.textContent = 'Army limit reached.';
    else ui.foodStatus.textContent = window.matchMedia('(pointer: coarse)').matches
      ? 'Select Workers, open Orders, then target food or wood.'
      : 'Select Workers, then right-click food or wood.';
  }
  updateCommandUI();
}

function updateRoomUI(connected) {
  connectedPlayers = connected;
  ui.playersOnline.textContent = `${connected} / 2 PLAYERS`;
  ui.matchStatus.textContent = waitingForResume ? 'WAITING TO REJOIN' : connected >= 2 ? '2 / 2 ONLINE' : `${connected} / 2 ONLINE`;
  ui.matchStatus.classList.toggle('full', connected >= 2);
  ui.networkStatus.textContent = waitingForResume
    ? 'SEAT ACTIVE ELSEWHERE' : connected >= 2 ? 'ROOM LIVE' : 'WAITING FOR PLAYER 2';
  ui.connectionDot.classList.remove('offline');
  ui.connectionDot.classList.toggle('waiting', waitingForResume || connected < 2);
  ui.matchStatus.classList.remove('offline');
  ui.matchStatus.classList.toggle('waiting', waitingForResume || connected < 2);
}

function setConnection(status) {
  ui.networkStatus.textContent = status;
  ui.matchStatus.textContent = status;
  const waiting = status === 'CONNECTING' || status === 'RECONNECTING' || status === 'WAITING FOR PLAYER 2';
  ui.connectionDot.classList.toggle('waiting', waiting);
  ui.connectionDot.classList.toggle('offline', status === 'OFFLINE');
  ui.matchStatus.classList.toggle('waiting', waiting);
  ui.matchStatus.classList.toggle('offline', status === 'OFFLINE');
}

function setPlayer(player) {
  const previousTeam = localTeam;
  localTeam = Number.isInteger(player.team) ? player.team : null;
  if (previousTeam !== localTeam) {
    lastFriendlyUnitClick = null;
    lastUnitPickState = null;
    if (buildPlacementActive) cancelBuildPlacement(false);
    selected.clear();
    clearControlGroups();
    selectionDirty = true;
  }
  updateControlGroupUI();
  isHost = Boolean(player.isHost);
  syncMatchResultActions();
  ui.playerTeam.textContent = localTeam === null ? 'SPECTATOR' : TEAM_NAMES[localTeam].toUpperCase();
  ui.playerTeam.dataset.team = localTeam === 0 ? 'azure' : localTeam === 1 ? 'ember' : 'spectator';
  for (const button of document.querySelectorAll('.size-options button')) {
    button.disabled = !isHost;
    button.title = isHost ? 'Change match size for both players' : 'Only the room host can change match size';
  }
  document.querySelector('#reset-army').disabled = !isHost;
  document.querySelector('#reset-army').title = isHost ? 'Reset all units for both players' : 'Only the room host can reset the match';
  ui.mapSelect.disabled = !isHost;
  ui.mapSelect.title = isHost ? 'Change map for both players' : 'Only the room host can change the map';
  ui.mapStudioOpen.disabled = !isHost;
  ui.mapStudioOpen.title = isHost ? 'Create a custom map and capture objectives' : 'Only the room host can author maps';
  updateCommandUI();
}

function setMapCatalog(maps, activeMapId) {
  knownMaps = (maps || []).map((map) => ({ ...map }));
  ui.mapSelect.replaceChildren();
  for (const map of knownMaps) {
    const option = document.createElement('option');
    option.value = map.id;
    option.textContent = map.name;
    option.title = map.summary;
    ui.mapSelect.append(option);
  }
  if (activeMapId) ui.mapSelect.value = activeMapId;
}

const EDITOR_MATERIALS = ['stone', 'forest', 'water'];
const EDITOR_MATERIAL_COLORS = ['#596653', '#496448', '#416a78'];
const TERRAIN_COLORS = {
  meadow: '#60734f', 'short-grass': '#6d7a45', 'long-grass': '#52643e',
  dirt: '#806047', sand: '#ac936d', scree: '#55564d', cinder: '#554c3d',
};
const MAP_STUDIO_DRAFT_VERSION = 1;
const MAP_STUDIO_DRAFT_DEBOUNCE_MS = 160;

function mapStudioDraftKey(sourceMapId) {
  return `${SESSION_STORAGE_KEY}:map-studio-draft:${location.origin}:${ROOM_ID || 'default'}:${sourceMapId}`;
}

function readMapStudioDraft(storageKey) {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setMapStudioDraftRecoveryPrompt(visible, message = '') {
  ui.studioDraftRecovery.hidden = !visible;
  ui.studioDraftRecoveryMessage.textContent = message;
  ui.mapStudioLayout.inert = visible;
  ui.studioFooter.inert = visible;
}

function showMapStudioDraftRecovery(draft) {
  const savedAt = Number.isFinite(draft?.savedAt) ? new Date(draft.savedAt) : null;
  const when = savedAt && !Number.isNaN(savedAt.valueOf())
    ? savedAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'a previous session';
  setMapStudioDraftRecoveryPrompt(true,
    `An unpublished map draft was saved ${when}. Restore it to continue, or discard it and start from the active map.`);
}

function clearMapStudioDraft() {
  if (!editorDraftStorageKey) return true;
  try {
    localStorage.removeItem(editorDraftStorageKey);
    editorDraftDirty = false;
    editorDraftLastSavedAt = null;
    ui.studioDraftStatus.textContent = 'NO LOCAL DRAFT';
    return true;
  } catch {
    ui.studioDraftStatus.textContent = 'LOCAL DRAFT COULD NOT BE CLEARED';
    return false;
  }
}

function captureMapStudioFormValues() {
  const values = {};
  for (const field of ui.mapStudio.querySelectorAll('input[id^="studio-"], select[id^="studio-"], textarea[id^="studio-"]')) {
    if (field.type === 'file') continue;
    values[field.id] = field.type === 'checkbox'
      ? { checked: field.checked }
      : { value: field.value };
  }
  return values;
}

function restoreMapStudioFormValues(values = {}) {
  for (const [id, state] of Object.entries(values)) {
    const field = document.getElementById(id);
    if (!field || !ui.mapStudio.contains(field)) continue;
    if (field.type === 'checkbox') field.checked = state?.checked === true;
    else if (typeof state?.value === 'string') field.value = state.value;
  }
}

function captureMapStudioDraft() {
  if (!editorDefinition || !editorDraftSourceMapId) return null;
  saveSelectedEditorTriggerFields();
  saveSelectedEditorScenarioEventFields();
  saveEditorTimedVictoryFields();
  saveEditorVictoryHoldFields();
  saveEditorStartingResourcesFields();
  saveSelectedEditorResourceStock();
  const definition = {
    ...editorDefinition,
    id: ui.studioId.value,
    name: ui.studioName.value,
    terrainBase: ui.studioTerrainBase.value,
    terrainPatches: compressEditorGround(),
    obstacles: compressEditorObstacles(),
    resourceNodes: JSON.parse(JSON.stringify(editorResourceNodes)),
    triggers: JSON.parse(JSON.stringify(editorTriggers)),
    scenarioEvents: JSON.parse(JSON.stringify(editorScenarioEvents)),
  };
  return {
    version: MAP_STUDIO_DRAFT_VERSION,
    sourceMapId: editorDraftSourceMapId,
    savedAt: Date.now(),
    editor: {
      definition,
      selectedTriggerId: selectedEditorTriggerId,
      selectedScenarioEventId: selectedEditorScenarioEventId,
      selectedResourceId: selectedEditorResourceId,
      triggerCreationPending: editorTriggerCreationPending,
      selectedPrerequisiteIds: selectedEditorPrerequisiteIds(),
      editorTool,
      formValues: captureMapStudioFormValues(),
    },
  };
}

let editorDraftLastSavedAt = null;

function persistMapStudioDraft(force = false) {
  if (!editorDraftDirty || !editorDraftStorageKey || (!force && !ui.mapStudio.open)) return;
  window.clearTimeout(editorDraftWriteTimer);
  editorDraftWriteTimer = 0;
  try {
    const draft = captureMapStudioDraft();
    if (!draft) return;
    localStorage.setItem(editorDraftStorageKey, JSON.stringify(draft));
    editorDraftLastSavedAt = draft.savedAt;
    ui.studioDraftStatus.textContent = `SAVED LOCALLY · ${new Date(draft.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } catch {
    ui.studioDraftStatus.textContent = 'LOCAL SAVE FAILED · DOWNLOAD JSON';
  }
}

function scheduleMapStudioDraftSave() {
  editorDraftDirty = true;
  ui.studioDraftStatus.textContent = 'SAVING DRAFT…';
  window.clearTimeout(editorDraftWriteTimer);
  editorDraftWriteTimer = window.setTimeout(persistMapStudioDraft, MAP_STUDIO_DRAFT_DEBOUNCE_MS);
}

function restoreMapStudioDraft(draft) {
  const state = draft?.editor;
  const definition = state?.definition;
  if (draft?.version !== MAP_STUDIO_DRAFT_VERSION || draft.sourceMapId !== editorDraftSourceMapId
    || !definition || !Number.isInteger(definition.width) || !Number.isInteger(definition.height)
    || definition.width < 16 || definition.width > 256 || definition.height < 16 || definition.height > 256
    || !Array.isArray(definition.obstacles) || !Array.isArray(definition.spawnPoints)) {
    throw new Error('The saved draft could not be read. Discard it to start a fresh map.');
  }
  populateMapEditor(definition, 'Recovered your unpublished map draft. Changes save locally as you edit.');
  editorTriggers = JSON.parse(JSON.stringify(definition.triggers || []));
  editorScenarioEvents = JSON.parse(JSON.stringify(definition.scenarioEvents || []));
  editorResourceNodes = JSON.parse(JSON.stringify(definition.resourceNodes || []));
  selectedEditorTriggerId = editorTriggers.some((trigger) => trigger.id === state.selectedTriggerId)
    ? state.selectedTriggerId : editorTriggers[0]?.id || null;
  selectedEditorScenarioEventId = editorScenarioEvents.some((event) => event.id === state.selectedScenarioEventId)
    ? state.selectedScenarioEventId : editorScenarioEvents[0]?.id || null;
  selectedEditorResourceId = editorResourceNodes.some((node) => node.id === state.selectedResourceId)
    ? state.selectedResourceId : null;
  editorTriggerCreationPending = state.triggerCreationPending === true;
  syncEditorTriggerControls();
  syncEditorScenarioEventControls();
  syncEditorResourceControls();
  setEditorTool(EDITOR_MATERIALS.includes(state.editorTool) || ['rock', 'cliff', 'ground-reset', 'erase', 'azure', 'ember', 'resource-food', 'resource-wood', 'objective'].includes(state.editorTool)
    || (typeof state.editorTool === 'string' && state.editorTool.startsWith('ground:')
      && TERRAIN_MATERIALS.includes(state.editorTool.slice(7)))
    ? state.editorTool : 'stone');
  restoreMapStudioFormValues(state.formValues);
  if (editorTriggerCreationPending) {
    const selectedIds = new Set(Array.isArray(state.selectedPrerequisiteIds) ? state.selectedPrerequisiteIds : []);
    for (const input of ui.studioObjectiveRequires.querySelectorAll('input[type="checkbox"]')) {
      input.checked = selectedIds.has(input.value);
    }
  }
  editorDraftDirty = true;
  editorDraftLastSavedAt = Number.isFinite(draft.savedAt) ? draft.savedAt : null;
  setMapStudioDraftRecoveryPrompt(false);
  ui.studioDraftStatus.textContent = editorDraftLastSavedAt
    ? `SAVED LOCALLY · ${new Date(editorDraftLastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'SAVED LOCALLY';
  drawEditorGrid();
  scheduleMapStudioDraftSave();
}

function discardMapStudioDraft() {
  if (!clearMapStudioDraft()) {
    ui.studioDraftRecoveryMessage.textContent = 'This browser could not clear the saved draft. Check browser storage access and try again.';
    return;
  }
  editorDraftDirty = false;
  setMapStudioDraftRecoveryPrompt(false);
  ui.studioMessage.textContent = 'Saved draft discarded. You are editing a fresh copy of the active map.';
}

function openMapStudio() {
  if (!isHost || !mapDefinition) return;
  editorDraftSourceMapId = mapDefinition.id;
  editorDraftStorageKey = mapStudioDraftKey(editorDraftSourceMapId);
  editorDraftDirty = false;
  editorDraftLastSavedAt = null;
  const draft = JSON.parse(JSON.stringify(mapDefinition));
  const baseId = `${mapDefinition.id}-custom`.slice(0, 48);
  let candidateId = baseId;
  for (let suffix = 2; knownMaps.some((map) => map.id === candidateId); suffix++) {
    candidateId = `${baseId.slice(0, 43)}-${suffix}`;
  }
  draft.id = candidateId;
  draft.name = `${mapDefinition.name} CUSTOM`.slice(0, 48);
  populateMapEditor(draft, 'Paint the battlefield, place both spawns, then select or add capture objectives.');
  const savedDraft = readMapStudioDraft(editorDraftStorageKey);
  if (savedDraft) {
    showMapStudioDraftRecovery(savedDraft);
    ui.studioDraftStatus.textContent = 'UNPUBLISHED DRAFT FOUND';
  } else {
    setMapStudioDraftRecoveryPrompt(false);
    ui.studioDraftStatus.textContent = 'NO LOCAL DRAFT';
  }
  ui.mapStudio.showModal();
  drawEditorGrid();
}

function getSelectedEditorTrigger() {
  return editorTriggers.find((trigger) => trigger.id === selectedEditorTriggerId) || null;
}

function selectedEditorPrerequisiteIds() {
  return [...ui.studioObjectiveRequires.querySelectorAll('input[type="checkbox"]:checked')]
    .map((input) => input.value);
}

function setEditorTriggerPrerequisites(trigger, prerequisiteIds) {
  delete trigger.requires;
  delete trigger.requiresAll;
  if (prerequisiteIds.length === 1) trigger.requires = prerequisiteIds[0];
  else if (prerequisiteIds.length > 1) trigger.requiresAll = [...prerequisiteIds];
}

function renderEditorTriggerList() {
  ui.studioTriggerList.replaceChildren();
  for (const [index, trigger] of editorTriggers.entries()) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `studio-trigger-row${trigger.id === selectedEditorTriggerId ? ' selected' : ''}`;
    row.setAttribute('aria-pressed', String(trigger.id === selectedEditorTriggerId));
    const label = document.createElement('span');
    label.className = 'studio-trigger-name';
    label.textContent = `${String(index + 1).padStart(2, '0')} · ${trigger.name}`;
    const marker = document.createElement('span');
    const gated = capturePrerequisiteIds(trigger).length > 0;
    marker.className = `studio-trigger-marker${trigger.victory === true ? ' win' : ''}${gated ? ' gated' : ''}`;
    marker.textContent = gated ? 'GATED' : trigger.victory === true ? 'WIN' : 'ZONE';
    row.append(label, marker);
    row.addEventListener('click', () => selectEditorTrigger(trigger.id));
    ui.studioTriggerList.append(row);
  }
  ui.studioTriggerCount.textContent = `${editorTriggers.length} / ${MAX_MAP_TRIGGERS}`;
}

function syncEditorTimedVictoryControls() {
  const options = [new Option('No deadline', '')];
  for (const trigger of editorTriggers) {
    options.push(new Option(`${trigger.id} · ${trigger.name}`, trigger.id));
  }
  ui.studioDeadlineObjective.replaceChildren(...options);
  const rule = editorDefinition?.timedVictory;
  ui.studioDeadlineObjective.value = rule?.objectiveId || '';
  ui.studioDeadlineSeconds.value = rule?.afterSeconds ?? 600;
  ui.studioDeadlineSeconds.disabled = !ui.studioDeadlineObjective.value;
}

function saveEditorTimedVictoryFields() {
  if (!editorDefinition) return;
  const objectiveId = ui.studioDeadlineObjective.value;
  if (!objectiveId) {
    delete editorDefinition.timedVictory;
    return;
  }
  editorDefinition.timedVictory = { afterSeconds: Number(ui.studioDeadlineSeconds.value), objectiveId };
}

function saveEditorVictoryHoldFields() {
  if (!editorDefinition) return;
  const rawValue = ui.studioVictoryHoldSeconds.value.trim();
  if (!rawValue) {
    editorDefinition.victoryHoldSeconds = Number.NaN;
    return;
  }
  const seconds = Number(rawValue);
  if (seconds === 0) delete editorDefinition.victoryHoldSeconds;
  else editorDefinition.victoryHoldSeconds = seconds;
}

function saveEditorStartingResourcesFields() {
  if (!editorDefinition) return;
  const foodValue = ui.studioStartingFood.value.trim();
  const woodValue = ui.studioStartingWood.value.trim();
  if (!foodValue || !woodValue) {
    editorDefinition.startingResources = { food: Number.NaN, wood: Number.NaN };
    return;
  }
  const food = Number(foodValue);
  const wood = Number(woodValue);
  if (food === 0 && wood === 0) delete editorDefinition.startingResources;
  else editorDefinition.startingResources = { food, wood };
}

function saveEditorMatchOpeningFields() {
  if (!editorDefinition) return;
  editorDefinition.summary = ui.studioSummary.value.trim();
  const size = Number(ui.studioStartingArmySize.value);
  if (size === 1000) delete editorDefinition.startingArmySize;
  else editorDefinition.startingArmySize = size;
}

function syncEditorTriggerControls() {
  const trigger = getSelectedEditorTrigger();
  const selectedPrerequisites = trigger ? capturePrerequisiteIds(trigger)
    : editorTriggerCreationPending ? selectedEditorPrerequisiteIds() : [];
  const selectedPrerequisiteSet = new Set(selectedPrerequisites);
  const prerequisiteOptions = [];
  for (const option of editorTriggers) {
    if (option.id === trigger?.id) continue;
    const label = document.createElement('label');
    label.className = 'studio-prerequisite-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = option.id;
    checkbox.checked = selectedPrerequisiteSet.has(option.id);
    checkbox.disabled = !trigger && !editorTriggerCreationPending;
    const name = document.createElement('span');
    name.textContent = `${option.name} · ${option.id}`;
    label.append(checkbox, name);
    prerequisiteOptions.push(label);
  }
  if (prerequisiteOptions.length === 0) {
    const empty = document.createElement('small');
    empty.className = 'studio-prerequisite-empty';
    empty.textContent = 'Add another capture zone to enable prerequisites.';
    prerequisiteOptions.push(empty);
  }
  ui.studioObjectiveRequires.replaceChildren(...prerequisiteOptions);
  if (trigger) {
    ui.studioObjectiveName.value = trigger.name;
    ui.studioObjectiveMessage.value = trigger.message || '';
    ui.studioRequiredUnits.value = trigger.requiredUnits;
    ui.studioCaptureSeconds.value = trigger.captureSeconds;
    ui.studioObjectiveFoodReward.value = trigger.foodReward ?? 0;
    ui.studioObjectiveWoodReward.value = trigger.woodReward ?? 0;
    ui.studioObjectiveUnitCount.value = trigger.unitCount ?? 0;
    ui.studioObjectiveUnitKind.value = trigger.unitKind ?? 'infantry';
    ui.studioObjectiveVictory.checked = trigger.victory === true;
  } else if (editorTriggerCreationPending) {
    ui.studioObjectiveName.value ||= `Capture point ${editorTriggers.length + 1}`;
    ui.studioObjectiveMessage.value ||= '';
    ui.studioRequiredUnits.value ||= 8;
    ui.studioCaptureSeconds.value ||= 3.5;
    ui.studioObjectiveFoodReward.value ||= 0;
    ui.studioObjectiveWoodReward.value ||= 0;
    ui.studioObjectiveUnitCount.value ||= 0;
    ui.studioObjectiveUnitKind.value ||= 'infantry';
    ui.studioObjectiveVictory.checked = false;
  } else {
    ui.studioObjectiveName.value = '';
    ui.studioObjectiveMessage.value = '';
    ui.studioRequiredUnits.value = '';
    ui.studioCaptureSeconds.value = '';
    ui.studioObjectiveFoodReward.value = '';
    ui.studioObjectiveWoodReward.value = '';
    ui.studioObjectiveUnitCount.value = '';
    ui.studioObjectiveUnitKind.value = 'infantry';
    ui.studioObjectiveVictory.checked = false;
  }
  const fieldsEnabled = Boolean(trigger) || editorTriggerCreationPending;
  for (const field of [ui.studioObjectiveName, ui.studioObjectiveMessage, ui.studioRequiredUnits,
    ui.studioCaptureSeconds, ui.studioObjectiveFoodReward, ui.studioObjectiveWoodReward, ui.studioObjectiveUnitCount,
    ui.studioObjectiveUnitKind, ui.studioObjectiveVictory]) field.disabled = !fieldsEnabled;
  for (const checkbox of ui.studioObjectiveRequires.querySelectorAll('input[type="checkbox"]')) {
    checkbox.disabled = !fieldsEnabled;
  }
  ui.studioAddTrigger.disabled = editorTriggers.length >= MAX_MAP_TRIGGERS && !editorTriggerCreationPending;
  ui.studioAddTrigger.textContent = editorTriggerCreationPending ? 'CANCEL PLACEMENT' : '+ ADD CAPTURE ZONE';
  ui.studioRemoveTrigger.disabled = !trigger;
  syncEditorTimedVictoryControls();
  renderEditorTriggerList();
  syncEditorScenarioEventControls();
  if (editorTool === 'objective') setEditorTool('objective');
}

function saveSelectedEditorTriggerFields() {
  const trigger = getSelectedEditorTrigger();
  if (!trigger) {
    saveEditorTimedVictoryFields();
    return;
  }
  trigger.name = ui.studioObjectiveName.value;
  if (ui.studioObjectiveMessage.value.trim().length > 0) trigger.message = ui.studioObjectiveMessage.value;
  else delete trigger.message;
  trigger.requiredUnits = Number(ui.studioRequiredUnits.value);
  trigger.captureSeconds = Number(ui.studioCaptureSeconds.value);
  trigger.foodReward = Number(ui.studioObjectiveFoodReward.value);
  const woodReward = Number(ui.studioObjectiveWoodReward.value);
  if (woodReward === 0) delete trigger.woodReward;
  else trigger.woodReward = woodReward;
  trigger.unitCount = Number(ui.studioObjectiveUnitCount.value);
  trigger.unitKind = ui.studioObjectiveUnitKind.value;
  const victoryChanged = (trigger.victory === true) !== ui.studioObjectiveVictory.checked;
  trigger.victory = ui.studioObjectiveVictory.checked;
  const clearedEventTriggers = victoryChanged ? reconcileEditorScenarioEventTriggers() : 0;
  setEditorTriggerPrerequisites(trigger, selectedEditorPrerequisiteIds());
  saveEditorTimedVictoryFields();
  renderEditorTriggerList();
  if (victoryChanged) syncEditorScenarioEventControls();
  if (clearedEventTriggers) {
    ui.studioMessage.textContent = `Updated ${clearedEventTriggers} scenario event setting${clearedEventTriggers === 1 ? '' : 's'} because its linked zone would end the match immediately.`;
  }
}

function selectEditorTrigger(id) {
  saveSelectedEditorTriggerFields();
  if (!editorTriggers.some((trigger) => trigger.id === id)) return;
  selectedEditorTriggerId = id;
  editorTriggerCreationPending = false;
  syncEditorTriggerControls();
  drawEditorGrid();
}

function uniqueEditorTriggerId() {
  for (let suffix = 1; ; suffix++) {
    const id = `capture-zone-${suffix}`;
    if (!editorTriggers.some((trigger) => trigger.id === id)) return id;
  }
}

function beginAddingEditorTrigger() {
  if (editorTriggerCreationPending) {
    editorTriggerCreationPending = false;
    selectedEditorTriggerId = editorTriggers[0]?.id || null;
    syncEditorTriggerControls();
    setEditorTool('stone');
    ui.studioMessage.textContent = 'Capture-zone placement cancelled.';
    return;
  }
  saveSelectedEditorTriggerFields();
  if (editorTriggers.length >= MAX_MAP_TRIGGERS) {
    ui.studioMessage.textContent = `A map can have at most ${MAX_MAP_TRIGGERS} capture zones.`;
    return;
  }
  selectedEditorTriggerId = null;
  editorTriggerCreationPending = true;
  ui.studioObjectiveName.value = `Capture point ${editorTriggers.length + 1}`;
  ui.studioObjectiveMessage.value = '';
  ui.studioRequiredUnits.value = 8;
  ui.studioCaptureSeconds.value = 3.5;
  ui.studioObjectiveFoodReward.value = 0;
  ui.studioObjectiveWoodReward.value = 0;
  ui.studioObjectiveUnitCount.value = 0;
  ui.studioObjectiveUnitKind.value = 'infantry';
  ui.studioObjectiveVictory.checked = false;
  ui.studioObjectiveRequires.replaceChildren();
  syncEditorTriggerControls();
  setEditorTool('objective');
  ui.studioMessage.textContent = 'Drag on the map to place the new capture zone.';
}

function removeSelectedEditorTrigger() {
  saveSelectedEditorTriggerFields();
  const index = editorTriggers.findIndex((trigger) => trigger.id === selectedEditorTriggerId);
  if (index < 0) {
    ui.studioMessage.textContent = 'Select a capture zone to remove.';
    return;
  }
  const [removed] = editorTriggers.splice(index, 1);
  let clearedPrerequisites = 0;
  let clearedEventTriggers = 0;
  for (const trigger of editorTriggers) {
    const prerequisiteIds = capturePrerequisiteIds(trigger);
    if (!prerequisiteIds.includes(removed.id)) continue;
    setEditorTriggerPrerequisites(trigger, prerequisiteIds.filter((id) => id !== removed.id));
    clearedPrerequisites++;
  }
  for (const event of editorScenarioEvents) {
    if (event.trigger?.objectiveId !== removed.id) continue;
    delete event.trigger;
    if (event.team === 'capturing') event.team = 'both';
    clearedEventTriggers++;
  }
  const clearedDeadline = editorDefinition?.timedVictory?.objectiveId === removed.id;
  if (clearedDeadline) delete editorDefinition.timedVictory;
  const next = editorTriggers[Math.min(index, editorTriggers.length - 1)];
  selectedEditorTriggerId = next?.id || null;
  editorTriggerCreationPending = false;
  clearedEventTriggers += reconcileEditorScenarioEventTriggers();
  syncEditorTriggerControls();
  ui.studioMessage.textContent = `Removed ${removed.name}.${clearedPrerequisites
    ? ` Updated prerequisites on ${clearedPrerequisites} dependent zone${clearedPrerequisites === 1 ? '' : 's'}.` : ''}${clearedEventTriggers
    ? ` Updated ${clearedEventTriggers} dependent scenario event setting${clearedEventTriggers === 1 ? '' : 's'}.` : ''}${clearedDeadline
    ? ' Cleared the deadline victory rule.' : ''}`;
  drawEditorGrid();
}

function getSelectedEditorScenarioEvent() {
  return editorScenarioEvents.find((event) => event.id === selectedEditorScenarioEventId) || null;
}

function describeEditorScenarioEvent(event) {
  const objective = event.trigger?.type === 'capture'
    ? editorTriggers.find((trigger) => trigger.id === event.trigger.objectiveId) : null;
  const sourceEvents = scenarioEventSourceIds(event.trigger).map((sourceId) => (
    editorScenarioEvents.find((source) => source.id === sourceId)
  )).filter(Boolean);
  const source = objective
    ? `${event.trigger.occurrence === 'recapture' ? 'RECAPTURE' : 'FIRST CAPTURE'} · ${objective.name}`
    : sourceEvents.length > 1 ? `AFTER ALL ${sourceEvents.map((item) => item.name).join(' + ')}`
      : sourceEvents.length === 1 ? `AFTER ${sourceEvents[0].name}` : 'MATCH CLOCK';
  const recipient = event.team === 'both' ? 'BOTH TEAMS'
    : event.team === 'capturing' ? 'CAPTURING TEAM' : event.team === '0' ? 'AZURE' : 'EMBER';
  const rewards = [];
  if (event.foodReward > 0) rewards.push(`+${event.foodReward} FOOD`);
  if ((event.woodReward ?? 0) > 0) rewards.push(`+${event.woodReward} WOOD`);
  if ((event.unitCount ?? 0) > 0) {
    rewards.push(`+${event.unitCount} ${(event.unitKind ?? 'infantry').toUpperCase()} / TEAM`);
  }
  if (event.technologyReward) {
    rewards.push(event.technologyReward === 'infantry-attack' ? 'INFANTRY FORGING' : 'ARCHER FLETCHING');
  }
  const repeats = event.repeatCount
    ? ` · ${event.repeatCount} REPEATS EVERY ${event.repeatEverySeconds}s` : '';
  return `${source} · ${recipient} · ${rewards.length ? rewards.join(' · ') : 'ANNOUNCEMENT ONLY'}${repeats}`;
}

function renderEditorScenarioEventList() {
  ui.studioEventList.replaceChildren();
  for (const [index, event] of editorScenarioEvents.entries()) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `studio-trigger-row studio-event-row${event.id === selectedEditorScenarioEventId ? ' selected' : ''}`;
    row.setAttribute('aria-pressed', String(event.id === selectedEditorScenarioEventId));
    const summary = describeEditorScenarioEvent(event);
    row.title = `${event.name}. ${summary}.`;
    row.setAttribute('aria-label', `${event.name}. ${summary}.`);
    const copy = document.createElement('span');
    copy.className = 'studio-event-copy';
    const label = document.createElement('span');
    label.className = 'studio-trigger-name';
    label.textContent = `${String(index + 1).padStart(2, '0')} · ${event.name}`;
    const detail = document.createElement('span');
    detail.className = 'studio-event-summary';
    detail.textContent = summary;
    copy.append(label, detail);
    const marker = document.createElement('span');
    marker.className = 'studio-trigger-marker';
    marker.textContent = `${event.trigger?.type === 'capture'
      ? event.trigger.occurrence === 'recapture' ? 'R+' : 'C+'
      : event.trigger?.type === 'event' ? 'E+' : 'T+'}${event.afterSeconds}s`;
    row.append(copy, marker);
    row.addEventListener('click', () => selectEditorScenarioEvent(event.id));
    ui.studioEventList.append(row);
  }
  ui.studioEventCount.textContent = `${editorScenarioEvents.length} / ${MAX_MAP_SCENARIO_EVENTS}`;
}

function saveSelectedEditorScenarioEventFields() {
  const event = getSelectedEditorScenarioEvent();
  if (!event) return;
  event.name = ui.studioEventName.value;
  event.afterSeconds = Number(ui.studioEventAfter.value);
  if (ui.studioEventTrigger.value === 'capture') {
    event.trigger = { type: 'capture', objectiveId: ui.studioEventObjective.value };
    if (ui.studioEventOccurrence.value === 'recapture') event.trigger.occurrence = 'recapture';
  } else if (ui.studioEventTrigger.value === 'event') {
    const eventIds = [...ui.studioEventSources.querySelectorAll('input[type="checkbox"]:checked')]
      .map((input) => input.value);
    event.trigger = eventIds.length === 1
      ? { type: 'event', eventId: eventIds[0] }
      : { type: 'event', eventIds };
  } else {
    delete event.trigger;
  }
  if (!event.trigger && ui.studioEventTeam.value === 'capturing') ui.studioEventTeam.value = 'both';
  event.team = ui.studioEventTeam.value;
  reconcileEditorScenarioEventCapturingTeams();
  event.foodReward = Number(ui.studioEventFood.value);
  const woodReward = Number(ui.studioEventWood.value);
  if (woodReward === 0) delete event.woodReward;
  else event.woodReward = woodReward;
  const repeatCount = Number(ui.studioEventRepeatCount.value);
  if (repeatCount > 0) {
    event.repeatCount = repeatCount;
    event.repeatEverySeconds = Number(ui.studioEventRepeatEvery.value);
  } else {
    delete event.repeatCount;
    delete event.repeatEverySeconds;
  }
  event.unitCount = Number(ui.studioEventUnitCount.value);
  event.unitKind = ui.studioEventUnitKind.value;
  if (ui.studioEventTechnologyReward.value) event.technologyReward = ui.studioEventTechnologyReward.value;
  else delete event.technologyReward;
  if (ui.studioEventMessage.value.trim()) event.message = ui.studioEventMessage.value;
  else delete event.message;
  renderEditorScenarioEventList();
}

function eligibleEditorCaptureTriggers() {
  const allowsVictoryZoneCaptureDrops = (editorDefinition?.victoryMode === 'all'
    && editorTriggers.filter((trigger) => trigger.victory === true).length >= 2)
    || (editorDefinition?.victoryHoldSeconds ?? 0) > 0;
  return editorTriggers.filter((trigger) => trigger.victory !== true || allowsVictoryZoneCaptureDrops);
}

function editorScenarioEventCaptureRootId(eventId, cache = new Map(), visiting = new Set()) {
  if (cache.has(eventId)) return cache.get(eventId);
  if (visiting.has(eventId)) return null;
  visiting.add(eventId);
  const event = editorScenarioEvents.find((item) => item.id === eventId);
  let rootId = event?.trigger?.type === 'capture' ? event.id : null;
  const sourceIds = scenarioEventSourceIds(event?.trigger);
  if (sourceIds.length > 0) {
    const roots = sourceIds.map((sourceId) => editorScenarioEventCaptureRootId(sourceId, cache, visiting));
    if (roots[0] && roots.every((candidate) => candidate === roots[0])) rootId = roots[0];
  }
  visiting.delete(eventId);
  cache.set(eventId, rootId);
  return rootId;
}

function editorScenarioEventHasCaptureRoot(eventId) {
  return editorScenarioEventCaptureRootId(eventId) !== null;
}

function reconcileEditorScenarioEventCapturingTeams() {
  let changed = 0;
  for (const event of editorScenarioEvents) {
    if (event.team !== 'capturing' || editorScenarioEventHasCaptureRoot(event.id)) continue;
    event.team = 'both';
    changed++;
  }
  return changed;
}

function editorScenarioEventSourceWouldCycle(sourceId, childId) {
  const visited = new Set();
  const reachesChild = (eventId) => {
    if (eventId === childId) return true;
    if (visited.has(eventId)) return false;
    visited.add(eventId);
    const event = editorScenarioEvents.find((item) => item.id === eventId);
    return scenarioEventSourceIds(event?.trigger).some(reachesChild);
  };
  return reachesChild(sourceId);
}

function eligibleEditorScenarioEventSources(event) {
  return editorScenarioEvents.filter((source) => source.id !== event?.id
    && !editorScenarioEventSourceWouldCycle(source.id, event?.id));
}

function reconcileEditorScenarioEventTriggers() {
  const eligibleIds = new Set(eligibleEditorCaptureTriggers().map((trigger) => trigger.id));
  let cleared = 0;
  for (const event of editorScenarioEvents) {
    if (event.trigger?.type !== 'capture' || eligibleIds.has(event.trigger.objectiveId)) continue;
    delete event.trigger;
    if (event.team === 'capturing') event.team = 'both';
    cleared++;
  }
  cleared += reconcileEditorScenarioEventCapturingTeams();
  return cleared;
}

function syncEditorScenarioEventControls() {
  reconcileEditorScenarioEventCapturingTeams();
  const event = getSelectedEditorScenarioEvent();
  const eligibleCaptureTriggers = eligibleEditorCaptureTriggers();
  const eligibleSources = eligibleEditorScenarioEventSources(event);
  const captureTriggerOption = [...ui.studioEventTrigger.options].find((option) => option.value === 'capture');
  if (captureTriggerOption) captureTriggerOption.disabled = eligibleCaptureTriggers.length === 0;
  const eventTriggerOption = [...ui.studioEventTrigger.options].find((option) => option.value === 'event');
  if (eventTriggerOption) eventTriggerOption.disabled = eligibleSources.length === 0;
  const objectiveOptions = [new Option(
    eligibleCaptureTriggers.length ? 'Choose a capture zone' : 'Add an eligible capture zone', '',
  )];
  for (const trigger of eligibleCaptureTriggers) {
    objectiveOptions.push(new Option(`${trigger.id} · ${trigger.name}${trigger.victory === true ? ' · VICTORY' : ''}`, trigger.id));
  }
  ui.studioEventObjective.replaceChildren(...objectiveOptions);
  const sourceIds = scenarioEventSourceIds(event?.trigger);
  const sourceSet = new Set(sourceIds);
  const sourceOptions = [];
  for (const source of eligibleSources) {
    const label = document.createElement('label');
    label.className = 'studio-prerequisite-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = source.id;
    checkbox.checked = sourceSet.has(source.id);
    checkbox.disabled = !event || event.trigger?.type !== 'event';
    const name = document.createElement('span');
    name.textContent = `${source.name} · ${source.id}`;
    label.append(checkbox, name);
    sourceOptions.push(label);
  }
  if (sourceOptions.length === 0) {
    const empty = document.createElement('small');
    empty.className = 'studio-prerequisite-empty';
    empty.textContent = 'Add another scenario event to enable event chains.';
    sourceOptions.push(empty);
  }
  ui.studioEventSources.replaceChildren(...sourceOptions);
  if (event) {
    ui.studioEventName.value = event.name;
    ui.studioEventTrigger.value = event.trigger?.type === 'capture' ? 'capture'
      : event.trigger?.type === 'event' ? 'event' : 'clock';
    ui.studioEventObjective.value = event.trigger?.objectiveId || '';
    ui.studioEventOccurrence.value = event.trigger?.occurrence || 'first';
    ui.studioEventAfter.value = event.afterSeconds;
    ui.studioEventRepeatCount.value = event.repeatCount ?? 0;
    ui.studioEventRepeatEvery.value = event.repeatEverySeconds ?? 60;
    ui.studioEventTeam.value = event.team === 'capturing' && !event.trigger ? 'both' : event.team;
    ui.studioEventFood.value = event.foodReward;
    ui.studioEventWood.value = event.woodReward ?? 0;
    ui.studioEventUnitCount.value = event.unitCount ?? 0;
    ui.studioEventUnitKind.value = event.unitKind ?? 'infantry';
    ui.studioEventTechnologyReward.value = event.technologyReward || '';
    ui.studioEventMessage.value = event.message || '';
  } else {
    ui.studioEventName.value = '';
    ui.studioEventTrigger.value = 'clock';
    ui.studioEventObjective.value = '';
    ui.studioEventOccurrence.value = 'first';
    ui.studioEventAfter.value = '';
    ui.studioEventRepeatCount.value = '0';
    ui.studioEventRepeatEvery.value = '60';
    ui.studioEventTeam.value = 'both';
    ui.studioEventFood.value = '';
    ui.studioEventWood.value = '';
    ui.studioEventUnitCount.value = '0';
    ui.studioEventUnitKind.value = 'infantry';
    ui.studioEventTechnologyReward.value = '';
    ui.studioEventMessage.value = '';
  }
  const captureTriggered = event?.trigger?.type === 'capture';
  const eventTriggered = event?.trigger?.type === 'event';
  const hasCaptureRoot = event && editorScenarioEventHasCaptureRoot(event.id);
  if (event?.team === 'capturing' && !hasCaptureRoot) ui.studioEventTeam.value = 'both';
  const capturingTeamOption = [...ui.studioEventTeam.options].find((option) => option.value === 'capturing');
  if (capturingTeamOption) capturingTeamOption.disabled = !hasCaptureRoot;
  ui.studioEventObjectiveControl.hidden = !captureTriggered;
  ui.studioEventSourceControl.hidden = !eventTriggered;
  ui.studioEventOccurrenceControl.hidden = !captureTriggered;
  ui.studioEventAfterLabel.firstChild.textContent = captureTriggered
    ? 'DELAY AFTER CAPTURE (SECONDS)' : eventTriggered
      ? 'DELAY AFTER EVENT (SECONDS)' : 'AFTER MATCH START (SECONDS)';
  for (const field of [ui.studioEventName, ui.studioEventTrigger, ui.studioEventObjective,
    ui.studioEventAfter, ui.studioEventTeam,
    ui.studioEventFood, ui.studioEventWood, ui.studioEventUnitCount, ui.studioEventUnitKind,
    ui.studioEventTechnologyReward, ui.studioEventMessage]) field.disabled = !event;
  ui.studioEventObjective.disabled = !event || !captureTriggered || eligibleCaptureTriggers.length === 0;
  for (const input of ui.studioEventSources.querySelectorAll('input[type="checkbox"]')) {
    input.disabled = !event || !eventTriggered;
  }
  ui.studioEventOccurrence.disabled = !event || !captureTriggered;
  ui.studioEventRepeatCount.disabled = !event;
  ui.studioEventRepeatEvery.disabled = !event || Number(ui.studioEventRepeatCount.value) === 0;
  ui.studioAddEvent.disabled = editorScenarioEvents.length >= MAX_MAP_SCENARIO_EVENTS;
  ui.studioRemoveEvent.disabled = !event;
  renderEditorScenarioEventList();
}

function selectEditorScenarioEvent(id) {
  saveSelectedEditorScenarioEventFields();
  if (!editorScenarioEvents.some((event) => event.id === id)) return;
  selectedEditorScenarioEventId = id;
  syncEditorScenarioEventControls();
}

function uniqueEditorScenarioEventId() {
  for (let suffix = 1; ; suffix++) {
    const id = `supply-drop-${suffix}`;
    if (!editorScenarioEvents.some((event) => event.id === id)) return id;
  }
}

function addEditorScenarioEvent() {
  if (editorScenarioEvents.length >= MAX_MAP_SCENARIO_EVENTS) {
    ui.studioMessage.textContent = `A map can have at most ${MAX_MAP_SCENARIO_EVENTS} scenario events.`;
    return;
  }
  const index = editorScenarioEvents.length + 1;
  const event = {
    id: uniqueEditorScenarioEventId(), name: `Supply drop ${index}`, type: 'timed-supply',
    afterSeconds: 60, team: 'both', foodReward: 100, unitCount: 0, unitKind: 'infantry',
  };
  editorScenarioEvents.push(event);
  selectedEditorScenarioEventId = event.id;
  syncEditorScenarioEventControls();
  ui.studioMessage.textContent = 'Scenario event added. Set it to start from the match clock or a capture zone.';
}

function removeSelectedEditorScenarioEvent() {
  saveSelectedEditorScenarioEventFields();
  const index = editorScenarioEvents.findIndex((event) => event.id === selectedEditorScenarioEventId);
  if (index < 0) return;
  const [removed] = editorScenarioEvents.splice(index, 1);
  let resetDependents = 0;
  for (const event of editorScenarioEvents) {
    const sourceIds = scenarioEventSourceIds(event.trigger);
    if (!sourceIds.includes(removed.id)) continue;
    const remaining = sourceIds.filter((sourceId) => sourceId !== removed.id);
    if (remaining.length === 1) event.trigger = { type: 'event', eventId: remaining[0] };
    else if (remaining.length > 1) event.trigger = { type: 'event', eventIds: remaining };
    else delete event.trigger;
    if (!event.trigger && event.team === 'capturing') event.team = 'both';
    resetDependents++;
  }
  selectedEditorScenarioEventId = editorScenarioEvents[Math.min(index, editorScenarioEvents.length - 1)]?.id || null;
  syncEditorScenarioEventControls();
  ui.studioMessage.textContent = `Removed ${removed.name}.${resetDependents
    ? ` Reset ${resetDependents} dependent event${resetDependents === 1 ? '' : 's'} to the match clock.` : ''}`;
}

function getSelectedEditorResourceNode() {
  return editorResourceNodes.find((node) => node.id === selectedEditorResourceId) || null;
}

function syncEditorResourceControls() {
  const node = getSelectedEditorResourceNode();
  const nextResourceType = editorTool === 'resource-wood' ? 'wood'
    : editorTool === 'resource-food' ? 'food' : 'resource';
  ui.studioResourceCount.textContent = `${editorResourceNodes.length} / ${MAX_MAP_RESOURCE_NODES}`;
  ui.studioResourceStock.disabled = !node
    && editorTool !== 'resource-food' && editorTool !== 'resource-wood';
  ui.studioResourceStock.value = node ? node.stock : ui.studioResourceStock.value;
  ui.studioResourceStock.setAttribute('aria-label', node
    ? `Starting stock for selected ${node.type} node ${node.id}`
    : `Starting stock for the next ${nextResourceType} node`);
  ui.studioResourceStock.setAttribute('aria-invalid', 'false');
  ui.studioRemoveResource.disabled = !node;
}

function saveSelectedEditorResourceStock() {
  const node = getSelectedEditorResourceNode();
  if (!node) return true;
  const stock = Number(ui.studioResourceStock.value);
  if (!Number.isFinite(stock) || stock <= 0) {
    ui.studioResourceStock.setAttribute('aria-invalid', 'true');
    ui.studioMessage.textContent = 'Resource node stock must be a positive number.';
    return false;
  }
  ui.studioResourceStock.setAttribute('aria-invalid', 'false');
  node.stock = stock;
  return true;
}

function removeSelectedEditorResourceNode() {
  const index = editorResourceNodes.findIndex((node) => node.id === selectedEditorResourceId);
  if (index < 0) return;
  const [removed] = editorResourceNodes.splice(index, 1);
  selectedEditorResourceId = null;
  syncEditorResourceControls();
  drawEditorGrid();
  ui.studioMessage.textContent = `Removed ${removed.type} node ${removed.id}.`;
}

function populateMapEditor(definition, message) {
  editorDefinition = JSON.parse(JSON.stringify(definition));
  editorDefinition.fogOfWar ??= false;
  editorDefinition.terrainBase ??= environmentTheme(definition);
  ui.studioTerrainBase.value = editorDefinition.terrainBase;
  editorGroundMaterials = new Int8Array(editorDefinition.width * editorDefinition.height);
  editorGroundMaterials.fill(-1);
  for (const patch of editorDefinition.terrainPatches || []) {
    const material = TERRAIN_MATERIALS.indexOf(patch.material);
    for (let row = patch.row; row < patch.row + patch.height; row++) {
      for (let column = patch.column; column < patch.column + patch.width; column++) {
        editorGroundMaterials[row * editorDefinition.width + column] = material;
      }
    }
  }
  editorCellMaterials = new Int8Array(editorDefinition.width * editorDefinition.height);
  editorCellMaterials.fill(-1);
  editorCellElevations = new Float64Array(editorDefinition.width * editorDefinition.height);
  editorCellElevations.fill(1.12);
  for (const obstacle of editorDefinition.obstacles) {
    const material = EDITOR_MATERIALS.indexOf(obstacle.material || 'stone');
    const elevation = obstacle.elevation ?? 1.12;
    for (let row = obstacle.row; row < obstacle.row + obstacle.height; row++) {
      for (let column = obstacle.column; column < obstacle.column + obstacle.width; column++) {
        const index = row * editorDefinition.width + column;
        editorCellMaterials[index] = material;
        editorCellElevations[index] = elevation;
      }
    }
  }
  editorTriggers = JSON.parse(JSON.stringify(editorDefinition.triggers || []));
  editorScenarioEvents = JSON.parse(JSON.stringify(editorDefinition.scenarioEvents || []));
  selectedEditorTriggerId = editorTriggers[0]?.id || null;
  selectedEditorScenarioEventId = editorScenarioEvents[0]?.id || null;
  editorTriggerCreationPending = false;
  editorResourceNodes = JSON.parse(JSON.stringify(editorDefinition.resourceNodes || []));
  selectedEditorResourceId = null;
  ui.studioName.value = editorDefinition.name;
  ui.studioId.value = editorDefinition.id;
  ui.studioSummary.value = editorDefinition.summary || '';
  ui.studioWidth.value = editorDefinition.width;
  ui.studioHeight.value = editorDefinition.height;
  ui.studioStartingArmySize.value = editorDefinition.startingArmySize ?? 1000;
  ui.studioStartingFood.value = editorDefinition.startingResources?.food ?? 0;
  ui.studioStartingWood.value = editorDefinition.startingResources?.wood ?? 0;
  editorDefinition.victoryMode ??= 'any';
  ui.studioVictoryMode.value = editorDefinition.victoryMode;
  ui.studioVictoryHoldSeconds.value = editorDefinition.victoryHoldSeconds ?? 0;
  ui.studioFogOfWar.checked = editorDefinition.fogOfWar;
  syncEditorTriggerControls();
  syncEditorScenarioEventControls();
  syncEditorResourceControls();
  ui.studioMessage.textContent = message;
  ui.studioPublish.disabled = false;
  editorDrag = null;
  setEditorTool('stone');
}

function validateImportedMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON must contain a map object.');
  const definition = JSON.parse(JSON.stringify(value));
  definition.victoryMode ??= 'any';
  definition.fogOfWar ??= false;
  if (typeof definition.fogOfWar !== 'boolean') {
    throw new Error('Fog of war must be enabled or disabled.');
  }
  if (!['any', 'all'].includes(definition.victoryMode)) {
    throw new Error('Victory rule must be set to capture any or hold all marked zones.');
  }
  if (definition.victoryHoldSeconds !== undefined
    && (!Number.isFinite(definition.victoryHoldSeconds) || definition.victoryHoldSeconds < 0
      || (definition.victoryHoldSeconds > 0 && definition.victoryHoldSeconds < 0.5)
      || definition.victoryHoldSeconds > 3600)) {
    throw new Error('Victory hold must be 0 or 0.5 to 3,600 seconds.');
  }
  if (definition.startingResources !== undefined) {
    const resources = definition.startingResources;
    if (!resources || typeof resources !== 'object' || Array.isArray(resources)
      || Object.keys(resources).some((key) => !['food', 'wood'].includes(key))
      || (resources.food !== undefined && (!Number.isInteger(resources.food)
        || resources.food < 0 || resources.food > 100_000))
      || (resources.wood !== undefined && (!Number.isInteger(resources.wood)
        || resources.wood < 0 || resources.wood > 100_000))) {
      throw new Error('Starting food and wood must be whole numbers from 0 to 100,000.');
    }
  }
  if (definition.startingArmySize !== undefined
    && (!Number.isInteger(definition.startingArmySize)
      || definition.startingArmySize < 8 || definition.startingArmySize > 2000
      || definition.startingArmySize % 2 !== 0)) {
    throw new Error('Starting army must be an even total from 8 to 2,000 units.');
  }
  if (definition.summary !== undefined
    && (typeof definition.summary !== 'string' || definition.summary.length > 120)) {
    throw new Error('Scenario brief must be 120 characters or fewer.');
  }
  if (typeof definition.id !== 'string' || definition.id.length > 48
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id)) {
    throw new Error('Map ID must use lowercase letters, numbers, and hyphens.');
  }
  if (typeof definition.name !== 'string' || !definition.name.trim() || definition.name.length > 48) {
    throw new Error('Map name must be between 1 and 48 characters.');
  }
  if (!Number.isInteger(definition.width) || !Number.isInteger(definition.height)
    || definition.width < 16 || definition.height < 16 || definition.width > 256 || definition.height > 256) {
    throw new Error('Map width and height must be whole numbers between 16 and 256.');
  }
  if (definition.terrainBase !== undefined && !TERRAIN_MATERIALS.includes(definition.terrainBase)) {
    throw new Error('Map has an invalid base ground material.');
  }
  const terrainPatches = definition.terrainPatches ?? [];
  if (!Array.isArray(terrainPatches) || terrainPatches.length > 4096) {
    throw new Error('Map must contain at most 4,096 ground paint patches.');
  }
  const paintedCells = new Uint8Array(definition.width * definition.height);
  for (const patch of terrainPatches) {
    const { column, row, width, height, material } = patch || {};
    if (![column, row, width, height].every(Number.isInteger)
      || column < 0 || row < 0 || width < 1 || height < 1
      || column + width > definition.width || row + height > definition.height
      || !TERRAIN_MATERIALS.includes(material)) {
      throw new Error('Map has a ground paint patch outside its grid or with an invalid material.');
    }
    for (let paintedRow = row; paintedRow < row + height; paintedRow++) {
      for (let paintedColumn = column; paintedColumn < column + width; paintedColumn++) {
        const index = paintedRow * definition.width + paintedColumn;
        if (paintedCells[index]) throw new Error('Map has overlapping ground paint patches.');
        paintedCells[index] = 1;
      }
    }
  }
  if (!Array.isArray(definition.obstacles) || definition.obstacles.length > 4096) {
    throw new Error('Map must contain at most 4,096 terrain blocks.');
  }
  const blockedCells = new Uint8Array(definition.width * definition.height);
  for (const obstacle of definition.obstacles) {
    const { column, row, width, height } = obstacle || {};
    if (![column, row, width, height].every(Number.isInteger)
      || column < 0 || row < 0 || width < 1 || height < 1
      || column + width > definition.width || row + height > definition.height
      || (obstacle?.material !== undefined && !EDITOR_MATERIALS.includes(obstacle.material))
      || (obstacle?.elevation !== undefined && (!Number.isFinite(obstacle.elevation) || obstacle.elevation <= 0))) {
      throw new Error('Map has a terrain block outside its grid or with invalid dimensions.');
    }
    for (let row = obstacle.row; row < obstacle.row + obstacle.height; row++) {
      for (let column = obstacle.column; column < obstacle.column + obstacle.width; column++) {
        const index = row * definition.width + column;
        if (blockedCells[index]) throw new Error('Map has overlapping terrain blocks.');
        blockedCells[index] = 1;
      }
    }
  }
  if (!Array.isArray(definition.spawnPoints) || definition.spawnPoints.length !== 2) {
    throw new Error('Map needs one spawn point for each team.');
  }
  const teams = new Set();
  for (const spawn of definition.spawnPoints) {
    if (!spawn || ![0, 1].includes(spawn.team) || teams.has(spawn.team)
      || !Number.isFinite(spawn.x) || !Number.isFinite(spawn.z)
      || Math.abs(spawn.x) >= definition.width / 2 || Math.abs(spawn.z) >= definition.height / 2) {
      throw new Error('Map needs one valid, in-bounds spawn point for each team.');
    }
    teams.add(spawn.team);
    const column = Math.floor(spawn.x + definition.width / 2);
    const row = Math.floor(spawn.z + definition.height / 2);
    if (blockedCells[row * definition.width + column]) {
      throw new Error(`Team ${spawn.team} spawn is on blocked terrain.`);
    }
  }
  definition.resourceNodes ??= [];
  if (!Array.isArray(definition.resourceNodes) || definition.resourceNodes.length > MAX_MAP_RESOURCE_NODES) {
    throw new Error(`Map may contain at most ${MAX_MAP_RESOURCE_NODES} resource nodes.`);
  }
  const resourceIds = new Set();
  for (const node of definition.resourceNodes) {
    if (!node || typeof node.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(node.id)
      || resourceIds.has(node.id) || !['food', 'wood'].includes(node.type)
      || !Number.isFinite(node.x) || !Number.isFinite(node.z)
      || Math.abs(node.x) >= definition.width / 2 || Math.abs(node.z) >= definition.height / 2
      || !Number.isFinite(node.stock) || node.stock <= 0) {
      throw new Error('Map has an invalid, duplicate, or out-of-bounds food or wood node.');
    }
    resourceIds.add(node.id);
    const column = Math.floor(node.x + definition.width / 2);
    const row = Math.floor(node.z + definition.height / 2);
    if (blockedCells[row * definition.width + column]) throw new Error(`Resource node ${node.id} is on blocked terrain.`);
  }
  const unreachableNode = findUnreachableResourceNode(
    definition.width, definition.height, blockedCells, definition.spawnPoints, definition.resourceNodes,
  );
  if (unreachableNode) {
    throw new Error(`Resource node ${unreachableNode.nodeId} must be reachable from both team spawns.`);
  }
  definition.triggers ??= [];
  if (!Array.isArray(definition.triggers) || definition.triggers.length > MAX_MAP_TRIGGERS) {
    throw new Error(`Map may contain at most ${MAX_MAP_TRIGGERS} scenario triggers.`);
  }
  const triggerIds = new Set();
  for (const trigger of definition.triggers) {
    const zone = trigger?.zone;
    if (typeof trigger?.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trigger.id)
      || triggerIds.has(trigger.id) || trigger.type !== 'capture-zone'
      || typeof trigger.name !== 'string' || !trigger.name.trim() || !zone
      || ![zone.column, zone.row, zone.width, zone.height].every(Number.isInteger)
      || zone.column < 0 || zone.row < 0 || zone.width < 1 || zone.height < 1
      || zone.column + zone.width > definition.width || zone.row + zone.height > definition.height
      || !Number.isInteger(trigger.requiredUnits) || trigger.requiredUnits < 1 || trigger.requiredUnits > MAX_PER_TEAM
      || !Number.isFinite(trigger.captureSeconds) || trigger.captureSeconds < 0.5 || trigger.captureSeconds > 60
      || (trigger.foodReward !== undefined && (!Number.isInteger(trigger.foodReward)
        || trigger.foodReward < 0 || trigger.foodReward > MAX_OBJECTIVE_FOOD_REWARD))
      || (trigger.woodReward !== undefined && (!Number.isInteger(trigger.woodReward)
        || trigger.woodReward < 0 || trigger.woodReward > MAX_OBJECTIVE_FOOD_REWARD))
      || (trigger.unitCount !== undefined && (!Number.isInteger(trigger.unitCount)
        || trigger.unitCount < 0 || trigger.unitCount > MAX_TRIGGER_UNIT_REWARD))
      || (trigger.unitKind !== undefined && !['worker', 'infantry', 'archer'].includes(trigger.unitKind))
      || (trigger.requires !== undefined && (typeof trigger.requires !== 'string'
        || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trigger.requires)))
      || (trigger.requiresAll !== undefined && (trigger.requires !== undefined
        || !Array.isArray(trigger.requiresAll) || trigger.requiresAll.length < 2 || trigger.requiresAll.length > 31
        || trigger.requiresAll.some((id) => typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))))
      || (trigger.victory !== undefined && typeof trigger.victory !== 'boolean')
      || (trigger.message !== undefined && (typeof trigger.message !== 'string' || trigger.message.length > 120))) {
      throw new Error('Map contains an invalid capture-zone trigger.');
    }
    triggerIds.add(trigger.id);
    let hasWalkableCell = false;
    for (let row = zone.row; row < zone.row + zone.height && !hasWalkableCell; row++) {
      for (let column = zone.column; column < zone.column + zone.width; column++) {
        if (!blockedCells[row * definition.width + column]) { hasWalkableCell = true; break; }
      }
    }
    if (!hasWalkableCell) throw new Error(`Capture zone ${trigger.id} covers no walkable cells.`);
  }
  if ((definition.victoryHoldSeconds ?? 0) > 0
    && !definition.triggers.some((trigger) => trigger.victory === true)) {
    throw new Error('A victory hold timer requires at least one marked victory zone.');
  }
  const invalidPrerequisite = findInvalidCapturePrerequisite(definition.triggers);
  if (invalidPrerequisite) {
    const detail = invalidPrerequisite.reason === 'missing'
      ? `requires missing capture zone ${invalidPrerequisite.requires}`
      : invalidPrerequisite.reason === 'self' ? 'cannot require itself'
        : invalidPrerequisite.reason === 'duplicate' ? 'lists the same prerequisite more than once'
          : invalidPrerequisite.reason === 'cycle' ? 'creates a prerequisite cycle'
            : 'creates an invalid prerequisite graph';
    throw new Error(`Capture zone ${invalidPrerequisite.triggerId} ${detail}.`);
  }
  if (definition.timedVictory !== undefined) {
    const rule = definition.timedVictory;
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)
      || !Number.isFinite(rule.afterSeconds) || rule.afterSeconds < 0.5 || rule.afterSeconds > 3600
      || typeof rule.objectiveId !== 'string'
      || !definition.triggers.some((trigger) => trigger.id === rule.objectiveId)) {
      throw new Error('Deadline victory must have a time from 0.5 to 3,600 seconds and a valid capture zone.');
    }
  }
  const unreachableTrigger = findUnreachableCaptureZone(
    definition.width, definition.height, blockedCells, definition.spawnPoints, definition.triggers,
  );
  if (unreachableTrigger) {
    throw new Error(`Capture zone ${unreachableTrigger.triggerId} is unreachable from team ${unreachableTrigger.team}.`);
  }
  definition.scenarioEvents ??= [];
  if (!Array.isArray(definition.scenarioEvents) || definition.scenarioEvents.length > MAX_MAP_SCENARIO_EVENTS) {
    throw new Error(`Map may contain at most ${MAX_MAP_SCENARIO_EVENTS} scenario events.`);
  }
  const allowsVictoryZoneCaptureDrops = (definition.victoryMode === 'all'
    && definition.triggers.filter((trigger) => trigger.victory === true).length >= 2)
    || (definition.victoryHoldSeconds ?? 0) > 0;
  const scenarioEventIds = new Set();
  for (const event of definition.scenarioEvents) {
    const eventTrigger = event?.trigger;
    const captureTriggered = eventTrigger?.type === 'capture';
    const eventTriggered = eventTrigger?.type === 'event';
    const validCaptureTrigger = captureTriggered
      && typeof eventTrigger === 'object' && !Array.isArray(eventTrigger)
      && Object.keys(eventTrigger).every((key) => ['type', 'objectiveId', 'occurrence'].includes(key))
      && typeof eventTrigger.objectiveId === 'string'
      && (eventTrigger.occurrence === undefined
        || ['first', 'recapture'].includes(eventTrigger.occurrence))
      && definition.triggers.some((trigger) => trigger.id === eventTrigger.objectiveId
        && (trigger.victory !== true || allowsVictoryZoneCaptureDrops));
    const validEventChain = eventTriggered
      && typeof eventTrigger === 'object' && !Array.isArray(eventTrigger)
      && Object.keys(eventTrigger).every((key) => ['type', 'eventId', 'eventIds'].includes(key))
      && !(Object.hasOwn(eventTrigger, 'eventId') && Object.hasOwn(eventTrigger, 'eventIds'))
      && (typeof eventTrigger.eventId === 'string'
        ? /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(eventTrigger.eventId)
        : Array.isArray(eventTrigger.eventIds) && eventTrigger.eventIds.length >= 2
          && eventTrigger.eventIds.length <= MAX_MAP_SCENARIO_EVENTS - 1
          && eventTrigger.eventIds.every((id) => typeof id === 'string'
            && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)));
    const validEventTrigger = eventTrigger === undefined || validCaptureTrigger || validEventChain;
    if (typeof event?.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.id)
      || scenarioEventIds.has(event.id) || event.type !== 'timed-supply'
      || typeof event.name !== 'string' || !event.name.trim() || event.name.length > 48
      || !Number.isFinite(event.afterSeconds) || event.afterSeconds < 0.5 || event.afterSeconds > 3600
      || ((event.repeatCount === undefined) !== (event.repeatEverySeconds === undefined))
      || (event.repeatCount !== undefined && (!Number.isInteger(event.repeatCount)
        || event.repeatCount < 1 || event.repeatCount > MAX_SCENARIO_EVENT_REPEATS
        || !Number.isFinite(event.repeatEverySeconds)
        || event.repeatEverySeconds < MIN_SCENARIO_EVENT_REPEAT_SECONDS
        || event.repeatEverySeconds > 3600))
      || !validEventTrigger
      || (!['0', '1', 'both'].includes(event.team)
        && !(event.team === 'capturing' && (captureTriggered || eventTriggered)))
      || !Number.isInteger(event.foodReward) || event.foodReward < 0 || event.foodReward > MAX_OBJECTIVE_FOOD_REWARD
      || (event.woodReward !== undefined && (!Number.isInteger(event.woodReward)
        || event.woodReward < 0 || event.woodReward > MAX_OBJECTIVE_FOOD_REWARD))
      || (event.unitCount !== undefined && (!Number.isInteger(event.unitCount)
        || event.unitCount < 0 || event.unitCount > 25))
      || (event.unitKind !== undefined && !['worker', 'infantry', 'archer'].includes(event.unitKind))
      || (event.technologyReward !== undefined
        && !['infantry-attack', 'archer-attack'].includes(event.technologyReward))
      || (event.message !== undefined && (typeof event.message !== 'string' || event.message.length > 120))
      || (event.foodReward === 0 && (event.woodReward ?? 0) === 0
        && (event.unitCount ?? 0) === 0 && !event.technologyReward && !event.message?.trim())) {
      throw new Error('Map contains an invalid timed supply event.');
    }
    scenarioEventIds.add(event.id);
  }
  const invalidEventChain = findInvalidScenarioEventChain(definition.scenarioEvents);
  if (invalidEventChain) {
    const detail = invalidEventChain.reason === 'missing'
      ? `references missing scenario event ${invalidEventChain.sourceId}`
      : invalidEventChain.reason === 'cycle' ? 'creates a scenario event cycle'
        : invalidEventChain.reason === 'duplicate' ? 'lists the same source event more than once'
        : 'uses the capturing team without a capture-triggered event in its chain';
    throw new Error(`Scenario event ${invalidEventChain.eventId} ${detail}.`);
  }
  if (!Number.isInteger(definition.terrainSeed)) definition.terrainSeed = 1;
  return definition;
}

async function importEditorMap(file) {
  if (file.size > 900_000) throw new Error('Map JSON must be smaller than 900 KB so it can be sent safely.');
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const definition = validateImportedMap(parsed);
  populateMapEditor(definition,
    `Loaded ${file.name}. Review the map ID, then publish it to the room when ready.`);
  scheduleMapStudioDraftSave();
  drawEditorGrid();
}

function isGroundEditorTool(tool) {
  return tool === 'ground-reset' || tool.startsWith('ground:');
}

function setEditorTool(tool) {
  editorTool = tool;
  for (const button of document.querySelectorAll('[data-map-tool]')) {
    button.classList.toggle('active', button.dataset.mapTool === tool);
  }
  const hints = {
    rock: 'DRAG TO PAINT LOW ROCK OUTCROPS', stone: 'DRAG TO PAINT BASALT RIDGES',
    cliff: 'DRAG TO PAINT TALL CLIFFS', forest: 'DRAG TO PAINT FOREST', water: 'DRAG TO PAINT WATER',
    'ground-reset': 'DRAG TO BRUSH THE BASE GROUND MATERIAL',
    erase: 'DRAG TO CLEAR TERRAIN', azure: 'CLICK TO PLACE AZURE SPAWN',
    ember: 'CLICK TO PLACE EMBER SPAWN', 'resource-food': 'CLICK EMPTY CELL TO PLACE · CLICK NODE TO EDIT',
    'resource-wood': 'CLICK EMPTY CELL TO PLACE · CLICK NODE TO EDIT',
    objective: editorTriggerCreationPending ? 'DRAG TO PLACE A NEW CAPTURE ZONE'
      : getSelectedEditorTrigger() ? 'DRAG TO RESIZE THE SELECTED CAPTURE ZONE' : 'ADD A CAPTURE ZONE, THEN DRAG TO PLACE IT',
  };
  if (!getSelectedEditorResourceNode()) {
    if (tool === 'resource-food') ui.studioResourceStock.value = 300;
    else if (tool === 'resource-wood') ui.studioResourceStock.value = 500;
  }
  syncEditorResourceControls();
  const hint = ui.mapStudio.querySelector('.studio-grid-footer span:last-child');
  if (hint) hint.textContent = tool.startsWith('ground:')
    ? `DRAG TO BRUSH ${tool.slice(7).replace('-', ' ').toUpperCase()}` : hints[tool] || '';
}

function resizeEditorMap() {
  if (!editorDefinition) return;
  if (!saveSelectedEditorResourceStock()) return;
  const width = Number(ui.studioWidth.value);
  const height = Number(ui.studioHeight.value);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16
    || width > 256 || height > 256) {
    ui.studioWidth.value = editorDefinition.width;
    ui.studioHeight.value = editorDefinition.height;
    ui.studioMessage.textContent = 'Map dimensions must be between 16 and 256 cells.';
    return;
  }
  const oldWidth = editorDefinition.width;
  const oldHeight = editorDefinition.height;
  if (width === oldWidth && height === oldHeight) return;
  const resizedSpawns = resizeWorldMarkers(editorDefinition.spawnPoints, oldWidth, oldHeight, width, height);
  const resizedResources = resizeWorldMarkers(editorResourceNodes, oldWidth, oldHeight, width, height);
  const resized = new Int8Array(width * height);
  resized.fill(-1);
  const resizedGround = new Int8Array(width * height);
  resizedGround.fill(-1);
  const resizedElevations = new Float64Array(width * height);
  resizedElevations.fill(1.12);
  for (let row = 0; row < Math.min(height, oldHeight); row++) {
    for (let column = 0; column < Math.min(width, oldWidth); column++) {
      resized[row * width + column] = editorCellMaterials[row * oldWidth + column];
      resizedGround[row * width + column] = editorGroundMaterials[row * oldWidth + column];
      resizedElevations[row * width + column] = editorCellElevations[row * oldWidth + column];
    }
  }
  editorCellMaterials = resized;
  editorGroundMaterials = resizedGround;
  editorCellElevations = resizedElevations;
  editorDefinition.width = width;
  editorDefinition.height = height;
  editorDefinition.spawnPoints = resizedSpawns.markers;
  let clippedZones = 0;
  for (const trigger of editorTriggers) {
    if (trigger.zone.column + trigger.zone.width > width
      || trigger.zone.row + trigger.zone.height > height) clippedZones++;
    trigger.zone.column = Math.min(width - 1, trigger.zone.column);
    trigger.zone.row = Math.min(height - 1, trigger.zone.row);
    trigger.zone.width = Math.max(1, Math.min(trigger.zone.width, width - trigger.zone.column));
    trigger.zone.height = Math.max(1, Math.min(trigger.zone.height, height - trigger.zone.row));
  }
  editorResourceNodes = resizedResources.markers;
  if (!getSelectedEditorResourceNode()) selectedEditorResourceId = null;
  syncEditorResourceControls();
  ui.studioGridSize.textContent = `${width} × ${height} CELLS`;
  const clippedMarkers = resizedSpawns.clippedCount + resizedResources.clippedCount;
  const markerNotice = clippedMarkers > 0
    ? ` ${clippedMarkers} spawn/resource marker${clippedMarkers === 1 ? '' : 's'} cropped by resize and moved to the nearest edge; review placement.`
    : '';
  const zoneNotice = clippedZones > 0
    ? ` ${clippedZones} capture zone${clippedZones === 1 ? '' : 's'} clipped; review objectives.`
    : '';
  ui.studioMessage.textContent = `Grid resized. Terrain outside the new edges was clipped.${zoneNotice}${markerNotice}`;
  drawEditorGrid();
}

function editorCellFromPointer(event) {
  if (!editorDefinition) return null;
  const rect = ui.studioGrid.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    column: Math.max(0, Math.min(editorDefinition.width - 1,
      Math.floor((event.clientX - rect.left) / rect.width * editorDefinition.width))),
    row: Math.max(0, Math.min(editorDefinition.height - 1,
      Math.floor((event.clientY - rect.top) / rect.height * editorDefinition.height))),
  };
}

function editorDragRect(drag) {
  const column = Math.min(drag.start.column, drag.current.column);
  const row = Math.min(drag.start.row, drag.current.row);
  return {
    column, row,
    width: Math.abs(drag.current.column - drag.start.column) + 1,
    height: Math.abs(drag.current.row - drag.start.row) + 1,
  };
}

function paintEditorGroundStroke(drag, next) {
  const from = drag.current;
  const steps = Math.max(Math.abs(next.column - from.column), Math.abs(next.row - from.row));
  const radius = (Number(ui.studioGroundBrushSize.value) - 1) / 2;
  const limit = (radius + 0.2) ** 2;
  for (let step = 0; step <= steps; step++) {
    const column = Math.round(from.column + (next.column - from.column) * step / Math.max(1, steps));
    const row = Math.round(from.row + (next.row - from.row) * step / Math.max(1, steps));
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > limit) continue;
        const paintedColumn = column + dx;
        const paintedRow = row + dy;
        if (paintedColumn < 0 || paintedRow < 0
          || paintedColumn >= editorDefinition.width || paintedRow >= editorDefinition.height) continue;
        drag.paintCells.add(paintedRow * editorDefinition.width + paintedColumn);
      }
    }
  }
}

function drawEditorGrid() {
  if (!editorDefinition) return;
  const canvas = ui.studioGrid;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(rect.width * pixelRatio);
  const pixelHeight = Math.round(rect.height * pixelRatio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext('2d');
  const scaleX = canvas.width / editorDefinition.width;
  const scaleY = canvas.height / editorDefinition.height;
  context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  context.fillStyle = TERRAIN_COLORS[ui.studioTerrainBase.value] || TERRAIN_COLORS.meadow;
  context.fillRect(0, 0, editorDefinition.width, editorDefinition.height);
  for (let row = 0; row < editorDefinition.height; row++) {
    for (let column = 0; column < editorDefinition.width; column++) {
      const index = row * editorDefinition.width + column;
      const ground = editorGroundMaterials[index];
      if (ground >= 0) {
        context.fillStyle = TERRAIN_COLORS[TERRAIN_MATERIALS[ground]];
        context.fillRect(column, row, 1, 1);
      }
      const material = editorCellMaterials[index];
      if (material < 0) continue;
      context.fillStyle = EDITOR_MATERIAL_COLORS[material] || EDITOR_MATERIAL_COLORS[0];
      context.fillRect(column, row, 1, 1);
      context.fillStyle = 'rgba(230,238,210,.11)';
      context.fillRect(column + 0.06, row + 0.06, 0.88, 0.08);
    }
  }
  for (let column = 0; column <= editorDefinition.width; column += editorDefinition.width > 128 ? 8 : 1) {
    context.beginPath();
    context.strokeStyle = column % 8 === 0 ? 'rgba(226,237,211,.32)' : 'rgba(226,237,211,.11)';
    context.lineWidth = column % 8 === 0 ? 0.07 : 0.025;
    context.moveTo(column, 0);
    context.lineTo(column, editorDefinition.height);
    context.stroke();
  }
  for (let row = 0; row <= editorDefinition.height; row += editorDefinition.height > 128 ? 8 : 1) {
    context.beginPath();
    context.strokeStyle = row % 8 === 0 ? 'rgba(226,237,211,.32)' : 'rgba(226,237,211,.11)';
    context.lineWidth = row % 8 === 0 ? 0.07 : 0.025;
    context.moveTo(0, row);
    context.lineTo(editorDefinition.width, row);
    context.stroke();
  }
  for (const [index, trigger] of editorTriggers.entries()) {
    const zone = trigger.zone;
    const isSelected = trigger.id === selectedEditorTriggerId;
    context.fillStyle = isSelected ? 'rgba(213,239,120,.24)' : 'rgba(213,239,120,.08)';
    context.fillRect(zone.column, zone.row, zone.width, zone.height);
    context.strokeStyle = isSelected ? 'rgba(213,239,120,.98)' : 'rgba(213,239,120,.5)';
    context.lineWidth = isSelected ? 0.16 : 0.08;
    context.strokeRect(zone.column + 0.08, zone.row + 0.08, zone.width - 0.16, zone.height - 0.16);
    context.fillStyle = isSelected ? '#d5ef78' : 'rgba(231,239,213,.76)';
    context.font = '0.72px monospace';
    context.textBaseline = 'middle';
    context.fillText(String(index + 1), zone.column + 0.22, zone.row + 0.5);
  }
  for (const node of editorResourceNodes) {
    const x = node.x + editorDefinition.width / 2;
    const y = node.z + editorDefinition.height / 2;
    context.beginPath();
    context.fillStyle = node.type === 'wood' ? '#9bb877' : '#e4bd63';
    context.strokeStyle = 'rgba(16,24,17,.9)';
    context.lineWidth = 0.14;
    context.arc(x, y, 0.58, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (node.type === 'wood') {
      context.fillStyle = '#35583b';
      context.fillRect(x - 0.16, y - 0.1, 0.32, 0.36);
      context.fillStyle = '#55794d';
      context.beginPath();
      context.moveTo(x, y - 0.52);
      context.lineTo(x - 0.34, y + 0.07);
      context.lineTo(x + 0.34, y + 0.07);
      context.closePath();
      context.fill();
    } else {
      context.fillStyle = '#713c50';
      context.beginPath();
      context.arc(x, y, 0.18, 0, Math.PI * 2);
      context.fill();
    }
    if (node.id === selectedEditorResourceId) {
      context.beginPath();
      context.strokeStyle = '#d5ef78';
      context.lineWidth = 0.1;
      context.arc(x, y, 0.82, 0, Math.PI * 2);
      context.stroke();
    }
  }
  for (const spawn of editorDefinition.spawnPoints) {
    const x = spawn.x + editorDefinition.width / 2;
    const y = spawn.z + editorDefinition.height / 2;
    context.beginPath();
    context.fillStyle = spawn.team === 0 ? '#73b8e8' : '#ef886c';
    context.strokeStyle = 'rgba(16,24,17,.9)';
    context.lineWidth = 0.13;
    context.arc(x, y, 0.55, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  if (editorDrag && isGroundEditorTool(editorDrag.tool)) {
    const material = editorDrag.tool === 'ground-reset' ? ui.studioTerrainBase.value : editorDrag.tool.slice(7);
    context.fillStyle = TERRAIN_COLORS[material] || TERRAIN_COLORS.meadow;
    context.globalAlpha = 0.78;
    for (const index of editorDrag.paintCells) {
      context.fillRect(index % editorDefinition.width, Math.floor(index / editorDefinition.width), 1, 1);
    }
    context.globalAlpha = 1;
  } else if (editorDrag && ['rock', 'stone', 'cliff', 'forest', 'water', 'erase', 'objective'].includes(editorDrag.tool)) {
    const zone = editorDragRect(editorDrag);
    context.fillStyle = editorDrag.tool === 'objective' ? 'rgba(213,239,120,.28)' : 'rgba(255,255,255,.19)';
    context.strokeStyle = editorDrag.tool === 'objective' ? '#d5ef78' : 'rgba(242,246,221,.9)';
    context.lineWidth = 0.14;
    context.fillRect(zone.column, zone.row, zone.width, zone.height);
    context.strokeRect(zone.column + 0.06, zone.row + 0.06, zone.width - 0.12, zone.height - 0.12);
  }
  ui.studioGridSize.textContent = `${editorDefinition.width} × ${editorDefinition.height} CELLS`;
}

function compressEditorGround() {
  const width = editorDefinition.width;
  const height = editorDefinition.height;
  const visited = new Uint8Array(width * height);
  const patches = [];
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const index = row * width + column;
      const material = editorGroundMaterials[index];
      if (material < 0 || visited[index]) continue;
      let rectangleWidth = 1;
      while (column + rectangleWidth < width
        && editorGroundMaterials[row * width + column + rectangleWidth] === material
        && !visited[row * width + column + rectangleWidth]) rectangleWidth++;
      let rectangleHeight = 1;
      while (row + rectangleHeight < height) {
        let same = true;
        for (let dx = 0; dx < rectangleWidth; dx++) {
          const next = (row + rectangleHeight) * width + column + dx;
          if (editorGroundMaterials[next] !== material || visited[next]) { same = false; break; }
        }
        if (!same) break;
        rectangleHeight++;
      }
      for (let dy = 0; dy < rectangleHeight; dy++) {
        for (let dx = 0; dx < rectangleWidth; dx++) visited[(row + dy) * width + column + dx] = 1;
      }
      patches.push({ column, row, width: rectangleWidth, height: rectangleHeight,
        material: TERRAIN_MATERIALS[material] });
    }
  }
  return patches;
}

function compressEditorObstacles() {
  const width = editorDefinition.width;
  const height = editorDefinition.height;
  const visited = new Uint8Array(width * height);
  const obstacles = [];
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const index = row * width + column;
      const material = editorCellMaterials[index];
      if (material < 0 || visited[index]) continue;
      const elevation = editorCellElevations[index];
      let rectangleWidth = 1;
      while (column + rectangleWidth < width) {
        const next = row * width + column + rectangleWidth;
        if (editorCellMaterials[next] !== material || editorCellElevations[next] !== elevation || visited[next]) break;
        rectangleWidth++;
      }
      let rectangleHeight = 1;
      while (row + rectangleHeight < height) {
        let sameMaterial = true;
        for (let dx = 0; dx < rectangleWidth; dx++) {
          const next = (row + rectangleHeight) * width + column + dx;
          if (editorCellMaterials[next] !== material || editorCellElevations[next] !== elevation || visited[next]) {
            sameMaterial = false;
            break;
          }
        }
        if (!sameMaterial) break;
        rectangleHeight++;
      }
      for (let dy = 0; dy < rectangleHeight; dy++) {
        for (let dx = 0; dx < rectangleWidth; dx++) visited[(row + dy) * width + column + dx] = 1;
      }
      const obstacle = {
        column, row, width: rectangleWidth, height: rectangleHeight,
        material: EDITOR_MATERIALS[material],
      };
      if (elevation !== 1.12) obstacle.elevation = elevation;
      obstacles.push(obstacle);
    }
  }
  return obstacles;
}

function collectEditorMap() {
  if (!editorDefinition) return null;
  saveSelectedEditorTriggerFields();
  saveEditorTimedVictoryFields();
  saveEditorVictoryHoldFields();
  saveEditorStartingResourcesFields();
  saveEditorMatchOpeningFields();
  saveSelectedEditorScenarioEventFields();
  if (!saveSelectedEditorResourceStock()) throw new Error('Resource node stock must be a positive number.');
  if (editorTriggerCreationPending) throw new Error('Finish placing the new capture zone before exporting or publishing.');
  const id = ui.studioId.value.trim();
  const name = ui.studioName.value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 48) {
    throw new Error('Map ID must use lowercase letters, numbers, and hyphens.');
  }
    if (!name || name.length > 48) throw new Error('Map name must be between 1 and 48 characters.');
  const obstacles = compressEditorObstacles();
  if (obstacles.length > 4096) throw new Error('This map has too many separate terrain blocks.');
  const terrainPatches = compressEditorGround();
  if (terrainPatches.length > 4096) throw new Error('This map has too many separate ground paint patches.');
  const triggers = JSON.parse(JSON.stringify(editorTriggers));
  const scenarioEvents = JSON.parse(JSON.stringify(editorScenarioEvents));
  return validateImportedMap({
    ...editorDefinition,
    id, name, victoryMode: ui.studioVictoryMode.value,
    ...(Number(ui.studioVictoryHoldSeconds.value) > 0
      ? { victoryHoldSeconds: Number(ui.studioVictoryHoldSeconds.value) }
      : {}),
    fogOfWar: ui.studioFogOfWar.checked,
    terrainBase: ui.studioTerrainBase.value,
    terrainPatches,
    summary: ui.studioSummary.value.trim() || `${editorDefinition.width} × ${editorDefinition.height} · CUSTOM MAP`,
    obstacles,
    resourceNodes: JSON.parse(JSON.stringify(editorResourceNodes)),
    triggers,
    scenarioEvents,
  });
}

function downloadEditorMap() {
  try {
    const definition = collectEditorMap();
    if (!definition) return;
    const blob = new Blob([`${JSON.stringify(definition, null, 2)}\n`], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `${definition.id}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    ui.studioMessage.textContent = `Downloaded ${definition.id}.json · add it to custom-maps/ and restart to load it.`;
  } catch (error) {
    ui.studioMessage.textContent = error.message;
  }
}

function showToast(message, duration = 1300) {
  if (isLocalRejection(message)) audio.play('reject');
  const fieldFeedback = document.querySelector('#field-order-feedback');
  if (fieldFeedback && !fieldFeedback.hidden && fieldFeedback.textContent === message) return;
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), duration);
}

function setOrderStatus(message, state = 'ready') {
  if (!ui.orderStatus) return;
  ui.orderStatus.textContent = message;
  ui.orderStatus.dataset.state = state;
  const fieldFeedback = document.querySelector('#field-order-feedback');
  const fieldHint = document.querySelector('.field-hint');
  window.clearTimeout(fieldOrderFeedbackTimer);
  if (!fieldFeedback || !fieldHint) return;
  const tabbedDock = window.matchMedia('(max-width: 920px)').matches;
  ui.orderStatus.setAttribute('aria-live', tabbedDock ? 'off' : 'polite');
  fieldFeedback.setAttribute('aria-live', tabbedDock ? 'polite' : 'off');
  if (state === 'ready') {
    fieldFeedback.hidden = true;
    fieldHint.hidden = false;
    return;
  }
  toast.classList.remove('visible');
  fieldFeedback.textContent = message;
  fieldFeedback.dataset.state = state;
  fieldFeedback.hidden = false;
  fieldHint.hidden = true;
  if (state === 'pending' || state === 'planning') return;
  fieldOrderFeedbackTimer = window.setTimeout(() => {
    fieldFeedback.hidden = true;
    fieldHint.hidden = false;
  }, state === 'failed' ? 6500 : 4500);
}

function armOrderStatusTimeout(token, timeoutMs = 20_000) {
  window.clearTimeout(orderStatusTimeout);
  orderStatusTimeout = window.setTimeout(() => {
    if (currentOrderToken !== token) return;
    setOrderStatus('SERVER DID NOT CONFIRM · STATUS UNKNOWN', 'failed');
  }, timeoutMs);
}

function beginOrderStatus(label, count, unitName = 'UNITS') {
  const token = nextClientOrderToken++;
  currentOrderToken = token;
  setOrderStatus(`SENDING ${label} · ${count.toLocaleString()} ${unitName}`, 'pending');
  armOrderStatusTimeout(token);
  return token;
}

function finishOrderStatus(token, message, state) {
  if (token !== currentOrderToken) return;
  window.clearTimeout(orderStatusTimeout);
  orderStatusTimeout = null;
  setOrderStatus(message, state);
}

function applyOrderNotice(token, message) {
  if (!Number.isSafeInteger(token) || token !== currentOrderToken) return false;
  if (message.startsWith('PLANNING ')) {
    setOrderStatus(message, 'planning');
    armOrderStatusTimeout(token, 90_000);
    return true;
  }
  if (message.includes('FAILED') || message.includes('REJECTED')
    || message.includes('UNAVAILABLE') || message.includes('UNREACHABLE')
    || message.includes('RESOURCE NODE EMPTY') || message.includes('NO REACHABLE WORKERS')
    || message.includes('SUPERSEDED') || message.includes('CANCELLED') || message.includes('MATCH OVER')) {
    finishOrderStatus(token, message, 'failed');
    return true;
  }
  if (/^(MOVE ORDER|ATTACK MOVE ORDER|WAYPOINT ORDER|ATTACK ORDER|ATTACK BUILDING ORDER|GATHER ORDER|BUILD ORDER|BUILD RESUME ORDER) · /.test(message)
    || message.startsWith('WAYPOINT QUEUED · ')) {
    finishOrderStatus(token, message, 'applied');
    return true;
  }
  return true;
}

function sendTrackedOrder(command, label, count, unitName = 'UNITS') {
  const token = beginOrderStatus(label, count, unitName);
  if (sendCommand({ ...command, clientOrderToken: token })) {
    audio.play(command.type === 'build' ? 'build'
      : command.type === 'gather' ? 'gather'
        : command.type === 'attack' || command.type === 'attackBuilding' || command.type === 'attackMove'
          ? 'attack' : 'move');
    return token;
  }
  finishOrderStatus(token, 'ORDER NOT SENT · CONNECTION OFFLINE', 'failed');
  return null;
}

function sendCommand(command) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    showToast('SERVER CONNECTION IS OFFLINE');
    audio.play('reject');
    return false;
  }
  const payload = { ...command };
  if (Array.isArray(command.ids)) {
    payload.unitGenerations = command.ids.map((id) => units[Number(id)]?.generation ?? -1);
  }
  if (Number.isInteger(command.targetId)) {
    payload.targetGeneration = units[command.targetId]?.generation ?? -1;
  }
  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).byteLength > 900_000) {
    const message = 'Map JSON is too large to send safely. Keep the published map under 900 KB.';
    if (command.type === 'publishMap') ui.studioMessage.textContent = message;
    showToast('COMMAND TOO LARGE TO SEND');
    audio.play('reject');
    return false;
  }
  socket.send(serialized);
  return true;
}

function projectUnit(unit, rect) {
  screenPoint.set(unit.renderX, 0.65, unit.renderZ).project(camera);
  return {
    x: (screenPoint.x * 0.5 + 0.5) * rect.width,
    y: (-screenPoint.y * 0.5 + 0.5) * rect.height,
    depth: screenPoint.z,
  };
}

function pickAt(x, y, predicate) {
  const rect = renderer.domElement.getBoundingClientRect();
  const candidates = [];
  for (const unit of units) {
    if (!unit || unit.visible === false || unit.hp <= 0 || !predicate(unit)) continue;
    const point = projectUnit(unit, rect);
    if (point.x < 0 || point.x > rect.width || point.y < 0 || point.y > rect.height
      || point.depth < -1 || point.depth > 1) continue;
    const dx = point.x - x;
    const dy = point.y - y;
    const distance = dx * dx + dy * dy;
    if (distance < 19 * 19) candidates.push({ id: unit.id, distanceSquared: distance, depth: point.depth });
  }
  const pick = chooseUnitPickCandidate(candidates, lastUnitPickState, x, y, performance.now());
  lastUnitPickState = pick.state;
  return {
    ...pick,
    unit: pick.id === null ? null : units[pick.id],
  };
}

function pickResourceNodeAt(x, y) {
  if (localTeam === null || !Array.isArray(mapDefinition?.resourceNodes)) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  let nearest = null;
  let nearestDistance = 26 * 26;
  for (const node of mapDefinition.resourceNodes) {
    screenPoint.set(node.x, 0.22, node.z).project(camera);
    const nodeX = (screenPoint.x * 0.5 + 0.5) * rect.width;
    const nodeY = (-screenPoint.y * 0.5 + 0.5) * rect.height;
    const dx = nodeX - x;
    const dy = nodeY - y;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = node;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function pickBuildingAt(x, y, predicate = (building) => building.team === localTeam) {
  if (localTeam === null) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
  camera.updateMatrixWorld(true);
  raycaster.setFromCamera(pointerNdc, camera);
  let nearest = null;
  let nearestDistance = Infinity;
  for (const building of latestBuildings) {
    if (!predicate(building)) continue;
    const visual = buildingVisuals.get(building.id);
    if (!visual?.group.visible) continue;
    visual.group.updateWorldMatrix(true, true);
    const hit = raycaster.intersectObject(visual.group, true)[0];
    if (hit && hit.distance < nearestDistance) {
      nearest = building;
      nearestDistance = hit.distance;
    }
  }
  return nearest;
}

function selectBuilding(building) {
  selected.clear();
  clearActiveControlGroup();
  selectedBuildingId = building.id;
  lastFriendlyUnitClick = null;
  lastUnitPickState = null;
  selectionDirty = true;
  syncSelectionMesh();
  updateSelectionUI();
  for (const [id, visual] of buildingVisuals) updateBuildingSelectionVisual(visual, id === building.id);
  updateCommandUI();
  updateEconomyUI();
  showToast(`${buildingLabel(building.type)} SELECTED · ${window.matchMedia('(pointer: coarse)').matches ? 'USE SET RALLY POINT, THEN TAP GROUND' : 'RIGHT-CLICK GROUND TO SET RALLY'}`);
  audio.play('select');
}

function pickFriendly(x, y, additive = false) {
  const pick = localTeam === null ? null : pickAt(x, y, (unit) => unit.team === localTeam);
  if (!pick) lastUnitPickState = null;
  const found = pick?.unit || null;
  if (!found) {
    const building = pickBuildingAt(x, y);
    if (building) {
      selectBuilding(building);
      return;
    }
  }
  const now = performance.now();
  const doubleClick = found && isSameUnitDoubleClick(lastFriendlyUnitClick, found.id, x, y, now);
  if (!additive) selected.clear();
  if (found) {
    if (doubleClick) {
      const rect = renderer.domElement.getBoundingClientRect();
      const matchingIds = visibleLivingUnitIdsOfKind(
        teamUnits[localTeam], localTeam, found.kind, (unit) => {
          const point = projectUnit(unit, rect);
          return point.x >= 0 && point.x <= rect.width && point.y >= 0 && point.y <= rect.height;
        },
      );
      for (const id of matchingIds) selected.add(id);
      lastFriendlyUnitClick = null;
      showToast(`${found.kind.toUpperCase()} SELECTED · ${matchingIds.length.toLocaleString()} VISIBLE${additive ? ' · ADDED' : ' ON SCREEN'}`);
    } else {
      if (additive && selected.has(found.id)) selected.delete(found.id);
      else selected.add(found.id);
      lastFriendlyUnitClick = { id: found.id, x, y, at: now };
      if (pick.cycled) showToast(`STACK PICK ${pick.stackIndex}/${pick.stackCount}`);
    }
  } else {
    lastFriendlyUnitClick = null;
  }
  clearActiveControlGroup();
  selectionDirty = true;
  syncSelectionMesh();
  updateSelectionUI();
  if (found && selected.size > 0) audio.play('select');
}

function selectInRect(left, top, right, bottom, additive = false) {
  lastFriendlyUnitClick = null;
  lastUnitPickState = null;
  const rect = renderer.domElement.getBoundingClientRect();
  if (!additive) selected.clear();
  const boxSelection = selectUnitIdsInScreenRect(
    units,
    localTeam,
    { x: left, y: top },
    { x: right, y: bottom },
    (unit) => projectUnit(unit, rect),
    (unit) => Math.max(3, 0.63 * unit.scale * camera.zoom * rect.height / baseFrustum),
  );
  for (const id of boxSelection.ids) selected.add(id);
  clearActiveControlGroup();
  selectionDirty = true;
  syncSelectionMesh();
  updateSelectionUI();
  if (boxSelection.ids.length > 0) audio.play('select');
}

function worldAt(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.ray.intersectPlane(groundPlane, groundHit);
  return hit ? hit.clone() : null;
}

function mapCellToWorld(cell) {
  return {
    x: cell % MAP_WIDTH - MAP_HALF_X + 0.5,
    z: Math.floor(cell / MAP_WIDTH) - MAP_HALF_Z + 0.5,
  };
}

function selectedIds() {
  return [...selected].filter((id) => units[id]?.hp > 0 && units[id]?.team === localTeam);
}

function setAttackMoveMode(enabled, announce = true) {
  if (enabled && (localTeam === null || matchWinner >= 0)) return;
  attackMoveMode = Boolean(enabled);
  updateCommandUI();
  if (announce) showToast(attackMoveMode
    ? `ATTACK MOVE READY · ${tapOrderArmed ? 'TAP OR CLICK GROUND' : window.matchMedia('(pointer: coarse)').matches ? 'USE TARGET BATTLEFIELD, THEN TAP GROUND' : 'RIGHT-CLICK GROUND'}`
    : 'MOVE MODE READY');
}

function setTapOrderArmed(enabled, announce = true) {
  if (enabled) {
    if (localTeam === null || matchWinner >= 0) return;
    if (buildPlacementActive) { showToast('FINISH OR CANCEL BUILD PLACEMENT FIRST'); return; }
    if (selectedBuildingId === null && selectedIds().length === 0) {
      showToast('SELECT YOUR UNITS BEFORE ISSUING AN ORDER');
      return;
    }
  }
  tapOrderArmed = Boolean(enabled);
  tapOrderPointer = null;
  updateCommandUI();
  updateBuildPlacementHint();
  if (announce) showToast(tapOrderArmed
    ? selectedBuildingId !== null ? 'TAP OR CLICK GROUND TO SET RALLY' : 'TAP OR CLICK A BATTLEFIELD TARGET'
    : 'TARGETING CANCELLED');
}

function issueMove(point, queueWaypoint = false) {
  if (localTeam === null) { showToast('SPECTATORS CANNOT ISSUE COMMANDS'); return; }
  const ids = selectedIds();
  if (ids.length === 0) { showToast('SELECT YOUR UNITS BEFORE ISSUING AN ORDER'); return; }
  const attackMoveOrder = attackMoveMode;
  const type = attackMoveOrder ? 'attackMove' : 'move';
  const formation = ['line', 'column'].includes(ui.formationSelect?.value)
    ? ui.formationSelect.value : 'box';
  if (sendTrackedOrder({ type, ids, x: point.x, z: point.z, formation,
    ...(queueWaypoint ? { queue: true } : {}) },
  queueWaypoint ? 'QUEUE WAYPOINT' : attackMoveOrder ? 'ATTACK MOVE' : 'MOVE', ids.length)) {
    moveMarker.position.set(point.x, 0.045, point.z);
    moveMarker.material.color.setHex(attackMoveOrder ? 0xf0b47c : 0xe5f79a);
    moveMarker.scale.setScalar(1);
    moveMarker.material.opacity = 0.95;
    moveMarker.visible = true;
    moveMarkerAge = 0;
    if (attackMoveOrder) setAttackMoveMode(false, false);
  }
}

function issueBuildingRallyPoint(clientX, clientY) {
  const building = latestBuildings.find((row) => row.id === selectedBuildingId
    && row.team === localTeam && ['barracks', 'archery-range'].includes(row.type));
  const point = worldAt(clientX, clientY);
  if (!building || !point) return;
  if (sendCommand({ type: 'setRallyPoint', buildingId: building.id, x: point.x, z: point.z })) {
    showToast('RALLY POINT REQUEST SENT');
  }
}

function clearSelectedBuildingRally() {
  const building = latestBuildings.find((row) => row.id === selectedBuildingId
    && row.team === localTeam && ['barracks', 'archery-range'].includes(row.type));
  if (!building) return;
  if (sendCommand({ type: 'setRallyPoint', buildingId: building.id, clear: true })) {
    showToast('CLEARING PRODUCTION RALLY');
  }
}

function issueAttack(target) {
  const ids = selectedIds();
  if (localTeam === null || ids.length === 0) { showToast('SELECT YOUR UNITS BEFORE ISSUING AN ORDER'); return; }
  if (sendTrackedOrder({ type: 'attack', ids, targetId: target.id }, 'ATTACK', ids.length)) {
    setAttackMoveMode(false, false);
  }
}

function issueAttackBuilding(target) {
  const ids = selectedIds().filter((id) => units[id]?.kind !== 'worker');
  if (localTeam === null || ids.length === 0) {
    showToast('SELECT MILITARY UNITS BEFORE ATTACKING A BUILDING');
    return;
  }
  if (sendTrackedOrder({ type: 'attackBuilding', ids, buildingId: target.id }, 'ATTACK BUILDING', ids.length)) {
    setAttackMoveMode(false, false);
  }
}

function issueGather(node) {
  if (localTeam === null) { showToast('SPECTATORS CANNOT ISSUE COMMANDS'); return; }
  const workers = selectedIds().filter((id) => units[id]?.kind === 'worker');
  if (workers.length === 0) {
    showToast('SELECT WORKERS FIRST · USE THE SELECT WORKERS BUTTON');
    return;
  }
  if (sendTrackedOrder({ type: 'gather', ids: workers, nodeId: node.id }, 'GATHER', workers.length, 'WORKERS')) {
    setAttackMoveMode(false, false);
    showToast(`GATHER ${String(node.type || 'FOOD').toUpperCase()} · ${workers.length} WORKERS`);
  }
}

function issueContextOrder(clientX, clientY, queueWaypoint = false) {
  if (selectedBuildingId !== null) {
    issueBuildingRallyPoint(clientX, clientY);
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const enemyPick = localTeam === null ? null : pickAt(x, y, (unit) => unit.team !== localTeam);
  const enemy = enemyPick?.unit || null;
  if (enemy) {
    issueAttack(enemy);
    if (enemyPick.cycled && selectedIds().length > 0) {
      showToast(`ATTACK TARGET ${enemyPick.stackIndex}/${enemyPick.stackCount}`);
    }
    return;
  }
  const enemyBuilding = localTeam === null ? null
    : pickBuildingAt(x, y, (building) => building.team !== localTeam);
  if (enemyBuilding) issueAttackBuilding(enemyBuilding);
  else {
    const node = pickResourceNodeAt(x, y);
    if (node) issueGather(node);
    else {
      const point = worldAt(clientX, clientY);
      if (point) issueMove(point, queueWaypoint);
    }
  }
}

function buildPlacementAt(clientX, clientY) {
  const footprint = buildingFootprint(buildPlacementType);
  const woodCost = buildingWoodCost(buildPlacementType);
  const point = worldAt(clientX, clientY);
  if (!point) return null;
  const column = Math.floor(point.x + MAP_HALF_X);
  const row = Math.floor(point.z + MAP_HALF_Z);
  const centerColumn = Math.max(0, Math.min(MAP_WIDTH - 1, column));
  const centerRow = Math.max(0, Math.min(MAP_HEIGHT - 1, row));
  const x = centerColumn - MAP_HALF_X + 0.5;
  const z = centerRow - MAP_HALF_Z + 0.5;
  const startColumn = centerColumn - Math.floor(footprint / 2);
  const startRow = centerRow - Math.floor(footprint / 2);
  let blockedReason = '';
  if (column < 1 || column >= MAP_WIDTH - 1 || row < 1 || row >= MAP_HEIGHT - 1) blockedReason = 'TOO CLOSE TO MAP EDGE';
  else if (localTeam === null || latestWood[localTeam] < woodCost) blockedReason = `NEED ${woodCost} WOOD`;
  else if (!selectedIds().some((id) => units[id]?.kind === 'worker')) blockedReason = 'SELECT WORKERS';
  if (mapDefinition) {
    for (const obstacle of mapDefinition.obstacles || []) {
      const overlaps = startColumn < obstacle.column + obstacle.width
        && obstacle.column < startColumn + footprint
        && startRow < obstacle.row + obstacle.height
        && obstacle.row < startRow + footprint;
      if (overlaps) { blockedReason ||= 'TERRAIN BLOCKS THIS SITE'; break; }
    }
    for (const node of mapDefinition.resourceNodes || []) {
      const nodeColumn = Math.floor(node.x + MAP_HALF_X);
      const nodeRow = Math.floor(node.z + MAP_HALF_Z);
      if (nodeColumn >= startColumn && nodeColumn < startColumn + footprint
        && nodeRow >= startRow && nodeRow < startRow + footprint) blockedReason ||= 'RESOURCE IN THIS SITE';
    }
    for (const trigger of mapDefinition.triggers || []) {
      const zone = trigger.zone;
      if (zone && startColumn < zone.column + zone.width && zone.column < startColumn + footprint
        && startRow < zone.row + zone.height && zone.row < startRow + footprint) blockedReason ||= 'CAPTURE ZONE IN THIS SITE';
    }
    for (const spawn of mapDefinition.spawnPoints || []) {
      const outward = spawn.team === 0 ? -1 : 1;
      const townCenterX = THREE.MathUtils.clamp(spawn.x + outward * 3, -MAP_HALF_X + 1.5, MAP_HALF_X - 1.5);
      if (Math.abs(x - townCenterX) < 2.8 && Math.abs(z - spawn.z) < 2.8) blockedReason ||= 'TOWN CENTER TOO CLOSE';
    }
  }
  for (const team of teamUnits) {
    for (const unit of team) {
      if (unit.hp <= 0 || unit.visible === false) continue;
      const unitColumn = Math.floor(unit.serverX + MAP_HALF_X);
      const unitRow = Math.floor(unit.serverZ + MAP_HALF_Z);
      if (unitColumn >= startColumn && unitColumn < startColumn + footprint
        && unitRow >= startRow && unitRow < startRow + footprint) blockedReason ||= 'MOVE UNITS OUT OF THIS SITE';
    }
  }
  for (const building of latestBuildings) {
    const buildingColumn = Math.floor(building.x + MAP_HALF_X);
    const buildingRow = Math.floor(building.z + MAP_HALF_Z);
    if (Math.abs(centerColumn - buildingColumn) < footprint
      && Math.abs(centerRow - buildingRow) < footprint) blockedReason ||= 'ANOTHER BUILDING TOO CLOSE';
  }
  return { x, z, column: centerColumn, row: centerRow, valid: !blockedReason, blockedReason };
}

function updateBuildPlacementGhost(clientX, clientY) {
  if (!buildPlacementActive) return;
  const placement = buildPlacementAt(clientX, clientY);
  placementGhost.visible = Boolean(placement);
  if (ui.placementStatus) {
    const message = placement
      ? placement.valid ? 'CLEAR 3 × 3 SITE' : `BLOCKED · ${placement.blockedReason}`
      : 'CHOOSE A SITE ON THE BATTLEFIELD';
    const state = placement?.valid ? 'clear' : 'blocked';
    if (ui.placementStatus.textContent !== message) ui.placementStatus.textContent = message;
    if (ui.placementStatus.dataset.state !== state) ui.placementStatus.dataset.state = state;
  }
  if (!placement) return;
  placementGhost.position.set(placement.x, 0, placement.z);
  const tint = placement.valid ? 0x9cdb8a : 0xe7836d;
  for (const material of placementGhostMaterials) material.color.setHex(tint);
  const isBarracks = buildPlacementType === 'barracks';
  ghostRoof.visible = !isBarracks;
  ghostBarracksWalls.visible = isBarracks;
  for (const panel of ghostBarracksRoofPanels) panel.visible = isBarracks;
}

function updateBuildPlacementHint() {
  const activeLabel = buildingLabel(buildPlacementType);
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  if (ui.fieldHintPrimaryKey) ui.fieldHintPrimaryKey.textContent = coarsePointer ? 'TAP' : 'LMB';
  if (ui.fieldHintAction) ui.fieldHintAction.textContent = buildPlacementActive ? `PLACE ${activeLabel}`
    : tapOrderArmed ? 'ISSUE ORDER' : coarsePointer ? 'SELECT UNITS' : 'DRAG TO SELECT';
  if (ui.fieldHintSecondaryKey) ui.fieldHintSecondaryKey.textContent = buildPlacementActive
    ? coarsePointer ? 'BUILD' : 'RMB / ESC' : tapOrderArmed ? 'ESC' : coarsePointer ? 'ORDERS' : 'RMB';
  if (ui.fieldHintSecondary) ui.fieldHintSecondary.textContent = buildPlacementActive
    ? coarsePointer ? 'TAP BUTTON TO CANCEL' : 'CANCEL'
    : tapOrderArmed ? 'CANCEL TARGET' : coarsePointer ? 'TAP TARGET' : 'MOVE / ATTACK';
  if (ui.placementStatus) {
    ui.placementStatus.hidden = !buildPlacementActive;
    ui.placementStatus.textContent = buildPlacementActive ? 'CHOOSE A CLEAR 3 × 3 SITE' : '';
    ui.placementStatus.dataset.state = 'ready';
  }
  renderer.domElement.style.cursor = buildPlacementActive || tapOrderArmed ? 'crosshair' : '';
  syncTargetOrderUI();
  if (ui.buildBarracks) {
    ui.buildBarracks.classList.toggle('active', buildPlacementActive && buildPlacementType === 'barracks');
    ui.buildBarracks.setAttribute('aria-pressed', String(buildPlacementActive && buildPlacementType === 'barracks'));
  }
  if (ui.buildRange) {
    ui.buildRange.classList.toggle('active', buildPlacementActive && buildPlacementType === 'archery-range');
    ui.buildRange.setAttribute('aria-pressed', String(buildPlacementActive && buildPlacementType === 'archery-range'));
  }
}

function cancelBuildPlacement(announce = true) {
  const wasActive = buildPlacementActive;
  buildPlacementActive = false;
  buildPlacementPending = false;
  pendingBuildOrderToken = null;
  pendingBuildBaseline = new Set();
  placementGhost.visible = false;
  updateBuildPlacementHint();
  updateEconomyUI();
  if (announce && wasActive) showToast(`${buildingLabel(buildPlacementType)} PLACEMENT CANCELLED`);
}

function beginBuildPlacement(type) {
  if (localTeam === null || matchWinner >= 0) return;
  if (tapOrderArmed) setTapOrderArmed(false, false);
  const label = buildingLabel(type);
  const woodCost = buildingWoodCost(type);
  const workers = teamUnits[localTeam].filter((unit) => unit.kind === 'worker' && unit.hp > 0);
  if (workers.length === 0) { showToast(`NO LIVING WORKERS TO CONSTRUCT ${label}`); return; }
  if (latestWood[localTeam] < woodCost) {
    showToast(`${label} NEEDS ${woodCost} WOOD`);
    return;
  }
  selected.clear();
  for (const worker of workers) selected.add(worker.id);
  clearActiveControlGroup();
  selectionDirty = true;
  syncSelectionMesh();
  updateSelectionUI();
  attackMoveMode = false;
  updateCommandUI();
  buildPlacementType = type;
  buildPlacementActive = true;
  buildPlacementPending = false;
  placementGhost.visible = false;
  pendingBuildOrderToken = null;
  pendingBuildBaseline = new Set(latestBuildings.filter((building) => building.team === localTeam).map((building) => building.id));
  updateBuildPlacementHint();
  updateEconomyUI();
  showToast(window.matchMedia('(pointer: coarse)').matches
    ? `${label} SITE · TAP TO PLACE · TAP BUILD AGAIN TO CANCEL`
    : `${label} SITE · LEFT-CLICK TO PLACE · ESC TO CANCEL`, 2000);
}

function submitBuildPlacement(clientX, clientY) {
  if (!buildPlacementActive || buildPlacementPending) return;
  const placement = buildPlacementAt(clientX, clientY);
  if (!placement) { showToast('MOVE THE POINTER OVER THE BATTLEFIELD'); return; }
  if (!placement.valid) {
    showToast(`${buildingLabel(buildPlacementType)} SITE BLOCKED · ${placement.blockedReason}`);
    return;
  }
  const ids = selectedIds().filter((id) => units[id]?.kind === 'worker');
  if (ids.length === 0) { showToast(`SELECT WORKERS TO CONSTRUCT ${buildingLabel(buildPlacementType)}`); return; }
  pendingBuildBaseline = new Set(latestBuildings.filter((building) => building.team === localTeam).map((building) => building.id));
  const buildOrderToken = sendTrackedOrder({
    type: 'build', buildingType: buildPlacementType, ids, x: placement.x, z: placement.z,
  }, 'BUILD', ids.length, 'WORKERS');
  if (buildOrderToken !== null) {
    pendingBuildOrderToken = buildOrderToken;
    buildPlacementPending = true;
    updateEconomyUI();
    showToast(`${buildingLabel(buildPlacementType)} REQUEST SENT · WAITING FOR SERVER`, 1600);
  }
}

function queueWorker() {
  if (localTeam === null || matchWinner >= 0) return;
  if (latestFood[localTeam] < WORKER_FOOD_COST) {
    showToast('WORKER NEEDS ' + WORKER_FOOD_COST + ' FOOD');
    return;
  }
  const production = latestWorkerProduction[localTeam];
  if ((production?.queue || 0) >= WORKER_QUEUE_LIMIT) {
    showToast('TOWN CENTER QUEUE FULL');
    return;
  }
  sendCommand({ type: 'trainWorker' });
}

function queueInfantry() {
  if (localTeam === null || matchWinner >= 0) return;
  const building = findTrainableBarracks(localTeam);
  if (!building) {
    showToast('COMPLETE A BARRACKS WITH AN OPEN QUEUE SLOT');
    return;
  }
  if (latestFood[localTeam] < INFANTRY_FOOD_COST) {
    showToast(`INFANTRY NEEDS ${INFANTRY_FOOD_COST} FOOD`);
    return;
  }
  if (getBuildingQueueLength(building) >= BARRACKS_QUEUE_LIMIT) {
    showToast('BARRACKS QUEUE FULL');
    return;
  }
  sendCommand({ type: 'train', buildingId: building.id });
}

function queueArcher() {
  if (localTeam === null || matchWinner >= 0) return;
  const building = findTrainableArcheryRange(localTeam);
  if (!building) {
    showToast('COMPLETE AN ARCHERY RANGE WITH AN OPEN QUEUE SLOT');
    return;
  }
  if (latestFood[localTeam] < ARCHER_FOOD_COST || latestWood[localTeam] < ARCHER_WOOD_COST) {
    showToast(`ARCHER NEEDS ${ARCHER_FOOD_COST} FOOD + ${ARCHER_WOOD_COST} WOOD`);
    return;
  }
  sendCommand({ type: 'trainArcher', buildingId: building.id });
}

function startSelectedAttackResearch() {
  if (localTeam === null || matchWinner >= 0) return;
  const building = latestBuildings.find((row) => row.id === selectedBuildingId
    && row.team === localTeam);
  const rules = building ? ATTACK_UPGRADE_RULES[building.type] : null;
  if (!building || !rules) {
    showToast('SELECT A FRIENDLY BARRACKS OR ARCHERY RANGE');
    return;
  }
  if (building.complete !== true) {
    showToast('COMPLETE THE BUILDING BEFORE RESEARCH');
    return;
  }
  if (latestFood[localTeam] < rules.foodCost || latestWood[localTeam] < rules.woodCost) {
    showToast(`RESEARCH NEEDS ${rules.foodCost} FOOD + ${rules.woodCost} WOOD`);
    return;
  }
  if (sendCommand({ type: 'researchUpgrade', buildingId: building.id, upgrade: rules.type })) {
    showToast(`${rules.label} REQUEST SENT`, 1600);
  }
}

function resumeConstruction() {
  if (localTeam === null || matchWinner >= 0) return;
  const building = latestBuildings.find((row) => row.team === localTeam
    && ['archery-range', 'barracks'].includes(row.type) && row.complete !== true);
  if (!building) {
    showToast('NO UNFINISHED FRIENDLY BARRACKS OR ARCHERY RANGE');
    return;
  }
  const workers = teamUnits[localTeam].filter((unit) => unit.kind === 'worker' && unit.hp > 0);
  if (workers.length === 0) {
    showToast('NO LIVING WORKERS TO RESUME CONSTRUCTION');
    return;
  }
  if (buildPlacementActive) cancelBuildPlacement(false);
  selected.clear();
  for (const worker of workers) selected.add(worker.id);
  clearActiveControlGroup();
  selectionDirty = true;
  syncSelectionMesh();
  updateSelectionUI();
  setAttackMoveMode(false, false);
  cameraTarget.set(building.x, 0, building.z);
  setCamera();
  drawMinimap(performance.now(), true);
  if (sendTrackedOrder({ type: 'build', buildingId: building.id, ids: workers.map((worker) => worker.id) },
    'RESUME BUILD', workers.length, 'WORKERS')) {
    showToast(`WORKERS SENT TO FINISH ${buildingLabel(building.type)} · ${Math.round((Number(building.progress) || 0) * 100)}%`);
  }
}

let drag = null;
let pan = null;
let spaceDown = false;
let movedPointer = false;
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
renderer.domElement.addEventListener('pointerenter', (event) => {
  edgeScrollPointer = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointerleave', () => {
  edgeScrollPointer = null;
});
renderer.domElement.addEventListener('wheel', (event) => {
  event.preventDefault();
  lastUnitPickState = null;
  zoom = THREE.MathUtils.clamp(zoom * Math.exp(-event.deltaY * 0.001), 0.48, 2.3);
  resize();
}, { passive: false });

document.addEventListener('pointerdown', (event) => {
  if (event.target !== renderer.domElement) {
    lastFriendlyUnitClick = null;
    lastUnitPickState = null;
  }
}, true);

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) {
    lastFriendlyUnitClick = null;
    if (event.button !== 2) lastUnitPickState = null;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (event.button === 2) {
    event.preventDefault();
    if (buildPlacementActive) {
      lastUnitPickState = null;
      cancelBuildPlacement();
      return;
    }
    issueContextOrder(event.clientX, event.clientY, event.shiftKey);
    if (tapOrderArmed) setTapOrderArmed(false, false);
    return;
  }
  if (event.button === 1 || (event.button === 0 && spaceDown)) {
    lastFriendlyUnitClick = null;
    lastUnitPickState = null;
    pan = { x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  if (event.button !== 0) return;
  if (buildPlacementActive) {
    lastUnitPickState = null;
    event.preventDefault();
    submitBuildPlacement(event.clientX, event.clientY);
    return;
  }
  if (tapOrderArmed) {
    event.preventDefault();
    tapOrderPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
    return;
  }
  renderer.domElement.focus({ preventScroll: true });
  drag = { startX: x, startY: y, currentX: x, currentY: y, additive: event.shiftKey };
  movedPointer = false;
  renderer.domElement.setPointerCapture(event.pointerId);
  selectionBox.style.display = 'block';
  selectionBox.dataset.mode = 'window';
  selectionBox.style.left = `${x}px`;
  selectionBox.style.top = `${y}px`;
  selectionBox.style.width = '0px';
  selectionBox.style.height = '0px';
});

renderer.domElement.addEventListener('pointermove', (event) => {
  edgeScrollPointer = { x: event.clientX, y: event.clientY };
  if (tapOrderPointer?.id === event.pointerId) return;
  if (pan) {
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    const unitsPerPixel = baseFrustum / (viewport.clientHeight * zoom);
    cameraTarget.x -= (dx - dy * 0.65) * unitsPerPixel * 0.7;
    cameraTarget.z += (dx + dy * 0.65) * unitsPerPixel * 0.7;
    pan = { x: event.clientX, y: event.clientY };
    setCamera();
    return;
  }
  if (buildPlacementActive) {
    updateBuildPlacementGhost(event.clientX, event.clientY);
    return;
  }
  if (!drag) return;
  const rect = renderer.domElement.getBoundingClientRect();
  drag.currentX = event.clientX - rect.left;
  drag.currentY = event.clientY - rect.top;
  selectionBox.dataset.mode = drag.currentX < drag.startX ? 'crossing' : 'window';
  if (Math.abs(drag.currentX - drag.startX) + Math.abs(drag.currentY - drag.startY) > 5) movedPointer = true;
  selectionBox.style.left = `${Math.min(drag.startX, drag.currentX)}px`;
  selectionBox.style.top = `${Math.min(drag.startY, drag.currentY)}px`;
  selectionBox.style.width = `${Math.abs(drag.currentX - drag.startX)}px`;
  selectionBox.style.height = `${Math.abs(drag.currentY - drag.startY)}px`;
});

function finishPointer(event) {
  if (tapOrderPointer?.id === event.pointerId) {
    const wasTap = event.type === 'pointerup'
      && Math.hypot(event.clientX - tapOrderPointer.x, event.clientY - tapOrderPointer.y) <= 12;
    tapOrderPointer = null;
    if (wasTap) {
      issueContextOrder(event.clientX, event.clientY);
      setTapOrderArmed(false, false);
    }
    return;
  }
  if (pan) { pan = null; return; }
  if (!drag) return;
  const finished = drag;
  drag = null;
  selectionBox.style.display = 'none';
  selectionBox.removeAttribute('data-mode');
  if (movedPointer) selectInRect(finished.startX, finished.startY, finished.currentX, finished.currentY, finished.additive);
  else pickFriendly(finished.startX, finished.startY, finished.additive);
}

function edgeScrollStrength(position, size) {
  if (position < CAMERA_EDGE_ZONE_PX) {
    return -1 + Math.max(0, position) / CAMERA_EDGE_ZONE_PX;
  }
  if (position > size - CAMERA_EDGE_ZONE_PX) {
    return 1 - Math.max(0, size - position) / CAMERA_EDGE_ZONE_PX;
  }
  return 0;
}
renderer.domElement.addEventListener('pointerup', finishPointer);
renderer.domElement.addEventListener('pointercancel', finishPointer);

minimapCanvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  minimapPointerId = event.pointerId;
  minimapCanvas.setPointerCapture(event.pointerId);
  focusCameraFromMinimap(event);
});
minimapCanvas.addEventListener('pointermove', (event) => {
  if (event.pointerId === minimapPointerId) focusCameraFromMinimap(event);
});
function finishMinimapPointer(event) {
  if (event.pointerId !== minimapPointerId) return;
  minimapPointerId = null;
  if (minimapCanvas.hasPointerCapture(event.pointerId)) minimapCanvas.releasePointerCapture(event.pointerId);
}
minimapCanvas.addEventListener('pointerup', finishMinimapPointer);
minimapCanvas.addEventListener('pointercancel', finishMinimapPointer);
minimapCanvas.addEventListener('keydown', (event) => {
  const steps = Math.max(MAP_WIDTH, MAP_HEIGHT) * 0.025;
  if (event.key === 'ArrowLeft') cameraTarget.x -= steps;
  else if (event.key === 'ArrowRight') cameraTarget.x += steps;
  else if (event.key === 'ArrowUp') cameraTarget.z -= steps;
  else if (event.key === 'ArrowDown') cameraTarget.z += steps;
  else return;
  event.preventDefault();
  setCamera();
  drawMinimap(performance.now(), true);
});

function selectWholeTeam() {
  if (localTeam === null) return;
  selected.clear();
  for (const unit of units) if (unit && unit.team === localTeam && unit.hp > 0) selected.add(unit.id);
  clearActiveControlGroup();
  selectionDirty = true;
  syncSelectionMesh();
  updateSelectionUI();
  if (selected.size > 0) audio.play('select');
  showToast(`YOUR ARMY SELECTED · ${selected.size.toLocaleString()}`);
}

function selectFriendlyUnitKinds(kinds, label) {
  if (localTeam === null) { showToast('SPECTATORS CANNOT ISSUE COMMANDS'); return; }
  selected.clear();
  for (const id of livingUnitIdsOfKinds(teamUnits[localTeam], localTeam, kinds)) selected.add(id);
  clearActiveControlGroup();
  selectionDirty = true;
  syncSelectionMesh();
  updateSelectionUI();
  if (selected.size > 0) audio.play('select');
  showToast(selected.size ? `${label} SELECTED · ${selected.size}` : `NO LIVING ${label}`);
}

function selectFriendlyUnitKind(kind, label) {
  selectFriendlyUnitKinds([kind], label);
}

function selectWorkers() { selectFriendlyUnitKind('worker', 'WORKERS'); }
function selectIdleWorkers() {
  if (localTeam === null) { showToast('SPECTATORS CANNOT ISSUE COMMANDS'); return; }
  selected.clear();
  for (const id of livingIdleWorkerIds(teamUnits[localTeam], localTeam)) selected.add(id);
  clearActiveControlGroup();
  selectionDirty = true;
  syncSelectionMesh();
  updateSelectionUI();
  if (selected.size > 0) audio.play('select');
  showToast(selected.size ? `IDLE WORKERS SELECTED · ${selected.size}` : 'NO IDLE WORKERS');
}
function selectInfantry() { selectFriendlyUnitKind('infantry', 'INFANTRY'); }
function selectArchers() { selectFriendlyUnitKind('archer', 'ARCHERS'); }
function selectMilitary() { selectFriendlyUnitKinds(['infantry', 'archer'], 'MILITARY'); }

const matchMenu = document.querySelector('#match-menu');
const helpPanel = document.querySelector('#help-panel');
const scenarioBriefPanel = document.querySelector('#scenario-brief-panel');
const scenarioBriefToggle = document.querySelector('#scenario-brief-toggle');
const hudScrim = document.querySelector('#hud-scrim');
const matchMenuToggle = document.querySelector('#match-menu-toggle');
const helpToggle = document.querySelector('#help-toggle');
const commandDock = document.querySelector('.control-dock');
const dockTabs = [...document.querySelectorAll('[data-dock-tab]')];

function closeHudPanels({ restoreFocus = false } = {}) {
  const trigger = !matchMenu.hidden ? matchMenuToggle : !helpPanel.hidden ? helpToggle : null;
  matchMenu.hidden = true;
  helpPanel.hidden = true;
  hudScrim.hidden = true;
  matchMenuToggle.setAttribute('aria-expanded', 'false');
  helpToggle.setAttribute('aria-expanded', 'false');
  if (restoreFocus) trigger?.focus();
}

function closeScenarioBrief({ restoreFocus = false } = {}) {
  scenarioBriefPanel.hidden = true;
  scenarioBriefToggle.setAttribute('aria-expanded', 'false');
  if (restoreFocus) scenarioBriefToggle.focus();
}

function toggleHudPanel(panel, trigger) {
  const opening = panel.hidden;
  if (tapOrderArmed) setTapOrderArmed(false, false);
  closeHudPanels();
  if (!opening) return;
  panel.hidden = false;
  hudScrim.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  panel.querySelector('.hud-panel-close')?.focus();
}

function selectDockTab(name, focus = false) {
  if (name !== 'command' && tapOrderArmed) setTapOrderArmed(false, false);
  commandDock.dataset.activePanel = name;
  for (const tab of dockTabs) {
    const selected = tab.dataset.dockTab === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (focus && selected) tab.focus();
  }
}

matchMenuToggle.addEventListener('click', () => {
  closeScenarioBrief();
  toggleHudPanel(matchMenu, matchMenuToggle);
});
helpToggle.addEventListener('click', () => {
  closeScenarioBrief();
  toggleHudPanel(helpPanel, helpToggle);
});
scenarioBriefToggle.addEventListener('click', () => {
  const opening = scenarioBriefPanel.hidden;
  if (tapOrderArmed) setTapOrderArmed(false, false);
  closeHudPanels();
  closeScenarioBrief();
  if (!opening) return;
  scenarioBriefPanel.hidden = false;
  scenarioBriefToggle.setAttribute('aria-expanded', 'true');
  document.querySelector('#scenario-brief-close').focus();
});
document.querySelector('#scenario-brief-close').addEventListener('click', () => closeScenarioBrief({ restoreFocus: true }));
document.querySelector('#match-menu-close').addEventListener('click', () => closeHudPanels({ restoreFocus: true }));
document.querySelector('#help-close').addEventListener('click', () => closeHudPanels({ restoreFocus: true }));
hudScrim.addEventListener('click', () => closeHudPanels({ restoreFocus: true }));
document.querySelector('#map-studio-open').addEventListener('click', () => closeHudPanels());
for (const tab of dockTabs) {
  tab.addEventListener('click', () => selectDockTab(tab.dataset.dockTab));
  tab.addEventListener('keydown', (event) => {
    const current = dockTabs.indexOf(tab);
    const next = event.key === 'ArrowRight' ? (current + 1) % dockTabs.length
      : event.key === 'ArrowLeft' ? (current + dockTabs.length - 1) % dockTabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? dockTabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    selectDockTab(dockTabs[next].dataset.dockTab, true);
  });
}
for (const button of document.querySelectorAll('[data-open-dock-tab]')) {
  button.addEventListener('click', () => selectDockTab(button.dataset.openDockTab, true));
}
selectDockTab('selection');
updateBuildPlacementHint();
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || (matchMenu.hidden && helpPanel.hidden && scenarioBriefPanel.hidden)
    || document.querySelector('dialog[open]')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!scenarioBriefPanel.hidden) closeScenarioBrief({ restoreFocus: true });
  else closeHudPanels({ restoreFocus: true });
}, true);

function syncAudioControls() {
  const settings = audio.getSettings();
  ui.audioEnabled.checked = settings.enabled;
  ui.audioVolume.value = String(Math.round(settings.volume * 100));
  ui.audioVolumeValue.value = `${Math.round(settings.volume * 100)}%`;
  ui.audioAmbience.checked = settings.ambience;
  ui.audioVolume.disabled = !settings.enabled;
  ui.audioAmbience.disabled = !settings.enabled;
  const status = audio.getStatus();
  ui.audioStatus.dataset.state = status;
  ui.audioStatus.textContent = {
    running: 'SOUND READY', waiting: 'SOUND STARTS WITH FIRST INPUT', muted: 'SOUND MUTED',
    unavailable: 'AUDIO UNAVAILABLE IN THIS BROWSER', suspended: 'TAP TO RESUME AUDIO',
    interrupted: 'AUDIO INTERRUPTED', closed: 'AUDIO UNAVAILABLE',
  }[status] || 'SOUND STARTS WITH FIRST INPUT';
}
syncAudioControls();
ui.audioEnabled.addEventListener('change', () => { audio.setSettings({ enabled: ui.audioEnabled.checked }); syncAudioControls(); });
ui.audioVolume.addEventListener('input', () => { audio.setSettings({ volume: Number(ui.audioVolume.value) / 100 }); syncAudioControls(); });
ui.audioAmbience.addEventListener('change', () => { audio.setSettings({ ambience: ui.audioAmbience.checked }); syncAudioControls(); });
document.addEventListener('pointerdown', () => audio.unlock(), { capture: true, once: true });
document.addEventListener('keydown', () => audio.unlock(), { capture: true, once: true });
function keyboardTargetIsEditing(event) {
  const target = event.target instanceof Element ? event.target : null;
  return !matchMenu.hidden || !helpPanel.hidden || !scenarioBriefPanel.hidden
    || Boolean(target?.closest('input, textarea, select, [contenteditable], dialog, [role="tab"]'));
}

function controlGroupIndexFromKey(event) {
  const digitCode = /^(?:Digit|Numpad)([0-9])$/.exec(event.code);
  const digit = digitCode?.[1] ?? (/^[0-9]$/.test(event.key) ? event.key : null);
  if (digit === null) return null;
  const number = Number(digit);
  return number === 0 ? 9 : number - 1;
}

window.addEventListener('keydown', (event) => {
  lastFriendlyUnitClick = null;
  lastUnitPickState = null;
  const editing = keyboardTargetIsEditing(event);
  const buttonFocused = event.target instanceof Element && Boolean(event.target.closest('button'));
  if (event.code === 'Space') {
    if (!editing && !buttonFocused) { spaceDown = true; event.preventDefault(); }
    return;
  }
  if (event.repeat || editing) return;
  const groupIndex = controlGroupIndexFromKey(event);
  if (groupIndex !== null && !event.altKey) {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
      event.preventDefault();
      assignControlGroup(groupIndex);
      return;
    }
    if (!event.ctrlKey && !event.metaKey && event.shiftKey) {
      event.preventDefault();
      assignControlGroup(groupIndex, true);
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      recallControlGroup(groupIndex);
      return;
    }
  }
  if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
    && event.key.toLowerCase() === 'm') {
    event.preventDefault();
    setAttackMoveMode(!attackMoveMode);
    return;
  }
  if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
    && event.key.toLowerCase() === 'a') selectWholeTeam();
  if (event.key === 'Escape') {
    if (tapOrderArmed) {
      setTapOrderArmed(false);
      return;
    }
    if (buildPlacementActive) {
      cancelBuildPlacement();
      return;
    }
    selected.clear();
    clearActiveControlGroup();
    selectionDirty = true;
    syncSelectionMesh();
    updateSelectionUI();
  }
});
window.addEventListener('keyup', (event) => { if (event.code === 'Space') spaceDown = false; });
window.addEventListener('blur', () => {
  if (tapOrderArmed) setTapOrderArmed(false, false);
  spaceDown = false;
  pan = null;
  edgeScrollPointer = null;
  lastControlGroupRecall = null;
  lastFriendlyUnitClick = null;
  lastUnitPickState = null;
});

for (const button of document.querySelectorAll('.size-options button')) {
  button.addEventListener('click', () => sendCommand({ type: 'selectArmySize', count: Number(button.dataset.count) }));
}
initializeRoomControls();
ui.roomCreate.addEventListener('click', createPrivateRoom);
ui.roomInvite.addEventListener('click', copyRoomInvite);
ui.roomJoin.addEventListener('click', () => {
  ui.roomDialogError.textContent = '';
  ui.roomCode.value = '';
  ui.roomDialog.showModal();
  ui.roomCode.focus();
});
document.querySelector('#room-dialog-cancel').addEventListener('click', () => ui.roomDialog.close());
ui.roomJoinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  joinPrivateRoom(ui.roomCode.value);
});
document.querySelector('#select-all').addEventListener('click', selectWholeTeam);
ui.attackMoveToggle?.addEventListener('click', () => setAttackMoveMode(!attackMoveMode));
ui.orderTargetToggle?.addEventListener('click', () => setTapOrderArmed(!tapOrderArmed));
ui.clearBuildingRally?.addEventListener('click', clearSelectedBuildingRally);
ui.researchAttackUpgrade?.addEventListener('click', startSelectedAttackResearch);
ui.selectWorkers?.addEventListener('click', selectWorkers);
ui.selectIdleWorkers?.addEventListener('click', selectIdleWorkers);
ui.selectInfantry?.addEventListener('click', selectInfantry);
ui.selectArchers?.addEventListener('click', selectArchers);
ui.selectMilitary?.addEventListener('click', selectMilitary);
ui.trainInfantry?.addEventListener('click', queueInfantry);
ui.trainWorker?.addEventListener('click', queueWorker);
ui.trainArcher?.addEventListener('click', queueArcher);
ui.resumeRange?.addEventListener('click', resumeConstruction);
ui.buildBarracks?.addEventListener('click', () => {
  if (buildPlacementActive && buildPlacementType === 'barracks') cancelBuildPlacement();
  else beginBuildPlacement('barracks');
});
ui.buildRange?.addEventListener('click', () => {
  if (buildPlacementActive && buildPlacementType === 'archery-range') cancelBuildPlacement();
  else beginBuildPlacement('archery-range');
});
for (let index = 0; index < ui.controlGroups.length; index++) {
  ui.controlGroups[index].addEventListener('click', () => recallControlGroup(index));
}
document.querySelector('#reset-army').addEventListener('click', () => sendCommand({ type: 'reset' }));
document.querySelector('#match-play-again').addEventListener('click', () => sendCommand({ type: 'reset' }));
ui.mapSelect.addEventListener('change', () => sendCommand({ type: 'selectMap', mapId: ui.mapSelect.value }));
ui.mapStudioOpen.addEventListener('click', openMapStudio);
document.querySelector('#map-studio-close').addEventListener('click', () => ui.mapStudio.close());
document.querySelector('#studio-draft-restore').addEventListener('click', () => {
  try {
    restoreMapStudioDraft(readMapStudioDraft(editorDraftStorageKey));
  } catch (error) {
    ui.studioDraftRecoveryMessage.textContent = error.message;
  }
});
document.querySelector('#studio-draft-discard').addEventListener('click', discardMapStudioDraft);
for (const eventType of ['input', 'change', 'click', 'pointerdown', 'pointerup']) {
  ui.mapStudio.addEventListener(eventType, (event) => {
    if (!editorDefinition || !ui.mapStudio.open || !(event.target instanceof Element)) return;
    if (event.target.closest('#studio-draft-recovery, #map-studio-close')) return;
    if ((eventType === 'pointerdown' || eventType === 'pointerup')
      && !event.target.closest('#studio-grid')) return;
    if (eventType === 'click' && !event.target.closest('button, input, select, textarea, canvas')) return;
    scheduleMapStudioDraftSave();
  });
}
window.addEventListener('pagehide', () => persistMapStudioDraft(true));
document.querySelector('#studio-import').addEventListener('click', () => ui.studioImportFile.click());
ui.studioImportFile.addEventListener('change', async () => {
  const file = ui.studioImportFile.files?.[0];
  ui.studioImportFile.value = '';
  if (!file) return;
  try {
    await importEditorMap(file);
  } catch (error) {
    ui.studioMessage.textContent = error.message;
  }
});
document.querySelector('#studio-width').addEventListener('change', resizeEditorMap);
document.querySelector('#studio-height').addEventListener('change', resizeEditorMap);
ui.studioGroundBrushSize.addEventListener('change', () => {
  setEditorTool(editorTool);
  scheduleMapStudioDraftSave();
});
ui.studioTerrainBase.addEventListener('change', () => {
  editorDefinition.terrainBase = ui.studioTerrainBase.value;
  drawEditorGrid();
  scheduleMapStudioDraftSave();
});
ui.studioVictoryMode.addEventListener('change', () => {
  saveSelectedEditorTriggerFields();
  editorDefinition.victoryMode = ui.studioVictoryMode.value;
  const clearedEventTriggers = reconcileEditorScenarioEventTriggers();
  syncEditorScenarioEventControls();
  ui.studioMessage.textContent = ui.studioVictoryMode.value === 'all'
    ? `The same team must hold every marked victory zone.${clearedEventTriggers
      ? ` Updated ${clearedEventTriggers} scenario event setting${clearedEventTriggers === 1 ? '' : 's'} because its linked zone can now end the match immediately.` : ''}`
    : `The first team to capture any marked victory zone wins.${clearedEventTriggers
      ? ` Updated ${clearedEventTriggers} scenario event setting${clearedEventTriggers === 1 ? '' : 's'} because victory-zone captures end the match.` : ''}`;
});
const updateVictoryHoldSetting = () => {
  saveEditorVictoryHoldFields();
  const clearedEventTriggers = reconcileEditorScenarioEventTriggers();
  syncEditorScenarioEventControls();
  if (clearedEventTriggers) {
    ui.studioMessage.textContent = `Updated ${clearedEventTriggers} scenario event setting${clearedEventTriggers === 1 ? '' : 's'} because the victory hold is disabled.`;
  }
};
ui.studioVictoryHoldSeconds.addEventListener('input', updateVictoryHoldSetting);
ui.studioVictoryHoldSeconds.addEventListener('change', updateVictoryHoldSetting);
ui.studioStartingFood.addEventListener('input', saveEditorStartingResourcesFields);
ui.studioStartingFood.addEventListener('change', saveEditorStartingResourcesFields);
ui.studioStartingWood.addEventListener('input', saveEditorStartingResourcesFields);
ui.studioStartingWood.addEventListener('change', saveEditorStartingResourcesFields);
ui.studioSummary.addEventListener('input', saveEditorMatchOpeningFields);
ui.studioStartingArmySize.addEventListener('input', saveEditorMatchOpeningFields);
ui.studioStartingArmySize.addEventListener('change', saveEditorMatchOpeningFields);
ui.studioDeadlineObjective.addEventListener('change', () => {
  ui.studioDeadlineSeconds.disabled = !ui.studioDeadlineObjective.value;
  saveEditorTimedVictoryFields();
});
ui.studioDeadlineSeconds.addEventListener('input', saveEditorTimedVictoryFields);
ui.studioDeadlineSeconds.addEventListener('change', saveEditorTimedVictoryFields);
ui.studioFogOfWar.addEventListener('change', () => {
  editorDefinition.fogOfWar = ui.studioFogOfWar.checked;
  ui.studioMessage.textContent = editorDefinition.fogOfWar
    ? 'Units reveal nearby cells; enemy forces outside shared team vision stay hidden.'
    : 'The full battlefield remains visible to both teams.';
});
document.querySelector('#studio-download').addEventListener('click', downloadEditorMap);
ui.studioAddTrigger.addEventListener('click', beginAddingEditorTrigger);
ui.studioRemoveTrigger.addEventListener('click', removeSelectedEditorTrigger);
ui.studioRemoveResource.addEventListener('click', removeSelectedEditorResourceNode);
ui.studioResourceStock.addEventListener('input', () => {
  if (saveSelectedEditorResourceStock()) drawEditorGrid();
});
ui.studioAddEvent.addEventListener('click', addEditorScenarioEvent);
ui.studioRemoveEvent.addEventListener('click', removeSelectedEditorScenarioEvent);
ui.studioEventTrigger.addEventListener('change', () => {
  if (ui.studioEventTrigger.value === 'capture' && !ui.studioEventObjective.value) {
    ui.studioEventObjective.value = eligibleEditorCaptureTriggers()[0]?.id || '';
  }
  if (ui.studioEventTrigger.value === 'event'
    && !ui.studioEventSources.querySelector('input[type="checkbox"]:checked')) {
    const firstSourceId = eligibleEditorScenarioEventSources(getSelectedEditorScenarioEvent())[0]?.id;
    const firstSource = [...ui.studioEventSources.querySelectorAll('input[type="checkbox"]')]
      .find((input) => input.value === firstSourceId);
    if (firstSource) firstSource.checked = true;
  }
  saveSelectedEditorScenarioEventFields();
  syncEditorScenarioEventControls();
});
ui.studioEventObjective.addEventListener('change', saveSelectedEditorScenarioEventFields);
ui.studioEventSources.addEventListener('change', () => {
  saveSelectedEditorScenarioEventFields();
  syncEditorScenarioEventControls();
});
ui.studioEventOccurrence.addEventListener('change', saveSelectedEditorScenarioEventFields);
ui.studioEventTechnologyReward.addEventListener('change', saveSelectedEditorScenarioEventFields);
ui.studioEventRepeatCount.addEventListener('input', () => {
  saveSelectedEditorScenarioEventFields();
  ui.studioEventRepeatEvery.disabled = Number(ui.studioEventRepeatCount.value) === 0;
});
ui.studioEventRepeatEvery.addEventListener('input', saveSelectedEditorScenarioEventFields);
ui.studioEventRepeatCount.addEventListener('change', () => {
  saveSelectedEditorScenarioEventFields();
  syncEditorScenarioEventControls();
});
ui.studioEventRepeatEvery.addEventListener('change', saveSelectedEditorScenarioEventFields);
for (const field of [ui.studioEventName, ui.studioEventAfter, ui.studioEventTeam,
  ui.studioEventFood, ui.studioEventWood, ui.studioEventUnitCount, ui.studioEventUnitKind,
  ui.studioEventMessage]) {
  field.addEventListener('input', saveSelectedEditorScenarioEventFields);
  field.addEventListener('change', saveSelectedEditorScenarioEventFields);
}
for (const field of [ui.studioObjectiveName, ui.studioObjectiveMessage, ui.studioRequiredUnits,
  ui.studioCaptureSeconds, ui.studioObjectiveFoodReward, ui.studioObjectiveWoodReward, ui.studioObjectiveUnitCount,
  ui.studioObjectiveUnitKind, ui.studioObjectiveVictory]) {
  field.addEventListener('input', () => {
    saveSelectedEditorTriggerFields();
    drawEditorGrid();
  });
}
ui.studioObjectiveRequires.addEventListener('change', () => {
  saveSelectedEditorTriggerFields();
  drawEditorGrid();
});
document.querySelector('#studio-publish').addEventListener('click', () => {
  try {
    const definition = collectEditorMap();
    if (!definition) return;
    if (sendCommand({ type: 'publishMap', map: definition, persist: true })) {
      ui.studioPublish.disabled = true;
      ui.studioMessage.textContent = 'Validating, saving to the custom map library, and syncing it to both players…';
    }
  } catch (error) {
    ui.studioMessage.textContent = error.message;
  }
});
for (const button of document.querySelectorAll('[data-map-tool]')) {
  button.addEventListener('click', () => setEditorTool(button.dataset.mapTool));
}
ui.studioGrid.addEventListener('pointerdown', (event) => {
  if (!editorDefinition || event.button !== 0) return;
  const cell = editorCellFromPointer(event);
  if (!cell) return;
  if (editorTool === 'resource-food' || editorTool === 'resource-wood') {
    const resourceType = editorTool === 'resource-wood' ? 'wood' : 'food';
    if (!saveSelectedEditorResourceStock()) return;
    const existingNode = editorResourceNodes.find((node) =>
      Math.floor(node.x + editorDefinition.width / 2) === cell.column
      && Math.floor(node.z + editorDefinition.height / 2) === cell.row);
    if (existingNode) {
      selectedEditorResourceId = existingNode.id;
      syncEditorResourceControls();
      ui.studioMessage.textContent = `Selected ${existingNode.type} node ${existingNode.id} · ${existingNode.stock} starting stock.`;
    } else {
      if (editorResourceNodes.length >= MAX_MAP_RESOURCE_NODES) {
        ui.studioMessage.textContent = `This map already has ${MAX_MAP_RESOURCE_NODES} resource nodes.`;
        return;
      }
      if (editorCellMaterials[cell.row * editorDefinition.width + cell.column] >= 0) {
        ui.studioMessage.textContent = 'Clear this terrain cell before placing a resource node.';
        return;
      }
      const baseId = `${resourceType}-${cell.column}-${cell.row}`;
      let id = baseId;
      for (let suffix = 2; editorResourceNodes.some((node) => node.id === id); suffix++) {
        id = `${baseId}-${suffix}`;
      }
      const x = cell.column - editorDefinition.width / 2 + 0.5;
      const z = cell.row - editorDefinition.height / 2 + 0.5;
      const stock = Number(ui.studioResourceStock.value);
      if (!Number.isFinite(stock) || stock <= 0) {
        ui.studioResourceStock.setAttribute('aria-invalid', 'true');
        ui.studioMessage.textContent = 'Resource node stock must be a positive number.';
        return;
      }
      ui.studioResourceStock.setAttribute('aria-invalid', 'false');
      editorResourceNodes.push({ id, type: resourceType, x, z, stock });
      selectedEditorResourceId = id;
      syncEditorResourceControls();
      ui.studioMessage.textContent = `Added ${resourceType} node at ${cell.column}, ${cell.row} with ${stock} ${resourceType}.`;
    }
    drawEditorGrid();
    event.preventDefault();
    return;
  }
  if (editorTool === 'azure' || editorTool === 'ember') {
    const team = editorTool === 'azure' ? 0 : 1;
    const spawn = editorDefinition.spawnPoints.find((point) => point.team === team);
    if (spawn) {
      spawn.x = cell.column - editorDefinition.width / 2 + 0.5;
      spawn.z = cell.row - editorDefinition.height / 2 + 0.5;
      ui.studioMessage.textContent = `${team === 0 ? 'Azure' : 'Ember'} spawn moved to ${cell.column}, ${cell.row}.`;
      drawEditorGrid();
    }
    return;
  }
  if (editorTool === 'objective' && !getSelectedEditorTrigger() && !editorTriggerCreationPending) {
    beginAddingEditorTrigger();
  }
  if (editorTool === 'objective' && !getSelectedEditorTrigger() && !editorTriggerCreationPending) return;
  editorDrag = { tool: editorTool, start: cell, current: cell };
  if (isGroundEditorTool(editorTool)) {
    editorDrag.paintCells = new Set();
    paintEditorGroundStroke(editorDrag, cell);
  }
  ui.studioGrid.setPointerCapture(event.pointerId);
  drawEditorGrid();
  event.preventDefault();
});
ui.studioGrid.addEventListener('pointermove', (event) => {
  if (!editorDrag) return;
  const next = editorCellFromPointer(event);
  if (next) {
    if (isGroundEditorTool(editorDrag.tool)) paintEditorGroundStroke(editorDrag, next);
    editorDrag.current = next;
  }
  drawEditorGrid();
});
function finishEditorPointer(event, commit) {
  if (!editorDrag) return;
  const drag = editorDrag;
  editorDrag = null;
  if (commit) {
    const next = editorCellFromPointer(event) || drag.current;
    if (isGroundEditorTool(drag.tool)) paintEditorGroundStroke(drag, next);
    drag.current = next;
    const bounds = editorDragRect(drag);
    if (drag.tool === 'objective') {
      const zone = {
        column: bounds.column, row: bounds.row, width: bounds.width, height: bounds.height,
      };
      let trigger = getSelectedEditorTrigger();
      if (editorTriggerCreationPending) {
        if (editorTriggers.length >= MAX_MAP_TRIGGERS) {
          ui.studioMessage.textContent = `A map can have at most ${MAX_MAP_TRIGGERS} capture zones.`;
          drawEditorGrid();
          return;
        }
        const prerequisiteIds = selectedEditorPrerequisiteIds();
        trigger = {
          id: uniqueEditorTriggerId(), name: ui.studioObjectiveName.value.trim() || `Capture point ${editorTriggers.length + 1}`,
          type: 'capture-zone', zone,
          requiredUnits: Number(ui.studioRequiredUnits.value) || 8,
          captureSeconds: Number(ui.studioCaptureSeconds.value) || 3.5,
          foodReward: Number(ui.studioObjectiveFoodReward.value) || 0,
          ...(Number(ui.studioObjectiveWoodReward.value) === 0
            ? {} : { woodReward: Number(ui.studioObjectiveWoodReward.value) }),
          unitCount: Number(ui.studioObjectiveUnitCount.value) || 0,
          unitKind: ui.studioObjectiveUnitKind.value || 'infantry',
          victory: ui.studioObjectiveVictory.checked,
          ...(prerequisiteIds.length === 1 ? { requires: prerequisiteIds[0] }
            : prerequisiteIds.length > 1 ? { requiresAll: prerequisiteIds } : {}),
          ...(ui.studioObjectiveMessage.value.trim() ? { message: ui.studioObjectiveMessage.value } : {}),
        };
        editorTriggers.push(trigger);
        selectedEditorTriggerId = trigger.id;
        editorTriggerCreationPending = false;
      }
      if (trigger) {
        trigger.zone = zone;
        syncEditorTriggerControls();
        ui.studioMessage.textContent = `Capture zone “${trigger.name}” set to ${bounds.width} × ${bounds.height} cells.`;
      }
    } else if (isGroundEditorTool(drag.tool)) {
      const material = drag.tool === 'ground-reset' ? -1
        : TERRAIN_MATERIALS.indexOf(drag.tool.slice(7));
      for (const index of drag.paintCells) editorGroundMaterials[index] = material;
      ui.studioMessage.textContent = material < 0 ? 'Base ground restored.'
        : `${TERRAIN_MATERIALS[material].replace('-', ' ')} ground painted.`;
    } else {
      const material = drag.tool === 'erase' ? -1
        : EDITOR_MATERIALS.indexOf(['rock', 'cliff'].includes(drag.tool) ? 'stone' : drag.tool);
      const elevation = drag.tool === 'rock' ? 0.72 : drag.tool === 'cliff' ? 2.1 : 1.12;
      for (let row = bounds.row; row < bounds.row + bounds.height; row++) {
        for (let column = bounds.column; column < bounds.column + bounds.width; column++) {
          const index = row * editorDefinition.width + column;
          editorCellMaterials[index] = material;
          editorCellElevations[index] = elevation;
        }
      }
      let removedNodes = 0;
      if (material >= 0) {
        const previousCount = editorResourceNodes.length;
        editorResourceNodes = editorResourceNodes.filter((node) => {
          const column = Math.floor(node.x + editorDefinition.width / 2);
          const row = Math.floor(node.z + editorDefinition.height / 2);
          return column < bounds.column || column >= bounds.column + bounds.width
            || row < bounds.row || row >= bounds.row + bounds.height;
        });
        removedNodes = previousCount - editorResourceNodes.length;
        if (!getSelectedEditorResourceNode()) selectedEditorResourceId = null;
        syncEditorResourceControls();
      }
      const result = drag.tool === 'erase'
        ? 'Terrain cleared.' : `${drag.tool[0].toUpperCase()}${drag.tool.slice(1)} terrain painted.`;
      ui.studioMessage.textContent = removedNodes
        ? `${result} Removed ${removedNodes} resource node${removedNodes === 1 ? '' : 's'} on painted terrain.`
        : result;
    }
  }
  drawEditorGrid();
}
ui.studioGrid.addEventListener('pointerup', (event) => finishEditorPointer(event, true));
ui.studioGrid.addEventListener('pointercancel', (event) => finishEditorPointer(event, false));
ui.mapStudio.addEventListener('close', () => {
  window.clearTimeout(editorDraftWriteTimer);
  editorDraftWriteTimer = 0;
  persistMapStudioDraft(true);
  editorDrag = null;
  ui.studioPublish.disabled = false;
  editorDefinition = null;
  editorDraftSourceMapId = null;
  editorDraftStorageKey = null;
  editorDraftDirty = false;
  setMapStudioDraftRecoveryPrompt(false);
});
window.addEventListener('resize', () => {
  if (ui.mapStudio.open) drawEditorGrid();
});

async function initializeRoomControls() {
  try {
    const response = await fetch('/api/rooms/status', { cache: 'no-store' });
    if (!response.ok) return;
    const status = await response.json();
    if (status.enabled !== true) return;
    ui.roomCreate.hidden = false;
    ui.roomJoin.hidden = false;
    ui.roomInvite.hidden = !HAS_ROOM_PARAMETER || !ROOM_ID_PATTERN.test(ROOM_ID || '');
  } catch {}
}

async function createPrivateRoom() {
  ui.roomCreate.disabled = true;
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !ROOM_ID_PATTERN.test(result.roomId || '')) {
      throw new Error(result.error || 'Room creation failed.');
    }
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set('room', result.roomId);
    window.location.assign(inviteUrl.href);
  } catch (error) {
    showToast(String(error?.message || 'ROOM CREATION FAILED').toUpperCase(), 2800);
  } finally {
    ui.roomCreate.disabled = false;
  }
}

async function copyRoomInvite() {
  if (!ROOM_ID_PATTERN.test(ROOM_ID || '')) return;
  const inviteUrl = new URL(window.location.href);
  inviteUrl.searchParams.set('room', ROOM_ID);
  inviteUrl.hash = '';
  try {
    await navigator.clipboard.writeText(inviteUrl.href);
    showToast('ROOM INVITE COPIED', 1800);
  } catch {
    window.prompt('Copy this room invite link:', inviteUrl.href);
  }
}

function joinPrivateRoom(value) {
  const input = String(value || '').trim();
  let roomId = input;
  if (/[/?#]/.test(input)) {
    try {
      const inviteUrl = new URL(input, window.location.origin);
      if (inviteUrl.origin !== window.location.origin) {
        ui.roomDialogError.textContent = 'Use an invite from this game server.';
        return;
      }
      roomId = inviteUrl.searchParams.get('room') || '';
    } catch {
      roomId = '';
    }
  }
  if (!ROOM_ID_PATTERN.test(roomId)) {
    ui.roomDialogError.textContent = 'Enter a valid room code or invite link.';
    return;
  }
  const inviteUrl = new URL(window.location.href);
  inviteUrl.searchParams.set('room', roomId);
  window.location.assign(inviteUrl.href);
}

function scheduleReconnect(delay = reconnectDelayMs, increaseBackoff = true) {
  if (pageLeaving || reconnectTimer !== null) return;
  setConnection('RECONNECTING');
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
  if (increaseBackoff) reconnectDelayMs = Math.min(8000, Math.round(reconnectDelayMs * 1.8));
}

async function connect() {
  if (pageLeaving) return;
  setConnection(localTeam === null ? 'CONNECTING' : 'RECONNECTING');
  if (HAS_ROOM_PARAMETER) {
    if (!ROOM_ID_PATTERN.test(ROOM_ID || '')) {
      setConnection('INVALID ROOM LINK');
      showToast('ROOM CODE IS INVALID', 2800);
      return;
    }
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(ROOM_ID)}`, { cache: 'no-store' });
      if (pageLeaving) return;
      if (response.status === 404) {
        setConnection('ROOM NOT FOUND');
        showToast('INVITE LINK EXPIRED OR INVALID', 2800);
        return;
      }
      if (!response.ok) throw new Error('Room service is temporarily unavailable.');
    } catch {
      scheduleReconnect();
      return;
    }
  }
  connectSocket();
}

function connectSocket() {
  if (pageLeaving) return;
  setConnection(localTeam === null ? 'CONNECTING' : 'RECONNECTING');
  let retryWhenSeatFree = false;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${protocol}//${location.host}/ws`);
  if (HAS_ROOM_PARAMETER) url.searchParams.set('room', ROOM_ID);
  let savedToken = null;
  try { savedToken = sessionStorage.getItem(ROOM_SESSION_STORAGE_KEY); } catch {}
  const websocketProtocols = ['rts-v1'];
  if (savedToken) websocketProtocols.push(`rts-resume.${savedToken}`);
  const connection = new WebSocket(url, websocketProtocols);
  socket = connection;
  connection.addEventListener('open', () => {
    if (localTeam === null) ui.networkStatus.textContent = 'CONNECTED · SYNCING';
  });
  connection.addEventListener('message', (event) => {
    if (socket !== connection) return;
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'welcome') {
      if (!message.map || !Array.isArray(message.map.obstacles) || !Array.isArray(message.map.triggers)
        || !Array.isArray(message.map.scenarioEvents)) {
        window.reportPrototypeError('Server did not provide a valid map definition');
        return;
      }
      const mapChanged = !mapDefinition || JSON.stringify(message.map) !== JSON.stringify(mapDefinition);
      let matchInstanceChanged = false;
      let matchIdentityChanged = false;
      if (typeof message.serverInstanceId === 'string') {
        try {
          const previousInstanceId = sessionStorage.getItem(ROOM_INSTANCE_STORAGE_KEY);
          matchInstanceChanged = Boolean(previousInstanceId && previousInstanceId !== message.serverInstanceId);
          sessionStorage.setItem(ROOM_INSTANCE_STORAGE_KEY, message.serverInstanceId);
        } catch {}
      }
      if (typeof message.matchId === 'string') {
        try {
          const previousMatchId = sessionStorage.getItem(ROOM_MATCH_STORAGE_KEY);
          matchIdentityChanged = Boolean(previousMatchId && previousMatchId !== message.matchId);
          sessionStorage.setItem(ROOM_MATCH_STORAGE_KEY, message.matchId);
        } catch {}
      }
      const matchWasReset = !message.recoveredFromCheckpoint && (matchIdentityChanged || matchInstanceChanged);
      const matchWasRestored = message.recoveredFromCheckpoint === true && matchInstanceChanged
        && !matchIdentityChanged;
      if (mapChanged) {
        mapDefinition = message.map;
        buildMap(mapDefinition);
      }
      waitingForResume = message.player.resumePending === true;
      try {
        if (message.player.sessionToken) sessionStorage.setItem(ROOM_SESSION_STORAGE_KEY, message.player.sessionToken);
        else if (!waitingForResume) sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
      } catch {}
      setPlayer(message.player);
      setMapCatalog(message.maps, message.map.id);
      if (ui.orderStatus?.textContent.startsWith('CONNECTION LOST')
        || ui.orderStatus?.textContent.startsWith('SERVER DID NOT CONFIRM')) {
        setOrderStatus('RECONNECTED · PREVIOUS ORDER STATUS UNKNOWN', 'failed');
      }
      if (mapChanged || message.state.armySize !== currentArmySize) setArmySize(message.state.armySize);
      applyState(message.state, true);
      updateRoomUI(message.state.connected);
      if (ui.mapStudio.open) {
        ui.studioPublish.disabled = false;
        ui.studioMessage.textContent = 'Connection restored. Review your draft and publish again if needed.';
      }
      reconnectDelayMs = 500;
      showToast(waitingForResume
        ? 'SEAT ACTIVE IN ANOTHER CONNECTION · SPECTATING UNTIL IT CLOSES'
        : matchWasReset
        ? 'MATCH SERVER RESTARTED · THE MATCH RESET'
        : matchWasRestored
        ? 'MATCH RESTORED · RECENT CHECKPOINT'
        : message.player.resumed
        ? `RECONNECTED AS ${TEAM_NAMES[localTeam].toUpperCase()}`
        : localTeam === null ? 'SPECTATOR · ROOM IS FULL' : `JOINED AS ${TEAM_NAMES[localTeam].toUpperCase()}`,
      matchWasReset || matchWasRestored ? 3600 : 1600);
      return;
    }
    if (message.type === 'resumeAvailable') {
      waitingForResume = false;
      retryWhenSeatFree = true;
      try { connection.close(4001, 'Player seat available'); } catch {}
      return;
    }
    if (message.type === 'mapChange') {
      mapDefinition = message.map;
      buildMap(mapDefinition);
      setMapCatalog(message.maps, mapDefinition.id);
      setArmySize(message.state.armySize);
      cameraTarget.set(0, 0, 0);
      resize();
      applyState(message.state, true);
      return;
    }
    if (message.type === 'state') { applyState(message); return; }
    if (message.type === 'waypointQueueCounts') {
      applyWaypointQueueCounts(message.rows);
      return;
    }
    if (message.type === 'room') { updateRoomUI(message.connected); return; }
    if (message.type === 'trigger') {
      audio.play(localTeam !== null && message.team !== localTeam ? 'objective-lost' : 'objective');
      showToast(message.message, 2400);
      return;
    }
    if (message.type === 'scenarioEvent') { audio.play('objective'); showToast(message.message, 3600); return; }
    if (message.type === 'victory') {
      updateMatchResult(message.team, message.triggerId, message.reason);
      showToast(message.message, 3200);
      return;
    }
    if (message.type === 'mapRejected') {
      ui.studioMessage.textContent = `Map rejected · ${message.message}`;
      ui.studioPublish.disabled = false;
      return;
    }
    if (message.type === 'mapPublished') {
      clearMapStudioDraft();
      ui.mapStudio.close();
      showToast(`${message.persisted ? 'MAP SAVED' : 'CUSTOM MAP LIVE'} · ${message.mapId.toUpperCase()}`, 2200);
      return;
    }
    if (message.type === 'notice') {
      const notice = String(message.message || '');
      const noticeToken = Number.isSafeInteger(message.clientOrderToken)
        ? message.clientOrderToken : null;
      const feedback = classifyOrderNotice({
        message: notice,
        noticeToken,
        currentOrderToken,
        pendingBuildOrderToken,
      });
      if (feedback.applyOrderStatus) applyOrderNotice(noticeToken, notice);
      if (feedback.showToast) {
        const cue = cueForNotice(notice, { localTeam, tokenized: noticeToken !== null });
        if (cue) audio.play(cue);
      }
      if (notice.startsWith('BUILD REJECTED ·')) {
        if (feedback.clearPendingBuild) {
          buildPlacementPending = false;
          pendingBuildOrderToken = null;
          updateEconomyUI();
        }
        if (feedback.showToast) showToast(notice, 2200);
        return;
      }
      if (!feedback.showToast) return;
      if (notice.startsWith('ARCHER TRAINING REJECTED ·')
        || notice.startsWith('WORKER TRAINING REJECTED ·')) {
        updateEconomyUI();
        showToast(notice, 2200);
        return;
      }
      if (notice.startsWith('RESEARCH REJECTED ·')) {
        updateEconomyUI();
        showToast(notice, 2200);
        return;
      }
      if (notice.startsWith('ARCHERY RANGE PLACED ·')) {
        showToast(notice, 1800);
        return;
      }
      showToast(notice);
    }
  });
  connection.addEventListener('close', () => {
    if (socket !== connection) return;
    socket = null;
    if (pageLeaving) return;
    const retryImmediately = retryWhenSeatFree;
    retryWhenSeatFree = false;
    if (currentOrderToken !== null && ['pending', 'planning'].includes(ui.orderStatus?.dataset.state)) {
      setOrderStatus('CONNECTION LOST · ORDER STATUS UNKNOWN', 'failed');
    }
    currentOrderToken = null;
    window.clearTimeout(orderStatusTimeout);
    orderStatusTimeout = null;
    setConnection('RECONNECTING');
    if (ui.mapStudio.open) {
      ui.studioPublish.disabled = false;
      ui.studioMessage.textContent = 'Server disconnected. Draft edits stay here until you reconnect.';
    }
    scheduleReconnect(retryImmediately ? 150 : reconnectDelayMs, !retryImmediately);
  });
  connection.addEventListener('error', () => {
    if (socket === connection) {
      try { connection.close(); } catch {}
    }
  });
}

window.addEventListener('beforeunload', () => {
  pageLeaving = true;
  if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
  reconnectTimer = null;
  socket?.close(1000, 'page unload');
}, { once: true });

resize();
updateControlGroupUI();
window.addEventListener('resize', resize);
connect();
window.markPrototypeReady();

let previousTime = performance.now();
let fpsFrames = 0;
let fpsTime = 0;
let renderStatsTime = 0;
let lastIdlePoseStep = -1;
function animate(now) {
  requestAnimationFrame(animate);
  renderScenarioEventCountdown(now);
  animateBuildingCombatFeedback(now);
  const frameDelta = Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;
  if (edgeScrollPointer && mapDefinition && document.visibilityState === 'visible'
    && !drag && !pan && !buildPlacementActive && !ui.mapStudio.open) {
    const rect = renderer.domElement.getBoundingClientRect();
    const localX = edgeScrollPointer.x - rect.left;
    const localY = edgeScrollPointer.y - rect.top;
    if (localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height) {
      let screenX = edgeScrollStrength(localX, rect.width);
      let screenY = edgeScrollStrength(localY, rect.height);
      const directionLength = Math.hypot(screenX, screenY);
      if (directionLength > 0) {
        if (directionLength > 1) {
          screenX /= directionLength;
          screenY /= directionLength;
        }
        const pixels = CAMERA_EDGE_SPEED_PX_PER_SECOND * frameDelta;
        const dx = -screenX * pixels;
        const dy = -screenY * pixels;
        const unitsPerPixel = baseFrustum / (Math.max(1, viewport.clientHeight) * zoom);
        cameraTarget.x -= (dx - dy * 0.65) * unitsPerPixel * 0.7;
        cameraTarget.z += (dx + dy * 0.65) * unitsPerPixel * 0.7;
        setCamera();
      }
    }
  }
  const alpha = 1 - Math.exp(-frameDelta * 16);
  const idlePoseStep = Math.floor(now / IDLE_POSE_INTERVAL_MS);
  const idlePoseDue = idlePoseStep !== lastIdlePoseStep;
  lastIdlePoseStep = idlePoseStep;
  let moved = false;
  let artAnimated = false;
  for (const unit of units) {
    if (!unit || unit.visible === false) continue;
    if (unit.damageFlashUntil > 0 && now >= unit.damageFlashUntil) {
      unit.damageFlashUntil = 0;
      setUnitTint(unit);
    }
    const dx = unit.serverX - unit.renderX;
    const dz = unit.serverZ - unit.renderZ;
    const walking = Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001;
    const wasWalking = unit.walking;
    unit.walking = walking;
    if (walking) {
      unit.renderX += dx * alpha;
      unit.renderZ += dz * alpha;
      unit.targetAngle = Math.atan2(dx, dz);
      unit.motionPhase += frameDelta * 14;
      moved = true;
    }
    let turning = false;
    if (unit.targetAngle !== unit.angle) {
      const turnDelta = Math.atan2(Math.sin(unit.targetAngle - unit.angle),
        Math.cos(unit.targetAngle - unit.angle));
      turning = Math.abs(turnDelta) > 0.01;
      if (turning) unit.angle += THREE.MathUtils.clamp(turnDelta, -frameDelta * 9, frameDelta * 9);
      else unit.angle = unit.targetAngle;
    }
    const working = !walking && unit.kind === 'worker'
      && (unit.task === 'gathering' || unit.task === 'building');
    if (working) unit.motionPhase += frameDelta * (unit.task === 'building' ? 6 : 5);
    const activeAttack = unit.attackStartedAt > 0;
    const activeHit = unit.hitStartedAt > 0;
    const activeSpawn = unit.spawnStartedAt > 0;
    const activeDefeat = unit.defeatStartedAt > 0;
    if (activeAttack && now - unit.attackStartedAt >= ATTACK_POSE_MS) unit.attackStartedAt = 0;
    if (activeHit && now - unit.hitStartedAt >= HIT_POSE_MS) unit.hitStartedAt = 0;
    if (activeSpawn && now - unit.spawnStartedAt >= SPAWN_POSE_MS) unit.spawnStartedAt = 0;
    if (activeDefeat && now - unit.defeatStartedAt >= DEFEAT_POSE_MS) unit.defeatStartedAt = 0;
    const idle = idlePoseDue && unit.hp > 0 && !walking && !working;
    if (walking || wasWalking || turning || working || activeAttack || activeHit
      || activeSpawn || activeDefeat || idle) {
      updateUnitTransform(unit, now);
      artAnimated = true;
    }
  }
  if (artAnimated) {
    for (let team = 0; team < 2; team++) {
      unitArtMeshes.forEach((pair) => { pair[team].instanceMatrix.needsUpdate = true; });
    }
  }
  if (moved && selected.size) selectionDirty = true;
  if (attackFocusDirty) {
    attackFocusMesh.instanceMatrix.needsUpdate = true;
    attackFocusDirty = false;
  }
  if (selectionDirty) syncSelectionMesh();
  animateArrowEffects(now);
  if (moveMarker.visible) {
    moveMarkerAge += frameDelta;
    moveMarker.scale.setScalar(1 + moveMarkerAge * 0.85);
    moveMarker.material.opacity = Math.max(0, 0.95 - moveMarkerAge * 0.9);
    if (moveMarkerAge > 1.05) moveMarker.visible = false;
  }
  renderer.render(scene, camera);
  drawMinimap(now);
  fpsFrames++;
  fpsTime += frameDelta;
  renderStatsTime += frameDelta;
  if (fpsTime >= 0.55) {
    ui.fps.textContent = String(Math.round(fpsFrames / fpsTime));
    fpsFrames = 0;
    fpsTime = 0;
  }
  if (renderStatsTime >= 0.55) {
    ui.draws.textContent = renderer.info.render.calls.toLocaleString();
    ui.triangles.textContent = renderer.info.render.triangles.toLocaleString();
    renderStatsTime = 0;
  }
}

requestAnimationFrame(animate);
