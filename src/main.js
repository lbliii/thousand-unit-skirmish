import { regionGestureZone, ScenarioEditHistory } from './scenario-authoring.mjs';
import { validateScenarioRegions, validRegionEntryTrigger, validCompletionTrigger } from './scenario-regions.mjs';
import { TERRAIN_COLORS } from './terrain-materials.mjs';
import { researchOptions, researchAction } from './research-actions.mjs';
import { unitPresentation, buildingPresentation } from './gameplay-presentation.mjs';
import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS, TECHNOLOGY_DEFINITIONS, GAMEPLAY_RULESET_REVISION } from './gameplay-definitions.mjs';
import { formatResourceStock, formatResourceRequirement } from './resource-format.mjs';
import { SHIPPED_AUDIO_REFERENCES } from './audio-shipped-catalog.mjs';
import { validateMapAudioReference } from './audio-event-profile.mjs';
import { battlefieldCursor } from './battlefield-cursor.mjs';
import { visibleHudRects, hudSafeRect, normalizeHudPreferences } from './hud-layout.mjs';
import { objectiveSummary, rememberNotice } from './objective-summary.mjs';
import { selectionContext } from './selection-context.mjs';
import * as THREE from 'three';
import { attachBuildingSprite } from './building-sprites.mjs';
import {
  createCapturedBuildingSprite, disposeCapturedBuildingSprite,
  updateCapturedBuildingSprite,
} from './captured-building-art.mjs';
import {
  addObstacleEnvironmentSprites, createConstructionGroundInstances,
  createEnvironmentSprite, createEnvironmentSpriteInstances,
  createGroundSurfaces, environmentTheme, setEnvironmentSpriteInstance, setForestSpriteStock,
  TERRAIN_MATERIALS, updateConstructionGroundInstances,
  RESOURCE_STATE_ASSETS_AVAILABLE, RESOURCE_STATE_ASSET_STATUS, resourceStateAssetsReady,
} from './environment-art.mjs';
import {
  RESOURCE_VISUAL_STAGES, resourceVisualScale, resourceVisualStage, resourceVisualTransitionStages,
} from './resource-visual-state.mjs';
import {
  barracksModelVisualState, buildingFinishedDetailsVisible,
  buildingProductionCueState, constructionGroundStage,
} from './building-visual-state.mjs';
import {
  UNIT_LOD_ROLE_BITS, UNIT_LOD_ROLES, shouldUpdateUnitFocusMatrix,
  shouldUpdateUnitFullDetailTint, shouldUpdateUnitTransformForFrame,
  unitLodRoleMatrixUpdateMask,
} from './unit-lod-state.mjs';
import {
  unitActionPoseAllowed, unitCargoVisualState, unitWorkerActionPose,
} from './unit-visual-state.mjs';
import { createUnitSpriteRuntime } from './unit-sprite-runtime.mjs';
import {
  MAX_ELEVATION_PATCHES, buildElevationGrid, capturePrerequisiteIds,
  findInvalidCapturePrerequisite, findInvalidScenarioEventChain,
  findUnreachableCaptureZone, findUnreachableResourceNode, scenarioEventSourceIds,
  validateElevationPatches,
} from './map-utils.mjs';
import { townCenterSpawnPosition } from './town-center-spawn.mjs';
import { resizeWorldMarkers } from './map-resize.mjs';
import {
  MAX_MAP_STUDIO_ZOOM, MIN_MAP_STUDIO_ZOOM, clampMapStudioZoom,
  mapStudioCanvasSize, mapStudioCellAtPointer,
  mapStudioScrollAtPan, mapStudioScrollAtZoom,
} from './map-studio-viewport.mjs';
import { classifyOrderNotice } from './order-feedback.mjs';
import { AMBIENCE_PREVIEW_DURATION_MS, createGameAudio } from './audio.mjs';
import { CombatAudioGate, UnitLifecycleAudioGate, OrderAudioGate, workAudioEvents, cueForNotice, cueForScenarioEvent, isLocalRejection } from './audio-policy.mjs';
import {
  AUDIO_RECOGNITION_CUE_LABELS, AUDIO_RECOGNITION_UNSURE_ANSWER,
  copyAudioRecognitionText, createAudioRecognitionRound,
  summarizeAudioRecognitionResponses,
} from './audio-recognition-check.mjs';
import {
  cameraDepthSafePlanes,
  cameraPanDeltaFromScreen,
  cameraTargetForZoomAnchor,
  canEdgeScroll,
  clampCameraTargetToGroundBounds,
  edgeScrollCameraDelta,
  edgeScrollDirection,
  shouldBlockEdgeScrollForFocus,
  CAMERA_VIEW_DIRECTION,
} from './camera-controls.mjs';
import {
  cameraArrowInputAllowed, cameraTargetDeltaForScreenFocus, createCameraArrowKeys,
  getNavigationSettings, mapFitZoom, setNavigationSettings,
} from './navigation-settings.mjs';
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
const heldCameraKeys = createCameraArrowKeys();
let lastKeyboardPanTime = 0;
let cameraMinZoom = 0.48;
let mapFitActive = false;
let MAP_WIDTH = 64;
let MAP_HEIGHT = 64;
let MAP_HALF_X = MAP_WIDTH / 2;
let MAP_HALF_Z = MAP_HEIGHT / 2;
const MAX_UNITS = 2000;
const MAX_PER_TEAM = MAX_UNITS / 2;
const ATTACK_POSE_MS = 900;
const HIT_POSE_MS = 240;
const SPAWN_POSE_MS = 330;
const DEFEAT_POSE_MS = 430;
const IDLE_POSE_INTERVAL_MS = 75;
const MAX_ARROW_TRACES = 96;
const MAX_MAP_RESOURCE_NODES = 128;
const MAX_MAP_BUILDINGS = 128;
const MAX_MAP_TRIGGERS = 32;
const MAX_MAP_SCENARIO_EVENTS = 32;
const MAX_SCENARIO_EVENT_REPEATS = 20;
const MIN_SCENARIO_EVENT_REPEAT_SECONDS = 5;
const CAMERA_EDGE_ZONE_PX = 40;
const CAMERA_EDGE_SPEED_PX_PER_SECOND = 650;
// Full meshes failed the 0.91 worker-role gate; preserve role LOD in default play.
// Sprite atlas previews remain opt-in through URL flags.
const UNIT_LOD_ZOOM_THRESHOLD = 0.91;
const UNIT_SPRITE_MARKER_ZOOM_THRESHOLD = 0.6;
const MAX_OBJECTIVE_FOOD_REWARD = 10000;
const MAX_TRIGGER_UNIT_REWARD = 25;
const WORKERS_PER_TEAM = 4;
const WORKER_TASK_STATES = new Set(['idle', 'moving', 'gathering', 'returning', 'building', 'repairing', 'attacking', 'holding', 'patrolling', 'following']);
const INFANTRY_FOOD_COST = UNIT_DEFINITIONS.infantry.cost.food;
const INFANTRY_TRAIN_SECONDS = UNIT_DEFINITIONS.infantry.trainSeconds;
const WORKER_FOOD_COST = UNIT_DEFINITIONS.worker.cost.food;
const WORKER_TRAIN_SECONDS = UNIT_DEFINITIONS.worker.trainSeconds;
const WORKER_QUEUE_LIMIT = 5;
const ARCHER_FOOD_COST = UNIT_DEFINITIONS.archer.cost.food;
const ARCHER_WOOD_COST = UNIT_DEFINITIONS.archer.cost.wood;
const ARCHERY_RANGE_WOOD_COST = BUILDING_DEFINITIONS['archery-range'].cost.wood;
const ARCHERY_RANGE_QUEUE_LIMIT = 5;
const ARCHERY_RANGE_SIZE = BUILDING_DEFINITIONS['archery-range'].footprint;
const BARRACKS_WOOD_COST = BUILDING_DEFINITIONS.barracks.cost.wood;
const BARRACKS_QUEUE_LIMIT = 5;
const BARRACKS_SIZE = BUILDING_DEFINITIONS.barracks.footprint;
const TEAM_NAMES = ['Azure', 'Ember'];
const TEAM_HEX = [0x5aa7d7, 0xe67a5e];
const pausedProductionCueColor = new THREE.Color(0xa8a797);

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
let objectiveHoldSummary = null;
let noticeHistory = [];
let guidanceDismissed = false;
try { guidanceDismissed = localStorage.getItem('rts-guidance-dismissed') === 'true'; } catch {}
const objectivePanel = document.querySelector('#objective-panel');
const roomPageUrl = new URL(window.location.href);
const humanRosterPreview = roomPageUrl.searchParams.get('humanRosterPreview') === '1'
  || (!roomPageUrl.searchParams.has('humanRosterPreview')
    && !roomPageUrl.searchParams.has('castPreview')
    && !['workerSpritePreview', 'unitSpritePreview', 'meshyInfantrySpritePreview', 'humanVaeloraPreview']
      .some((key) => roomPageUrl.searchParams.get(key) === '1'));
const castPreview = roomPageUrl.searchParams.get('castPreview') !== '0'
  && !['workerSpritePreview', 'unitSpritePreview', 'meshyInfantrySpritePreview']
    .some((key) => roomPageUrl.searchParams.get(key) === '1');
const workerSpritePreview = roomPageUrl.searchParams.get('workerSpritePreview') === '1';
const unitSpritePreview = roomPageUrl.searchParams.get('unitSpritePreview') === '1';
const meshyInfantrySpritePreview = roomPageUrl.searchParams.get('meshyInfantrySpritePreview') === '1';
const unitSpritePreviewRoles = castPreview
  ? humanRosterPreview ? ['human', 'infantry', 'spearman', 'archer', 'scout', 'rider', 'siege-engine'] : (roomPageUrl.searchParams.get('humanVaeloraPreview') === '1' ? ['human'] : ['human', 'orc', 'elf', 'troll'])
  : meshyInfantrySpritePreview
  ? ['infantry']
  : unitSpritePreview
  ? ['worker', 'infantry', 'archer']
  : ['worker'];
const unitSpritePreviewVersions = castPreview
  ? humanRosterPreview ? { human: 'v3', infantry: 'v3', spearman: 'v1', archer: 'v2', scout: 'v1', rider: 'v1', 'siege-engine': 'v1' } : { human: roomPageUrl.searchParams.get('humanVaeloraPreview') === '1' ? (roomPageUrl.searchParams.get('humanAnimationPreview') === '1' ? 'v3' : 'v2') : 'v1', orc: 'v1', elf: 'v1', troll: 'v1' }
  : meshyInfantrySpritePreview
  ? { infantry: 'v2' }
  : workerSpritePreview && !unitSpritePreview ? { worker: 'v2' }
    : !unitSpritePreview ? { worker: 'v3' } : {};
const unitSpritePreviewRoleSet = new Set(castPreview ? (humanRosterPreview ? ['worker', 'infantry', 'spearman', 'archer', 'scout', 'rider', 'siege-engine'] : ['worker']) : unitSpritePreviewRoles);
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
  rosterProductionOptions: document.querySelector('#roster-production-options'),
  buildBarracks: document.querySelector('#build-barracks'),
  buildHouse: document.querySelector('#build-house'),
  rosterBuildingOptions: document.querySelector('#roster-building-options'),
  populationStatus: document.querySelector('#population-status'),
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
  researchOptions: document.querySelector('#research-options'),
  buildingLifecycleActions: document.querySelector('#building-lifecycle-actions'),
  cancelWorkerTraining: document.querySelector('#cancel-worker-training'),
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
  studioGridViewport: document.querySelector('#studio-grid-viewport'),
  studioGridPosition: document.querySelector('#studio-grid-position'),
  studioGridZoomLevel: document.querySelector('#studio-grid-zoom-level'),
  studioGridZoomIn: document.querySelector('#studio-grid-zoom-in'),
  studioGridZoomOut: document.querySelector('#studio-grid-zoom-out'),
  studioGridZoomFit: document.querySelector('#studio-grid-zoom-fit'),
  studioName: document.querySelector('#studio-name'),
  studioId: document.querySelector('#studio-id'),
  studioSummary: document.querySelector('#studio-summary'),
  studioAudioPack: document.querySelector('#studio-audio-pack'),
  studioAudioProfile: document.querySelector('#studio-audio-profile'),
  studioWidth: document.querySelector('#studio-width'),
  studioHeight: document.querySelector('#studio-height'),
  studioTerrainBase: document.querySelector('#studio-terrain-base'),
  studioGroundBrushSize: document.querySelector('#studio-ground-brush-size'),
  studioElevationBrushSize: document.querySelector('#studio-elevation-brush-size'),
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
  studioRegions: document.querySelector('#studio-regions'),
  studioEventRegionControl: document.querySelector('#studio-event-region-control'),
  studioEventRegion: document.querySelector('#studio-event-region'),
  studioEventRegionTeam: document.querySelector('#studio-event-region-team'),
  studioEventRegionKind: document.querySelector('#studio-event-region-kind'),
  studioEventRegionMinimum: document.querySelector('#studio-event-region-minimum'),
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
  audioCaptions: document.querySelector('#audio-captions'),
  audioCaption: document.querySelector('#audio-caption'),
  audioVolume: document.querySelector('#audio-volume'),
  audioVolumeValue: document.querySelector('#audio-volume-value'),
  audioEffectsLevel: document.querySelector('#audio-effects-level'),
  audioEffectsLevelValue: document.querySelector('#audio-effects-level-value'),
  audioPreviewControls: document.querySelector('#audio-preview-controls'),
  audioPreview: document.querySelector('#audio-preview'),
  audioPreviewCue: document.querySelector('#audio-preview-cue'),
  audioRecognitionStart: document.querySelector('#audio-recognition-start'),
  audioRecognitionRun: document.querySelector('#audio-recognition-run'),
  audioRecognitionCondition: document.querySelector('#audio-recognition-condition'),
  audioRecognitionProgress: document.querySelector('#audio-recognition-progress'),
  audioRecognitionPrompt: document.querySelector('#audio-recognition-prompt'),
  audioRecognitionPlay: document.querySelector('#audio-recognition-play'),
  audioRecognitionAnswers: document.querySelector('#audio-recognition-answers'),
  audioRecognitionFeedback: document.querySelector('#audio-recognition-feedback'),
  audioRecognitionNext: document.querySelector('#audio-recognition-next'),
  audioRecognitionEnd: document.querySelector('#audio-recognition-end'),
  audioRecognitionResults: document.querySelector('#audio-recognition-results'),
  audioRecognitionScore: document.querySelector('#audio-recognition-score'),
  audioRecognitionResultConditions: document.querySelector('#audio-recognition-result-conditions'),
  audioRecognitionReport: document.querySelector('#audio-recognition-report'),
  audioRecognitionCopy: document.querySelector('#audio-recognition-copy'),
  audioRecognitionCopyStatus: document.querySelector('#audio-recognition-copy-status'),
  audioAmbience: document.querySelector('#audio-ambience'),
  audioAmbiencePreview: document.querySelector('#audio-ambience-preview'),
  audioAmbienceLevel: document.querySelector('#audio-ambience-level'),
  audioAmbienceLevelValue: document.querySelector('#audio-ambience-level-value'),
  audioStatus: document.querySelector('#audio-status'),
  audioPackStatus: document.querySelector('#audio-pack-status'),
  audioVoiceLevel: document.querySelector('#audio-voice-level'),
  audioVoiceLevelValue: document.querySelector('#audio-voice-level-value'),
  audioMusicLevel: document.querySelector('#audio-music-level'),
  audioMusicLevelValue: document.querySelector('#audio-music-level-value'),
};
let ambiencePreviewPlaying = false;
let audioRecognitionActive = false;
let audioRecognitionTrialPlayed = false;
let audioRecognitionAwaitingNext = false;
let audioRecognitionCaptionState = false;
let audioRecognitionMixSettings = null;
let audioRecognitionRound = null;
let audioRecognitionLastReport = '';
const audioRecognitionAnswerButtons = [...ui.audioRecognitionAnswers.querySelectorAll('[data-audio-recognition-answer]')];
const audio = createGameAudio({
  onStatusChange: () => syncAudioControls(),
  onCueDecision: (cue) => showAudioCaption(cue),
  onProfileCaption: (caption) => showProfileAudioCaption(caption),
  onPackStatus: (message) => { ui.audioPackStatus.textContent = message; },
  onCue: (cue) => {
    ui.audioStatus.dataset.lastCue = cue;
    ui.audioStatus.dataset.cueCount = String((Number(ui.audioStatus.dataset.cueCount) || 0) + 1);
  },
});
const combatAudioGate = new CombatAudioGate();
const unitLifecycleAudioGate = new UnitLifecycleAudioGate();
const orderAudioGate = new OrderAudioGate();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x859175);
scene.fog = new THREE.Fog(0x859175, 145, 235);

const camera = new THREE.OrthographicCamera(-32, 32, 32, -32, 0.1, 300);
const cameraTarget = new THREE.Vector3(0, 0, 0);
const cameraOffset = new THREE.Vector3(...CAMERA_VIEW_DIRECTION).normalize();
const baseFrustum = 43;
const defaultCameraZoom = 0.91;
let zoom = defaultCameraZoom;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x859175, 1);
viewport.prepend(renderer.domElement);
renderer.domElement.setAttribute('aria-label', 'Online isometric battlefield. Use the arrow keys to move the camera, middle drag or Space + drag to pan, scroll to zoom toward the pointer, or push the mouse against any screen edge to scroll when edge scroll is enabled. Use Center selection, Home base, or Fit map to navigate. Click a friendly unit to select it; pause briefly, then click the same spot to cycle through stacked units. Double-click a friendly unit to select visible on-screen friendlies of its type, or hold Shift to add them. Drag left to right to select units enclosed by the box; drag right to left to select units the box crosses; hold Shift to add either selection. Press S to stop selected units or H to hold position and attack within range without pursuing. Right-click ground to move or attack-move (M), Shift plus right-click to queue a waypoint, or right-click an enemy to attack and pause briefly before clicking again to cycle stacked targets. On touch screens, select units, open Orders, choose Target battlefield, then tap a destination, enemy, or resource.');
renderer.domElement.dataset.cursorMode = 'select';
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
const unitPresentationTint = new THREE.Color();
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
const mountMeshes = [null, null];
const siegeMeshes = [null, null];
const unitArtMeshes = [siegeMeshes, mountMeshes, bodyMeshes, headMeshes, bowMeshes, shieldMeshes, spearMeshes, toolMeshes, packMeshes, quiverMeshes];
const unitLodRoleMeshes = [
  { worker: null, infantry: null, archer: null },
  { worker: null, infantry: null, archer: null },
];
const unitLodTeamMeshes = [null, null];
const unitLodMeshesByTeam = [[], []];
const unitLodDirtyRoleMasks = [0, 0];
const unitLodTeamDirty = [false, false];
let unitLowDetailActive = false;
let unitSpriteReady = false;
let unitSpritePreviewActive = false;
let unitSpriteMarkersActive = false;
const unitSpriteRuntime = createUnitSpriteRuntime({
  THREE, scene, capacity: MAX_PER_TEAM, teamHex: TEAM_HEX, cameraQuaternion: camera.quaternion,
  roles: unitSpritePreviewRoles,
  roleSpriteVersions: unitSpritePreviewVersions,
  approximateActionDirections: humanRosterPreview,
  castPreview,
  humanAppearancePreview: humanRosterPreview || roomPageUrl.searchParams.get('humanVaeloraPreview') === '1',
});
unitSpriteRuntime.ready.then((loaded) => {
  if (!loaded) return;
  unitSpriteReady = true;
  syncUnitDetailLevel();
});
const mapObjects = [];
const capturedBuildingVisuals = [];
let forestTreeSlots = new Map();
let forestStumpSlots = new Map();
let forestStumpMesh = null;
let forestStumpCount = 0;
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
let latestForestStocks = new Map();
let latestForestEpoch = null;
const resourceCalloutTextures = new Map();
const woodTreeNodeSlots = new Map();
const woodTreeNodeStages = new Map();
const woodTreeStageCounts = new Map();
const berryNodeSlots = new Map();
const berryNodeStages = new Map();
const berryStageCounts = new Map();
const constructionGroundMeshes = new Map();
const constructionGroundSignatures = new Map();
const buildingVisuals = new Map();
let woodTreeMeshes = new Map();
let lastResourceCalloutUpdateAt = -Infinity;
let berrySpriteMeshes = new Map();
let localTeam = null;
// Keep camera ownership while a reconnect temporarily waits as a spectator.
let cameraSeatTeam = null;
let isHost = false;
let currentArmySize = 1000;
let latestRosterSize = 1000;
let matchWinner = -1;
let matchWinnerReason = null;
let attackMoveMode = false;
let persistentTargetMode = null;
let tapOrderArmed = false;
let tapOrderPointer = null;
let knownMaps = [];
let editorDefinition = null;
let selectedEditorRegionId = null;
const scenarioEditHistory = new ScenarioEditHistory(64);
let scenarioHistoryApplying = false;
function scenarioEditorState() {
  return { regions: ui.studioRegions.value, events: editorScenarioEvents,
    regionId: selectedEditorRegionId, eventId: selectedEditorScenarioEventId };
}
function recordScenarioEdit() {
  if (!scenarioHistoryApplying && editorDefinition) scenarioEditHistory.record(scenarioEditorState());
  document.querySelector('#studio-scenario-undo').disabled = !scenarioEditHistory.canUndo;
  document.querySelector('#studio-scenario-redo').disabled = !scenarioEditHistory.canRedo;
}
function restoreScenarioEdit(direction) {
  const state = scenarioEditHistory[direction]();
  if (!state) return;
  scenarioHistoryApplying = true;
  ui.studioRegions.value = state.regions;
  editorScenarioEvents = state.events;
  selectedEditorRegionId = state.regionId;
  selectedEditorScenarioEventId = state.eventId;
  syncEditorRegionControls(); syncEditorScenarioEventControls(); drawEditorGrid();
  scenarioHistoryApplying = false;
  recordScenarioEdit(); scheduleMapStudioDraftSave();
}
function syncEditorRegionControls() {
  const list = document.querySelector('#studio-region-list');
  let regions; try { regions = readEditorRegions(); } catch { return; }
  list.replaceChildren(new Option('Select a named region', ''), ...regions.map(r => new Option(r.name, r.id)));
  list.value = selectedEditorRegionId || '';
  const selected = regions.find(r => r.id === selectedEditorRegionId);
  for (const key of ['name','column','row','width','height']) {
    const field = document.querySelector(`#studio-region-${key}`);
    field.removeAttribute('aria-invalid'); field.disabled = !selected; field.value = selected ? key === 'name' ? selected.name : selected.zone[key] : '';
  }
  document.querySelector('#studio-region-delete').disabled = !selected;
}
function writeEditorRegions(regions) {
  ui.studioRegions.value = JSON.stringify(regions, null, 2);
  syncEditorRegionControls(); syncEditorScenarioEventControls(); drawEditorGrid(); recordScenarioEdit(); scheduleMapStudioDraftSave();
}
let editorDraftSourceMapId = null;
let editorDraftStorageKey = null;
let editorDraftDirty = false;
let editorDraftWriteTimer = 0;
let editorCellMaterials = new Int8Array(0);
let editorCellElevations = new Float64Array(0);
let editorGroundMaterials = new Int8Array(0);
let editorGroundLevels = new Uint8Array(0);
let editorTriggers = [];
let editorScenarioEvents = [];
let selectedEditorTriggerId = null;
let selectedEditorScenarioEventId = null;
let editorTriggerCreationPending = false;
let editorResourceNodes = [];
let selectedEditorResourceId = null;
let editorTool = 'stone';
let editorDrag = null;
let editorViewZoom = 1;
let editorPanDrag = null;
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
let latestPopulation = [null, null];
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
let audioCaptionTimer = 0;
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
  const clipPlanes = cameraDepthSafePlanes({
    halfX: MAP_HALF_X,
    halfZ: MAP_HALF_Z,
    targetX: cameraTarget.x,
    targetZ: cameraTarget.z,
    cameraOffsetX: cameraOffset.x,
    cameraOffsetZ: cameraOffset.z,
  });
  if (camera.far !== clipPlanes.far) {
    camera.far = clipPlanes.far;
    camera.updateProjectionMatrix();
  }
  camera.position.copy(cameraTarget).addScaledVector(cameraOffset, clipPlanes.distance);
  camera.lookAt(cameraTarget);
  camera.updateMatrixWorld();
  if (!mapDefinition) return;

  const clampedTarget = clampCameraTargetToGroundBounds({
    x: cameraTarget.x,
    z: cameraTarget.z,
    halfX: MAP_HALF_X,
    halfZ: MAP_HALF_Z,
    anchorOffset: cameraTargetHudSafeOffset(),
  });
  if (clampedTarget.x !== cameraTarget.x || clampedTarget.z !== cameraTarget.z) {
    cameraTarget.x = clampedTarget.x;
    cameraTarget.z = clampedTarget.z;
    setCamera();
  }
}

function cameraSafeRect() {
  return hudSafeRect(renderer.domElement.getBoundingClientRect(), visibleHudRects());
}

function cameraTargetHudSafeOffset() {
  const rect = renderer.domElement.getBoundingClientRect();
  const safe = cameraSafeRect();
  const centerWorld = worldAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
  const safeWorld = worldAt(safe.left + safe.width / 2, safe.top + safe.height / 2);
  if (!centerWorld || !safeWorld) return { x: 0, z: 0 };
  return { x: centerWorld.x - safeWorld.x, z: centerWorld.z - safeWorld.z };
}

function projectedMapBounds() {
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  const width = Math.max(1, renderer.domElement.clientWidth);
  const height = Math.max(1, renderer.domElement.clientHeight);
  for (const x of [-MAP_HALF_X, MAP_HALF_X]) {
    for (const z of [-MAP_HALF_Z, MAP_HALF_Z]) {
      const projected = new THREE.Vector3(x, 0, z).project(camera);
      const pixelX = width * (projected.x + 1) / 2;
      const pixelY = height * (1 - projected.y) / 2;
      bounds.left = Math.min(bounds.left, pixelX);
      bounds.right = Math.max(bounds.right, pixelX);
      bounds.top = Math.min(bounds.top, pixelY);
      bounds.bottom = Math.max(bounds.bottom, pixelY);
    }
  }
  return bounds;
}

function getMapFitZoom() {
  if (!mapDefinition) return 0.48;
  const priorZoom = camera.zoom;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  setCamera();
  const projected = projectedMapBounds();
  const safe = cameraSafeRect();
  const fitZoom = mapFitZoom(projected, safe.width, safe.height);
  camera.zoom = priorZoom;
  camera.updateProjectionMatrix();
  setCamera();
  return fitZoom || 0.48;
}

function focusGroundPointAtScreen(point, clientX, clientY) {
  mapFitActive = false;
  const rect = renderer.domElement.getBoundingClientRect();
  const projected = new THREE.Vector3(point.x, 0, point.z).project(camera);
  const pointX = rect.left + (projected.x + 1) * rect.width / 2;
  const pointY = rect.top + (1 - projected.y) * rect.height / 2;
  const underPoint = worldAt(pointX, pointY);
  const atTarget = worldAt(clientX, clientY);
  if (!underPoint || !atTarget) return;
  const delta = cameraTargetDeltaForScreenFocus(underPoint, atTarget);
  cameraTarget.x += delta.x;
  cameraTarget.z += delta.z;
  setCamera();
}

function fitMapToViewport() {
  if (!mapDefinition) return;
  const safe = cameraSafeRect();
  const fitZoom = getMapFitZoom();
  cameraMinZoom = Math.min(0.48, fitZoom);
  zoom = fitZoom;
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  setCamera();
  focusGroundPointAtScreen({ x: 0, z: 0 }, safe.left + safe.width / 2, safe.top + safe.height / 2);
  mapFitActive = true;
  resizeResourceCallouts();
  updateResourceNodeCallouts(performance.now(), true);
  drawMinimap(performance.now(), true);
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
  cameraMinZoom = Math.min(0.48, getMapFitZoom());
  if (mapFitActive && mapDefinition) {
    fitMapToViewport();
  } else if (zoom < cameraMinZoom) {
    zoom = cameraMinZoom;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }
  setCamera();
  resizeResourceCallouts();
  updateResourceNodeCallouts(performance.now(), true);
  drawMinimap(performance.now(), true);
}

function addMapObject(object) {
  scene.add(object);
  mapObjects.push(object);
}

function clearMapObjects() {
  for (const object of mapObjects) {
    object.userData.buildingSprite?.dispose();
    scene.remove(object);
    object.traverse((child) => {
      if (child.isSprite) disposeCapturedBuildingSprite(child);
      if (!child.isSprite) child.geometry?.dispose();
      for (const texture of child.userData.ownedGroundTextures || []) texture.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material?.dispose();
    });
  }
  mapObjects.length = 0;
  capturedBuildingVisuals.length = 0;
  townCenterProductionLamps[0] = null;
  townCenterProductionLamps[1] = null;
}

function applyProductionCueState(lamp, state, teamColor) {
  if (!lamp || lamp.userData.productionCueState === state) return;
  lamp.userData.productionCueState = state;
  lamp.visible = state !== 'idle';
  if (state === 'idle') return;
  lamp.material.color.setHex(teamColor);
  if (state === 'blocked') {
    lamp.material.color.lerp(pausedProductionCueColor, 0.55);
    lamp.material.opacity = 0.36;
    lamp.scale.setScalar(0.74);
    return;
  }
  lamp.material.opacity = 0.88;
  lamp.scale.setScalar(1);
}

function updateBuildingProductionCue(visual, building) {
  const state = buildingProductionCueState(
    building.complete === true,
    getBuildingQueueLength(building),
    building.productionBlocked === true,
  );
  applyProductionCueState(visual.productionLamp, state, visual.teamColor);
}

function createTownCenterVisual(building) {
  const spawn = { team: building.team };
  const { x, z } = building;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const fallbackRoot = new THREE.Group();
  group.add(fallbackRoot);
  const stone = new THREE.MeshBasicMaterial({ color: 0x9b9580 });
  const slate = new THREE.MeshBasicMaterial({ color: 0x363d3f });
  const timber = new THREE.MeshBasicMaterial({ color: 0x514333 });
  const doorMaterial = new THREE.MeshBasicMaterial({ color: 0x2d302b });
  const piece = (geometry, material, px, py, pz, angle = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(px, py, pz);
    mesh.rotation.z = angle;
    fallbackRoot.add(mesh);
    return mesh;
  };
  piece(new THREE.BoxGeometry(2.65, 0.22, 2.4), stone, 0, 0.11, 0);
  piece(new THREE.BoxGeometry(2.1, 0.91, 1.85), stone, 0, 0.67, -0.14);
  piece(new THREE.BoxGeometry(0.62, 0.67, 0.09), doorMaterial, 0, 0.56, 0.84);
  piece(new THREE.BoxGeometry(0.82, 0.12, 0.21), timber, 0, 0.95, 0.88);
  for (const side of [-1, 1]) {
    piece(new THREE.BoxGeometry(1.25, 0.13, 2.32), slate, side * 0.51, 1.37, -0.14, -side * 0.48);
    piece(new THREE.BoxGeometry(0.13, 0.88, 0.13), timber, side * 1.04, 0.68, 0.82);
    piece(new THREE.BoxGeometry(0.13, 0.35, 0.08), timber, side * 0.88, 0.72, 0.84);
  }
  piece(new THREE.BoxGeometry(0.16, 0.08, 2.24), slate, 0, 1.67, -0.14);
  piece(new THREE.BoxGeometry(0.74, 1.64, 0.74), stone, -0.73, 1.03, -0.63);
  piece(new THREE.ConeGeometry(0.67, 0.62, 4), slate, -0.73, 2.13, -0.63).rotation.y = Math.PI / 4;
  const standardRoot = new THREE.Group();
  standardRoot.position.set(-0.73, 0, -0.23);
  addBuildingStandard(standardRoot, spawn.team, 0, 0, 2.06);
  fallbackRoot.add(standardRoot);

  const capturedSprite = createCapturedBuildingSprite({ teamColor: TEAM_HEX[spawn.team] });
  group.add(capturedSprite);
  const productionLamp = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.15, 0),
    new THREE.MeshBasicMaterial({ color: TEAM_HEX[spawn.team], transparent: true, opacity: 0.88 }),
  );
  productionLamp.position.set(0, 1.09, 0.93);
  productionLamp.visible = false;
  group.add(productionLamp);
  const captureEntry = { sprite: capturedSprite, fallbackRoot, lifecycleInput: building };
  capturedBuildingVisuals.push(captureEntry);
  const outline = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.7, 4),
    new THREE.MeshBasicMaterial({ color: TEAM_HEX[building.team], side: THREE.DoubleSide }));
  outline.rotation.x = -Math.PI / 2; outline.rotation.z = Math.PI / 4; outline.position.y = 0.04;
  group.add(outline);
  const healthIndicator = createBuildingHealthIndicator(); group.add(healthIndicator.group);
  const combatFeedback = createBuildingCombatFeedback(); group.add(combatFeedback.targetRing, combatFeedback.impactFlash);
  const rallyMarker = createBuildingRallyMarker(); group.add(rallyMarker);
  const visual = { group, fallbackRoot, captureEntry, productionLamp, outline,
    healthIndicator, combatFeedback, rallyMarker, teamColor: TEAM_HEX[building.team] };
  scene.add(group); updateTownCenterVisual(visual, building); return visual;
}

function updateTownCenterVisual(visual, building) {
  visual.group.position.set(building.x, 0, building.z);
  visual.captureEntry.lifecycleInput = building;
  const progress = THREE.MathUtils.clamp(Number(building.progress) || 0, 0, 1);
  visual.fallbackRoot.scale.set(building.home ? 1 : 1.45, Math.max(0.08, progress), building.home ? 1 : 1.45);
  updateBuildingHealthIndicator(visual, building);
  updateBuildingProductionCue(visual, building);
}

function clearBuildingVisuals() {
  selectedBuildingId = null;
  for (const visual of buildingVisuals.values()) {
    if (visual.captureEntry) { const index = capturedBuildingVisuals.indexOf(visual.captureEntry); if (index >= 0) capturedBuildingVisuals.splice(index, 1); }
    visual.authoredSprite?.dispose();
    scene.remove(visual.group);
    visual.group.traverse((object) => {
      if (!object.isSprite) object.geometry?.dispose();
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
    if (visual.productionLamp?.userData.productionCueState === 'active') {
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
    const state = buildingProductionCueState(
      true, production?.queue, production?.productionBlocked === true,
    );
    applyProductionCueState(lamp, state, TEAM_HEX[team]);
    if (state === 'active') {
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
  if (visual.captureEntry) {
    const captureIndex = capturedBuildingVisuals.indexOf(visual.captureEntry);
    if (captureIndex >= 0) capturedBuildingVisuals.splice(captureIndex, 1);
  }
  visual.authoredSprite?.dispose();
  scene.remove(visual.group);
  visual.group.traverse((object) => {
    if (!object.isSprite) object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material?.map?.userData?.sharedBuildingSprite) material?.map?.dispose();
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
  const top = height - 0.13;
  const bottom = height - 0.7;
  const middle = (top + bottom) / 2;
  flagShape.moveTo(0, top);
  flagShape.lineTo(0.67, top);
  if (team === 0) {
    flagShape.lineTo(0.67, bottom);
    flagShape.lineTo(0, bottom);
  } else {
    flagShape.lineTo(0.67, bottom + 0.13);
    flagShape.lineTo(0.39, bottom + 0.13);
    flagShape.lineTo(0.335, bottom);
    flagShape.lineTo(0.28, bottom + 0.13);
    flagShape.lineTo(0, bottom + 0.13);
  }
  flagShape.closePath();

  const barShape = (x0, x1) => {
    const shape = new THREE.Shape();
    shape.moveTo(x0, middle - 0.045);
    shape.lineTo(x1, middle - 0.045);
    shape.lineTo(x1, middle + 0.045);
    shape.lineTo(x0, middle + 0.045);
    shape.closePath();
    return shape;
  };
  const shapeParts = [
    { shape: flagShape, color: TEAM_HEX[team], z: 0 },
    ...(team === 0
      ? [{ shape: barShape(0.15, 0.52), color: 0xe8ddc5, z: 0.002 }]
      : [
        { shape: barShape(0.13, 0.29), color: 0xe8ddc5, z: 0.002 },
        { shape: barShape(0.38, 0.54), color: 0xe8ddc5, z: 0.002 },
      ]),
  ];
  const vertices = [];
  const colors = [];
  const indices = [];
  for (const part of shapeParts) {
    const geometry = new THREE.ShapeGeometry(part.shape);
    const positionAttribute = geometry.getAttribute('position');
    const sourceIndex = geometry.getIndex();
    const offset = vertices.length / 3;
    const partColor = new THREE.Color(part.color);
    for (let index = 0; index < positionAttribute.count; index++) {
      vertices.push(positionAttribute.getX(index), positionAttribute.getY(index), part.z);
      colors.push(partColor.r, partColor.g, partColor.b);
    }
    if (sourceIndex) {
      for (let index = 0; index < sourceIndex.count; index++) indices.push(offset + sourceIndex.getX(index));
    } else {
      for (let index = 0; index < positionAttribute.count; index++) indices.push(offset + index);
    }
    geometry.dispose();
  }
  const flagGeometry = new THREE.BufferGeometry();
  flagGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  flagGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  flagGeometry.setIndex(indices);
  flagGeometry.computeVertexNormals();
  const flag = new THREE.Mesh(
    flagGeometry,
    new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide }),
  );
  flag.position.z = 0.035;
  standard.add(flag);
  group.add(standard);
  return standard;
}

function createHouseVisual(building) {
  const group = new THREE.Group();
  const teamColor = TEAM_HEX[building.team];
  const walls = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.2, 2.3),
    new THREE.MeshBasicMaterial({ color: 0xa99775 }));
  group.add(walls);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.85, 1.2, 4),
    new THREE.MeshBasicMaterial({ color: 0x705443 }));
  roof.rotation.y = Math.PI / 4; roof.position.y = 1.9; group.add(roof);
  addBuildingStandard(group, building.team, 1.15, 1.15, 1.6);
  const outline = new THREE.Mesh(new THREE.RingGeometry(1.75, 1.85, 4),
    new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  outline.rotation.x = -Math.PI / 2; outline.rotation.z = Math.PI / 4; outline.position.y = 0.04;
  group.add(outline);
  const healthIndicator = createBuildingHealthIndicator(); group.add(healthIndicator.group);
  const combatFeedback = createBuildingCombatFeedback(); group.add(combatFeedback.targetRing, combatFeedback.impactFlash);
  const visual = { group, walls, roof, outline, teamColor, healthIndicator, combatFeedback };
  scene.add(group); updateHouseVisual(visual, building); return visual;
}

function updateHouseVisual(visual, building) {
  const progress = THREE.MathUtils.clamp(Number(building.progress) || 0, 0, 1);
  visual.group.position.set(building.x, 0, building.z); visual.group.visible = true;
  visual.walls.scale.y = Math.max(0.08, progress); visual.walls.position.y = 0.15 + 0.6 * progress;
  visual.roof.visible = building.complete === true;
  updateBuildingHealthIndicator(visual, building);
}

function createWatchtowerVisual(building) {
  const visual = createHouseVisual(building);
  visual.walls.material.color.setHex(0x8d8879);
  visual.roof.material.color.setHex(0x4f554e);
  updateWatchtowerVisual(visual, building);
  return visual;
}
function updateWatchtowerVisual(visual, building) {
  updateHouseVisual(visual, building);
  const progress = THREE.MathUtils.clamp(Number(building.progress) || 0, 0, 1);
  visual.walls.scale.y = Math.max(0.08, progress * 2.3);
  visual.walls.position.y = 0.15 + 1.38 * progress;
  visual.roof.position.y = 3.5;
  if (Number.isFinite(building.lastAttackX) && Number.isFinite(building.lastAttackZ)) {
    visual.roof.rotation.y = Math.atan2(building.lastAttackX - building.x, building.lastAttackZ - building.z);
  }
}

function createGameplayBuildingVisual(building) {
  const role = buildingPresentation(building.type).role;
  if (role === 'watchtower') return createWatchtowerVisual(building);
  if (role === 'town-center') return createTownCenterVisual(building);
  if (role === 'house') return createHouseVisual(building);
  return role === 'barracks' ? createBarracksVisual(building) : createArcheryRangeVisual(building);
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
    timberMaterial,
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
  const authoredSprite = attachBuildingSprite(group, [...group.children], building);
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
  const visual = { group, authoredSprite, posts, roof, finishPieces, productionLamp,
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
  const finished = buildingFinishedDetailsVisible(progress, building.complete);
  visual.roof.visible = finished;
  for (const piece of visual.finishPieces) piece.visible = finished;
  visual.authoredSprite.update(building);
  updateBuildingProductionCue(visual, building);
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

  const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), timberMaterial, 8);
  frame.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  let frameIndex = 0;
  for (const x of [-1.12, 1.12]) {
    for (const z of [-1.12, 1.12]) {
      dummy.position.set(x, 0.70, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.12, 0.96, 0.12);
      dummy.updateMatrix();
      frame.setMatrixAt(frameIndex++, dummy.matrix);
    }
  }
  for (const z of [-1.12, 1.12]) {
    dummy.position.set(0, 1.18, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(2.35, 0.12, 0.12);
    dummy.updateMatrix();
    frame.setMatrixAt(frameIndex++, dummy.matrix);
  }
  for (const x of [-1.12, 1.12]) {
    dummy.position.set(x, 1.18, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.12, 0.12, 2.15);
    dummy.updateMatrix();
    frame.setMatrixAt(frameIndex++, dummy.matrix);
  }
  frame.computeBoundingSphere();
  group.add(frame);

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
    roofMaterial,
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
    new THREE.MeshBasicMaterial({ color: 0x6f644d }),
  );
  shieldSign.geometry.rotateX(Math.PI / 2);
  shieldSign.position.set(0, 1.12, 1.25);
  group.add(shieldSign);
  finishPieces.push(shieldSign);
  const standard = addBuildingStandard(group, building.team, 1.24, 1.15, 2.06);
  finishPieces.push(standard);
  const authoredSprite = attachBuildingSprite(group, [...group.children], building);
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
  const visual = { group, authoredSprite, frame, walls, roofPanels, ridge, finishPieces, productionLamp,
    teamColor, outline, rallyMarker, healthIndicator, combatFeedback };
  updateBarracksVisual(visual, building);
  return visual;
}

function updateBarracksVisual(visual, building) {
  const progress = THREE.MathUtils.clamp(Number(building.progress) || 0, 0, 1);
  const state = barracksModelVisualState(progress, building.complete);
  visual.group.position.set(building.x, 0, building.z);
  visual.group.visible = true;
  visual.frame.visible = state.frameVisible;

  for (const wall of visual.walls) {
    wall.scale.y = 1;
    wall.position.y = 0.23 + wall.scale.y * 0.5;
    wall.visible = state.wallsVisible;
  }
  for (const panel of visual.roofPanels) {
    panel.visible = state.roofVisible;
  }
  visual.ridge.visible = state.roofVisible;
  for (const piece of visual.finishPieces) piece.visible = state.finishedDetailsVisible;
  visual.authoredSprite.update(building);
  updateBuildingProductionCue(visual, building);
  updateBuildingHealthIndicator(visual, building);
}

function reconcileBuildings(buildings = [], initial = false) {
  const rows = Array.isArray(buildings)
    ? buildings.filter((building) => building && Object.hasOwn(BUILDING_DEFINITIONS, building.type)
      && [0, 1].includes(building.team) && Number.isFinite(building.x) && Number.isFinite(building.z))
    : [];
  const priorSelectedBuildingId = selectedBuildingId;
  const previousBuildings = new Map(latestBuildings.map((building) => [building.id, building]));
  let buildingDamage = 0;
  let finishedFriendlyConstruction = false;
  const priorSelectedRallyCell = latestBuildings.find((building) => building.id === selectedBuildingId)?.rallyCell ?? -1;
  if (selectedBuildingId !== null && !rows.some((building) => building.id === selectedBuildingId
    && building.team === localTeam)) selectedBuildingId = null;
  const seen = new Set();
  for (const building of rows) {
    const previous = previousBuildings.get(building.id);
    if (previous && building.team === localTeam) {
      if (Number.isFinite(previous.hp) && Number.isFinite(building.hp) && building.hp < previous.hp) buildingDamage++;
      if (previous.complete !== true && building.complete === true) finishedFriendlyConstruction = true;
    }
    seen.add(building.id);
    let visual = buildingVisuals.get(building.id);
    if (!visual) {
      visual = createGameplayBuildingVisual(building);
      buildingVisuals.set(building.id, visual);
    } else if (visual.type !== building.type) {
      disposeBuildingVisual(visual);
      visual = createGameplayBuildingVisual(building);
      buildingVisuals.set(building.id, visual);
    } else if (buildingPresentation(building.type).role === 'watchtower') updateWatchtowerVisual(visual, building);
    else if (buildingPresentation(building.type).role === 'town-center') updateTownCenterVisual(visual, building);
    else if (buildingPresentation(building.type).role === 'house') updateHouseVisual(visual, building);
    else if (buildingPresentation(building.type).role === 'barracks') updateBarracksVisual(visual, building);
    else updateArcheryRangeVisual(visual, building);
    visual.type = building.type;
    updateBuildingRallyMarker(visual, building);
    updateBuildingSelectionVisual(visual, building.id === selectedBuildingId);
    updateBuildingCombatFeedback(visual, building);
  }
  updateConstructionGroundBatches(rows);
  for (const [id, visual] of buildingVisuals) {
    if (seen.has(id)) continue;
    disposeBuildingVisual(visual);
    buildingVisuals.delete(id);
  }
  latestBuildings = rows;
  if (!initial && finishedFriendlyConstruction) audio.playEvent({ cue: 'building-complete' });
  // Unit births, rather than queue decreases/cancellations, emit ready feedback.
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
  return BUILDING_DEFINITIONS[type]?.label.toUpperCase() || 'BUILDING';
}

function updateBuildingResearchControls(selectedBuilding) {
  const teamState = localTeam === null ? null : latestTeamResearch[localTeam];
  const active = teamState?.active || null;
  const food = localTeam === null ? 0 : latestFood[localTeam];
  const wood = localTeam === null ? 0 : latestWood[localTeam];
  const candidates = Object.values(TECHNOLOGY_DEFINITIONS).filter(rule => rule.building === selectedBuilding?.type);
  const definition = candidates.find(rule => rule.id === active?.type)
    || candidates.find(rule => !teamState?.[rule.upgradeKey] && !(rule.requires || []).some(id => !teamState?.[TECHNOLOGY_DEFINITIONS[id].upgradeKey]))
    || candidates.find(rule => !teamState?.[rule.upgradeKey]) || candidates[0];
  const rules = definition ? { type: definition.id, key: definition.upgradeKey, label: definition.label,
    foodCost: definition.cost.food, woodCost: definition.cost.wood, durationSeconds: definition.durationSeconds } : null;
  const option = rules ? researchAction(selectedBuilding, rules.type, { team: localTeam, food, wood,
    upgrades: teamState, active, matchOver: matchWinner >= 0 }) : null;
  if (ui.buildingResearchReadout) {
    if (!rules) ui.buildingResearchReadout.textContent = 'RESEARCH · SELECT A RESEARCH BUILDING';
    else if (teamState?.[rules.key]) ui.buildingResearchReadout.textContent = `${rules.label} · COMPLETED`;
    else if (active?.buildingId === selectedBuilding.id) {
      ui.buildingResearchReadout.textContent = `${TECHNOLOGY_DEFINITIONS[active.type]?.label || 'RESEARCH'} · RESEARCHING ${Math.round((active.progress || 0) * 100)}% · ${Math.ceil(active.remaining || 0)}S`;
    } else {
      const short = [];
      if (food < rules.foodCost) short.push(`${formatResourceRequirement(rules.foodCost - food)} FOOD`);
      if (wood < rules.woodCost) short.push(`${formatResourceRequirement(rules.woodCost - wood)} WOOD`);
      const reason = short.length && !option?.missingPrerequisites.length && !active ? `NEED ${short.join(' + ')}` : option?.reason;
      ui.buildingResearchReadout.textContent = `${rules.label} · ${rules.foodCost} FOOD / ${rules.woodCost} WOOD · ${rules.durationSeconds}S${reason ? ` · ${reason}` : ''}`;
    }
  }
  if (ui.researchAttackUpgrade) {
    ui.researchAttackUpgrade.disabled = !option?.available;
    ui.researchAttackUpgrade.dataset.technology = rules?.type || '';
    ui.researchAttackUpgrade.setAttribute('aria-label', rules ? `Research ${rules.label}` : 'Select a research building');
  }
  updateResearchOptions(ui.researchOptions, selectedBuilding);
}

function updateResearchOptions(container, building) {
  if (!container || typeof container.replaceChildren !== 'function') return;
  const own = building && building.team === localTeam;
  const teamState = localTeam === null ? null : latestTeamResearch[localTeam];
  const state = { team: localTeam, food: latestFood[localTeam] || 0, wood: latestWood[localTeam] || 0,
    upgrades: teamState, active: teamState?.active, matchOver: matchWinner >= 0 };
  const options = own ? researchOptions(building, state) : [];
  const signature = `${building?.id || ''}:${options.map(option => option.upgrade).join(',')}`;
  if (container.dataset.signature !== signature) {
    container.replaceChildren(); container.dataset.signature = signature;
    for (const option of options) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'economy-action'; button.dataset.technology = option.upgrade;
      button.addEventListener('click', () => sendCommand({ type: 'researchUpgrade', buildingId: building.id, upgrade: option.upgrade }));
      container.append(button);
    }
  }
  for (const [index, option] of options.entries()) {
    const button = container.children[index]; const definition = TECHNOLOGY_DEFINITIONS[option.upgrade];
    const authoritative = building.researchOptions?.find(row => row.upgrade === option.upgrade);
    const reason = authoritative?.available === false ? authoritative.reason : option.reason;
    button.disabled = !option.available || authoritative?.available === false;
    button.textContent = `${definition.label} · ${definition.cost.food} food / ${definition.cost.wood} wood${reason ? ` · ${reason}` : ''}`;
  }
}

function buildingWoodCost(type) {
  return BUILDING_DEFINITIONS[type]?.cost.wood ?? Infinity;
}

function buildingFootprint(type) {
  return BUILDING_DEFINITIONS[type]?.footprint ?? 3;
}

function resourceCalloutTexture(type) {
  if (resourceCalloutTextures.has(type)) return resourceCalloutTextures.get(type);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const accent = type === 'wood' ? '#9bb877' : '#e4bd63';
  context.fillStyle = 'rgba(13, 21, 15, 0.96)';
  context.strokeStyle = 'rgba(235, 243, 222, 0.92)';
  context.lineWidth = 3;
  context.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 14);
  context.fill();
  context.stroke();
  context.beginPath();
  context.arc(29, 32, 10, 0, Math.PI * 2);
  context.fillStyle = accent;
  context.fill();
  context.font = '700 26px "DM Mono", monospace';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = '#f2f6dd';
  context.fillText(type === 'wood' ? 'WOOD' : 'FOOD', 50, 33);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  resourceCalloutTextures.set(type, texture);
  return texture;
}

function resizeResourceCallouts() {
  const height = Math.max(1, viewport.clientHeight);
  const heightPixels = THREE.MathUtils.clamp(height * 0.04, 18, 30);
  const worldHeight = heightPixels * baseFrustum / (height * zoom);
  for (const visual of resourceNodeVisuals.values()) {
    if (!visual.callout) continue;
    visual.callout.scale.set(worldHeight * 4, worldHeight, 1);
  }
}

function buildConstructionGroundBatches() {
  constructionGroundMeshes.clear();
  constructionGroundSignatures.clear();
  for (const stage of ['earthwork', 'foundation']) {
    const mesh = createConstructionGroundInstances(stage, MAX_MAP_BUILDINGS);
    if (!mesh) continue;
    addMapObject(mesh);
    constructionGroundMeshes.set(stage, mesh);
    constructionGroundSignatures.set(stage, '');
  }
}

function updateConstructionGroundBatches(buildings) {
  for (const stage of ['earthwork', 'foundation']) {
    const stageBuildings = buildings
      .filter((building) => constructionGroundStage(building.progress, building.complete) === stage)
      .sort((left, right) => left.id - right.id);
    const signature = stageBuildings.map((building) => `${building.id}:${building.x}:${building.z}`).join('|');
    if (constructionGroundSignatures.get(stage) === signature) continue;
    const mesh = constructionGroundMeshes.get(stage);
    if (!updateConstructionGroundInstances(mesh, stageBuildings)) continue;
    constructionGroundSignatures.set(stage, signature);
  }
}

function addResourceNodeVisual(node) {
  const nodeType = node.type === 'wood' ? 'wood' : 'food';
  const stage = resourceVisualStage(node.stock, node.stock);
  const ringColor = nodeType === 'wood' ? 0x9bb877 : 0xe4bd63;
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: ringColor, side: THREE.DoubleSide, transparent: true, opacity: 0.78, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.66, 24), ringMaterial);
  ring.material.color.setHex(node.stock > 0 ? ringColor : 0x77806b);
  ring.material.opacity = node.stock > 0 ? 0.78 : 0.35;
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(node.x, 0.035, node.z);
  ring.renderOrder = 2;
  addMapObject(ring);

  const callout = new THREE.Sprite(new THREE.SpriteMaterial({
    map: resourceCalloutTexture(nodeType), transparent: true, depthTest: false,
    depthWrite: false, fog: false, toneMapped: false,
  }));
  callout.position.set(node.x, 1.8, node.z);
  callout.renderOrder = 15;
  callout.visible = false;
  addMapObject(callout);
  resourceNodeVisuals.set(node.id, {
    type: nodeType, ring, stock: node.stock, startingStock: node.stock, stage,
    x: node.x, z: node.z, callout,
  });
}

function updateResourceNodeVisual(id, stock) {
  latestResourceStocks.set(id, stock);
  const visual = resourceNodeVisuals.get(id);
  if (!visual) return;
  visual.stock = stock;
  const stage = resourceVisualStage(stock, visual.startingStock);
  if (visual.stage === stage) return;
  visual.stage = stage;
  const nodeColor = visual.type === 'wood' ? 0x9bb877 : 0xe4bd63;
  visual.ring.material.color.setHex(stock > 0 ? nodeColor : 0x77806b);
  visual.ring.material.opacity = stock > 0 ? 0.78 : 0.35;
  if (visual.type === 'wood') setWoodNodeTreeStage(id, stage);
  else setBerryNodeStage(id, stage);
}

function updateResourceNodeCallouts(now, force = false) {
  if ((!force && now - lastResourceCalloutUpdateAt < 350) || resourceNodeVisuals.size === 0) return;
  lastResourceCalloutUpdateAt = now;
  const crowdRadiusSquared = 36;
  const crowdThreshold = 8;
  const viewportRect = renderer.domElement.getBoundingClientRect();
  const pixelsPerWorldUnit = viewportRect.height * zoom / baseFrustum;
  const occlusionRects = visibleHudRects();
  for (const visual of resourceNodeVisuals.values()) {
    if (visual.stock <= 0) {
      visual.callout.visible = false;
      continue;
    }
    const column = Math.floor(visual.x + MAP_HALF_X);
    const row = Math.floor(visual.z + MAP_HALF_Z);
    const fogState = latestFogCells?.[row * MAP_WIDTH + column] ?? 2;
    if (fogState === 0) {
      visual.callout.visible = false;
      continue;
    }
    let nearbyUnits = 0;
    for (const team of teamUnits) {
      for (const unit of team) {
        if (!unit || unit.visible === false || unit.hp <= 0) continue;
        const dx = unit.renderX - visual.x;
        const dz = unit.renderZ - visual.z;
        if (dx * dx + dz * dz <= crowdRadiusSquared) nearbyUnits++;
        if (nearbyUnits >= crowdThreshold) break;
      }
      if (nearbyUnits >= crowdThreshold) break;
    }
    const halfWidth = visual.callout.scale.x * pixelsPerWorldUnit * 0.5;
    const halfHeight = visual.callout.scale.y * pixelsPerWorldUnit * 0.5;
    visual.callout.position.set(visual.x, 1.8, visual.z);
    screenPoint.set(visual.x, visual.callout.position.y, visual.z).project(camera);
    let centerX = viewportRect.left + (screenPoint.x * 0.5 + 0.5) * viewportRect.width;
    let centerY = viewportRect.top + (-screenPoint.y * 0.5 + 0.5) * viewportRect.height;
    const minCenterX = viewportRect.left + halfWidth + 8;
    const maxCenterX = viewportRect.right - halfWidth - 8;
    const clampedCenterX = THREE.MathUtils.clamp(centerX, minCenterX, maxCenterX);
    if (clampedCenterX !== centerX) {
      const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      visual.callout.position.addScaledVector(cameraRight, (clampedCenterX - centerX) / pixelsPerWorldUnit);
      screenPoint.set(visual.callout.position.x, visual.callout.position.y, visual.callout.position.z).project(camera);
      centerX = viewportRect.left + (screenPoint.x * 0.5 + 0.5) * viewportRect.width;
      centerY = viewportRect.top + (-screenPoint.y * 0.5 + 0.5) * viewportRect.height;
    }
    const left = centerX - halfWidth;
    const right = centerX + halfWidth;
    const top = centerY - halfHeight;
    const bottom = centerY + halfHeight;
    const fitsViewport = screenPoint.z >= -1 && screenPoint.z <= 1
      && left >= viewportRect.left && right <= viewportRect.right
      && top >= viewportRect.top && bottom <= viewportRect.bottom;
    const overlapsHud = occlusionRects.some((rect) => (
      left < rect.right && right > rect.left && top < rect.bottom && bottom > rect.top
    ));
    visual.callout.visible = nearbyUnits >= crowdThreshold && fitsViewport && !overlapsHud;
    visual.callout.material.opacity = fogState === 1 ? 0.58 : 1;
  }
}

function setWoodNodeTreeStage(id, stage) {
  const slots = woodTreeNodeSlots.get(id);
  if (!slots?.length) return;
  const previous = woodTreeNodeStages.get(id);
  if (!previous || previous === stage) return;
  woodTreeStageCounts.set(previous, Math.max(0, (woodTreeStageCounts.get(previous) || 0) - 1));
  woodTreeStageCounts.set(stage, (woodTreeStageCounts.get(stage) || 0) + 1);
  const changedStages = resourceVisualTransitionStages(previous, stage);
  for (const slot of slots) {
  for (const meshStage of changedStages) {
    const mesh = woodTreeMeshes.get(meshStage);
    if (!mesh) continue;
    setEnvironmentSpriteInstance(mesh, slot.index, slot.x, slot.z,
      meshStage === stage
        ? slot.scale * (RESOURCE_STATE_ASSETS_AVAILABLE ? 1 : resourceVisualScale(stage)) : 0);
    }
  }
  for (const meshStage of changedStages) {
    const mesh = woodTreeMeshes.get(meshStage);
    if (!mesh) continue;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = (woodTreeStageCounts.get(meshStage) || 0) > 0;
  }
  woodTreeNodeStages.set(id, stage);
}

function buildWoodNodeInstances(nodes = []) {
  woodTreeMeshes = new Map();
  woodTreeNodeSlots.clear();
  woodTreeNodeStages.clear();
  woodTreeStageCounts.clear();
  for (const stage of RESOURCE_VISUAL_STAGES) woodTreeStageCounts.set(stage, 0);
  const woodNodes = nodes.filter((node) => node.type === 'wood');
  if (woodNodes.length === 0) return;
  const positions = woodNodes.map((node, index) => ({
    x: node.x, z: node.z, scale: 0.85 + (index % 3) * 0.07,
  }));
  for (let index = 0; index < woodNodes.length; index++) {
    const stage = resourceVisualStage(woodNodes[index].stock, woodNodes[index].stock);
    woodTreeNodeSlots.set(woodNodes[index].id, [{ index, ...positions[index] }]);
    woodTreeNodeStages.set(woodNodes[index].id, stage);
    woodTreeStageCounts.set(stage, woodTreeStageCounts.get(stage) + 1);
  }
  for (const stage of RESOURCE_VISUAL_STAGES) {
    const stagePositions = positions.map((position, index) => ({
      ...position,
      scale: woodTreeNodeStages.get(woodNodes[index].id) === stage
        ? position.scale * (RESOURCE_STATE_ASSETS_AVAILABLE ? 1 : resourceVisualScale(stage)) : 0,
    }));
    const trees = createEnvironmentSpriteInstances(`oak-${stage}`, 4.1, 3.75, stagePositions);
    if (!trees) continue;
    trees.visible = woodTreeStageCounts.get(stage) > 0;
    addMapObject(trees);
    woodTreeMeshes.set(stage, trees);
  }
}

function setBerryNodeStage(id, stage) {
  const slot = berryNodeSlots.get(id);
  if (!slot) return;
  const previous = berryNodeStages.get(id);
  if (!previous || previous === stage) return;
  berryStageCounts.set(previous, Math.max(0, (berryStageCounts.get(previous) || 0) - 1));
  berryStageCounts.set(stage, (berryStageCounts.get(stage) || 0) + 1);
  const changedStages = resourceVisualTransitionStages(previous, stage);
  for (const meshStage of changedStages) {
    const mesh = berrySpriteMeshes.get(meshStage);
    if (!mesh) continue;
    setEnvironmentSpriteInstance(mesh, slot.index, slot.x, slot.z,
      meshStage === stage
        ? slot.scale * (RESOURCE_STATE_ASSETS_AVAILABLE ? 1 : resourceVisualScale(stage)) : 0);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = (berryStageCounts.get(meshStage) || 0) > 0;
  }
  berryNodeStages.set(id, stage);
}

function buildBerryNodeInstances(nodes = []) {
  berrySpriteMeshes = new Map();
  berryNodeSlots.clear();
  berryNodeStages.clear();
  berryStageCounts.clear();
  for (const stage of RESOURCE_VISUAL_STAGES) berryStageCounts.set(stage, 0);
  const berryNodes = nodes.filter((node) => node.type === 'food');
  if (berryNodes.length === 0) return;
  const positions = berryNodes.map((node) => ({ x: node.x, z: node.z, scale: 1 }));
  for (let index = 0; index < berryNodes.length; index++) {
    const stage = resourceVisualStage(berryNodes[index].stock, berryNodes[index].stock);
    berryNodeSlots.set(berryNodes[index].id, { index, ...positions[index] });
    berryNodeStages.set(berryNodes[index].id, stage);
    berryStageCounts.set(stage, berryStageCounts.get(stage) + 1);
  }
  for (const stage of RESOURCE_VISUAL_STAGES) {
    const stagePositions = positions.map((position, index) => ({
      ...position,
      scale: berryNodeStages.get(berryNodes[index].id) === stage
        ? position.scale * (RESOURCE_STATE_ASSETS_AVAILABLE ? 1 : resourceVisualScale(stage)) : 0,
    }));
    const sprites = createEnvironmentSpriteInstances(`berries-${stage}`, 2.55, 1.56, stagePositions);
    if (!sprites) continue;
    sprites.visible = berryStageCounts.get(stage) > 0;
    addMapObject(sprites);
    berrySpriteMeshes.set(stage, sprites);
  }
}

function refreshResourceStateFallbackTransforms() {
  for (const [id, slots] of woodTreeNodeSlots) {
    const stage = woodTreeNodeStages.get(id);
    for (const meshStage of RESOURCE_VISUAL_STAGES) {
      const mesh = woodTreeMeshes.get(meshStage);
      if (!mesh) continue;
      for (const slot of slots) {
        setEnvironmentSpriteInstance(mesh, slot.index, slot.x, slot.z,
          meshStage === stage ? slot.scale : 0);
      }
    }
  }
  for (const [id, slot] of berryNodeSlots) {
    const stage = berryNodeStages.get(id);
    for (const meshStage of RESOURCE_VISUAL_STAGES) {
      const mesh = berrySpriteMeshes.get(meshStage);
      if (!mesh) continue;
      setEnvironmentSpriteInstance(mesh, slot.index, slot.x, slot.z,
        meshStage === stage ? slot.scale : 0);
    }
  }
  for (const mesh of [...woodTreeMeshes.values(), ...berrySpriteMeshes.values()]) {
    mesh.instanceMatrix.needsUpdate = true;
  }
}

resourceStateAssetsReady.then((status) => {
  if (status.ready) {
    refreshResourceStateFallbackTransforms();
    refreshForestStumpTransforms();
  }
  if (roomPageUrl.searchParams.get('rendererCapture') === 'environment-state') {
    window.__rtsEnvironmentAssetStatus = status;
    window.__rtsEnvironmentCaptureCommand = (command) => sendCommand(command);
  }
});

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

function setForestTreeVisual(cell, stock) {
  const slot = forestTreeSlots.get(cell);
  if (!slot) return;
  const depleted = stock <= 0;
  setForestSpriteStock(slot, stock);
  const stump = forestStumpSlots.get(cell);
  if (!stump || !forestStumpMesh) return;
  const showStump = depleted && RESOURCE_STATE_ASSETS_AVAILABLE;
  if (showStump !== stump.visible) {
    forestStumpCount = Math.max(0, forestStumpCount + (showStump ? 1 : -1));
    stump.visible = showStump;
  }
  setEnvironmentSpriteInstance(forestStumpMesh, stump.index, stump.x, stump.z,
    showStump ? stump.scale : 0, stump.flip);
  forestStumpMesh.instanceMatrix.needsUpdate = true;
  forestStumpMesh.visible = forestStumpCount > 0;
}

function refreshForestStumpTransforms() {
  if (!forestStumpMesh) return;
  forestStumpCount = 0;
  for (const [cell, stump] of forestStumpSlots) {
    stump.visible = latestForestStocks.get(cell) === 0 && RESOURCE_STATE_ASSETS_AVAILABLE;
    if (stump.visible) forestStumpCount++;
    setEnvironmentSpriteInstance(forestStumpMesh, stump.index, stump.x, stump.z,
      stump.visible ? stump.scale : 0, stump.flip);
  }
  forestStumpMesh.instanceMatrix.needsUpdate = true;
  forestStumpMesh.visible = forestStumpCount > 0;
}

function applyForestState(state) {
  if (!Number.isSafeInteger(state.forestEpoch)) return;
  let visualChanged = false;
  if (latestForestEpoch !== state.forestEpoch) {
    for (const [cell, stock] of latestForestStocks) {
      if (stock < 6) {
        setForestTreeVisual(cell, 6);
        visualChanged = true;
      }
    }
    latestForestStocks.clear();
    latestForestEpoch = state.forestEpoch;
  }
  if (Array.isArray(state.forestStocks)) {
    for (const row of state.forestStocks) {
      if (!Array.isArray(row) || row.length !== 2) continue;
      const [cell, stock] = row;
      if (!Number.isInteger(cell) || cell < 0 || cell >= MAP_WIDTH * MAP_HEIGHT
        || !forestTreeSlots.has(cell) || !Number.isFinite(stock) || stock < 0) continue;
      const previousStock = latestForestStocks.get(cell);
      if (previousStock === stock) continue;
      latestForestStocks.set(cell, stock);
      if (resourceVisualStage(previousStock ?? 6, 6) !== resourceVisualStage(stock, 6)) {
        setForestTreeVisual(cell, stock);
        visualChanged = true;
      }
    }
  }
  if (visualChanged) drawMinimap(performance.now(), true);
}

function buildMap(definition) {
  fogTexture?.dispose();
  clearMapObjects();
  constructionGroundMeshes.clear();
  constructionGroundSignatures.clear();
  objectiveVisuals.clear();
  scenarioEventVisuals.clear();
  timedVictoryVisual = null;
  victoryHoldVisual = null;
  resourceNodeVisuals.clear();
  latestForestStocks.clear();
  latestForestEpoch = null;
  forestTreeSlots = new Map();
  forestStumpSlots = new Map();
  forestStumpMesh = null;
  forestStumpCount = 0;
  latestResourceStocks = new Map();
  objectivePanel.replaceChildren();
  if (tapOrderArmed) setTapOrderArmed(false, false);
  MAP_WIDTH = definition.width;
  MAP_HEIGHT = definition.height;
  MAP_HALF_X = MAP_WIDTH / 2;
  MAP_HALF_Z = MAP_HEIGHT / 2;
  clearBuildingVisuals();
  woodTreeNodeSlots.clear();
  woodTreeMeshes = new Map();
  woodTreeNodeStages.clear();
  woodTreeStageCounts.clear();
  berryNodeSlots.clear();
  berrySpriteMeshes = new Map();
  berryNodeStages.clear();
  berryStageCounts.clear();
  latestBuildings = [];
  latestWorkerProduction = [null, null];
  latestPopulation = [null, null];
  if (buildPlacementActive) cancelBuildPlacement(false);

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_WIDTH + 4, MAP_HEIGHT + 4),
    new THREE.MeshStandardMaterial({ color: TERRAIN_COLORS[environmentTheme(definition)] || TERRAIN_COLORS.meadow, roughness: 1 }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.075;
  addMapObject(base);
  for (const surface of createGroundSurfaces(definition)) addMapObject(surface);
  buildConstructionGroundBatches();

  forestTreeSlots = addObstacleEnvironmentSprites(definition, MAP_HALF_X, MAP_HALF_Z, addMapObject);
  const stumpPositions = [...forestTreeSlots].filter(([, slot]) => !slot.stateMeshes && !slot.atlas).map(([cell, slot], index) => {
    forestStumpSlots.set(cell, {
      index, x: slot.x, z: slot.z, scale: slot.scale * 0.48,
      flip: slot.flip, visible: false,
    });
    return { x: slot.x, z: slot.z, scale: 0, flip: slot.flip };
  });
  forestStumpMesh = createEnvironmentSpriteInstances('oak-depleted', 4.1, 3.75, stumpPositions);
  if (forestStumpMesh) {
    forestStumpMesh.visible = false;
    addMapObject(forestStumpMesh);
  }

  // Town Centers are authoritative entities reconciled from match snapshots.
  buildWoodNodeInstances(definition.resourceNodes || []);
  buildBerryNodeInstances(definition.resourceNodes || []);
  for (const node of definition.resourceNodes || []) {
    addResourceNodeVisual(node);
    latestResourceStocks.set(node.id, node.stock);
  }
  resizeResourceCallouts();

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
    label.textContent = validCompletionTrigger(event.trigger) ? 'COMPLETION EVENT' : event.trigger?.type === 'region-entry' ? 'REGION EVENT'
      : event.trigger?.type === 'capture' ? 'CAPTURE EVENT'
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
      rewards.push(TECHNOLOGY_DEFINITIONS[event.technologyReward]?.label || event.technologyReward);
    }
    const objective = event.trigger?.type === 'capture'
      ? definition.triggers.find((trigger) => trigger.id === event.trigger.objectiveId) : null;
    const sourceEvents = eventSourceIds.map((sourceId) => (
      scenarioEvents.find((source) => source.id === sourceId)
    )).filter(Boolean);
    const triggerLabel = validCompletionTrigger(event.trigger) ? `ON ${event.trigger.type.toUpperCase()} · ${event.trigger.buildingType || event.trigger.technologyId} · ${event.afterSeconds}s DELAY · ` : event.trigger?.type === 'region-entry'
      ? `ON REACHING ${definition.regions?.find((region) => region.id === event.trigger.regionId)?.name?.toUpperCase() || event.trigger.regionId} · ${event.afterSeconds}s DELAY · `
      : objective
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
  if (summary) summary.textContent = 'Open objectives for the win rule';
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
  objectiveHoldSummary = null;
  noticeHistory = [];
  document.querySelector('#notice-history').replaceChildren();
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
  const elevationLegend = document.querySelector('#minimap-elevation-legend');
  const elevationPatches = definition.elevationPatches || [];
  if (elevationLegend) elevationLegend.hidden = !elevationPatches.some((patch) => patch.level > 0);
  for (const patch of elevationPatches) {
    if (patch.level <= 0) continue;
    context.fillStyle = ELEVATION_LEVEL_COLORS[patch.level];
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

  context.fillStyle = '#727e5a';
  for (const [cell, stock] of latestForestStocks) {
    if (stock > 0) continue;
    const column = cell % MAP_WIDTH;
    const row = Math.floor(cell / MAP_WIDTH);
    context.fillRect(
      rect.left + column * rect.scale,
      rect.top + row * rect.scale,
      Math.max(1, rect.scale),
      Math.max(1, rect.scale),
    );
  }

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
  mapFitActive = false;
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

function createGroundSilhouette(polygons, baseColor = 0xf3e8cd, polygonColors = {}, polygonLifts = {}) {
  const positions = [];
  const colors = [];
  const indices = [];
  for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex++) {
    const points = polygons[polygonIndex];
    const polygonColor = new THREE.Color(polygonColors[polygonIndex] ?? baseColor);
    // Negative local depth becomes positive world height after the ground-plane rotation.
    const polygonLift = polygonLifts[polygonIndex] ?? 0;
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) shape.lineTo(x, y);
    shape.closePath();
    const part = new THREE.ShapeGeometry(shape);
    const attribute = part.getAttribute('position');
    const partIndex = part.getIndex();
    const offset = positions.length / 3;
    for (let index = 0; index < attribute.count; index++) {
      positions.push(attribute.getX(index), attribute.getY(index), attribute.getZ(index) - polygonLift);
      colors.push(polygonColor.r, polygonColor.g, polygonColor.b);
    }
    if (partIndex) {
      for (let index = 0; index < partIndex.count; index++) indices.push(offset + partIndex.getX(index));
    } else {
      for (let index = 0; index < attribute.count; index++) indices.push(offset + index);
    }
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createUnitBoxAssembly(parts) {
  const positions = [], normals = [];
  for (const [w, h, d, x, y, z] of parts) {
    const part = new THREE.BoxGeometry(w, h, d).toNonIndexed(); part.translate(x, y, z);
    positions.push(...part.attributes.position.array); normals.push(...part.attributes.normal.array); part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}
function createMountGeometry() {
  return createUnitBoxAssembly([
    [0.46, 0.42, 0.85, 0, 0.66, 0], [0.28, 0.46, 0.24, 0, 0.92, 0.4],
    [0.25, 0.23, 0.42, 0, 1.12, 0.52],
    ...[-0.16, 0.16].flatMap(x => [-0.3, 0.3].map(z => [0.11, 0.47, 0.11, x, 0.24, z])),
  ]);
}
function createSiegeGeometry() {
  return createUnitBoxAssembly([
    [0.7, 0.18, 0.95, 0, 0.38, 0], [0.15, 0.75, 0.15, 0, 0.82, 0],
    [0.18, 0.13, 1.1, 0, 1.13, 0.18], [0.3, 0.15, 0.3, 0, 1.16, 0.66],
    ...[-0.4, 0.4].flatMap(x => [-0.35, 0.35].map(z => [0.13, 0.4, 0.4, x, 0.22, z])),
  ]);
}

const unitLodRoleGeometries = {
  siege: createGroundSilhouette([
    [[-0.36, -0.5], [0.36, -0.5], [0.36, 0.5], [-0.36, 0.5]],
    [[-0.1, -0.25], [0.1, -0.25], [0.1, 0.85], [-0.1, 0.85]],
    [[-0.5, -0.4], [-0.36, -0.4], [-0.36, 0.4], [-0.5, 0.4]],
    [[0.36, -0.4], [0.5, -0.4], [0.5, 0.4], [0.36, 0.4]],
  ], 0x8b6947, { 1: 0xf3e8cd }),
  mounted: createGroundSilhouette([
    [[-0.28, -0.5], [0.28, -0.5], [0.28, 0.35], [0.16, 0.35], [0.16, 0.8], [-0.16, 0.8], [-0.16, 0.35], [-0.28, 0.35]],
    [[-0.14, -0.16], [0.14, -0.16], [0.14, 0.22], [-0.14, 0.22]],
  ], 0x8b6947, { 1: 0xf3e8cd }),
  worker: createGroundSilhouette([
    [[-0.14, -0.16], [-0.19, -0.05], [-0.16, 0.12], [-0.08, 0.21], [0.08, 0.21], [0.16, 0.12], [0.19, -0.05], [0.14, -0.16]],
    [[-0.12, 0.22], [-0.1, 0.31], [0.1, 0.31], [0.12, 0.22]],
    [[-0.18, -0.08], [-0.33, -0.2], [-0.28, -0.26], [-0.1, -0.14]],
    [[-0.25, -0.07], [-0.1, -0.09], [-0.07, 0.05], [-0.12, 0.17], [-0.24, 0.13], [-0.28, 0.02]],
    [[0.08, 0.1], [0.14, 0.03], [0.52, 0.45], [0.45, 0.52]],
    [[0.34, 0.55], [0.4, 0.63], [0.7, 0.38], [0.64, 0.31]],
  ], 0xf3e8cd, { 3: 0x9c754c, 4: 0x6f644d, 5: 0x6f644d }, { 3: 0.006 }),
  infantry: createGroundSilhouette([
    [[-0.14, -0.16], [-0.19, -0.05], [-0.16, 0.12], [-0.08, 0.21], [0.08, 0.21], [0.16, 0.12], [0.19, -0.05], [0.14, -0.16]],
    [[-0.1, 0.12], [-0.05, 0.72], [0, 0.98], [0.05, 0.72], [0.1, 0.12]],
    [[0.18, 0.12], [0.34, 0.22], [0.5, 0.13], [0.5, -0.18], [0.34, -0.4], [0.18, -0.18]],
  ], 0xf3e8cd, { 1: 0x5c5649, 2: 0x6f644d }),
  archer: createGroundSilhouette([
    [[-0.14, -0.16], [-0.19, -0.05], [-0.16, 0.12], [-0.08, 0.21], [0.08, 0.21], [0.16, 0.12], [0.19, -0.05], [0.14, -0.16]],
    [[0.18, 0.55], [0.43, 0.44], [0.61, 0.21], [0.64, 0], [0.61, -0.21], [0.43, -0.44], [0.18, -0.55], [0.29, -0.43], [0.47, -0.25], [0.51, 0], [0.47, 0.25], [0.29, 0.43]],
    [[-0.35, -0.24], [-0.21, -0.24], [-0.19, 0.38], [-0.33, 0.38]],
    [[-0.36, 0.35], [-0.29, 0.51], [-0.22, 0.35]],
    [[-0.35, 0.11], [-0.28, 0.31], [-0.21, 0.11]],
  ], 0xf3e8cd, { 1: 0xb88c58, 2: 0x75553d, 3: 0x75553d, 4: 0x75553d }),
};
const unitLodMarkerGeometries = [
  createGroundSilhouette([
    [[-0.5, 0.5], [0.5, 0.5], [0.5, 0.38], [-0.5, 0.38]],
    [[0.5, 0.38], [0.5, -0.38], [0.38, -0.38], [0.38, 0.38]],
    [[0.5, -0.5], [-0.5, -0.5], [-0.5, -0.38], [0.5, -0.38]],
    [[-0.5, -0.38], [-0.5, 0.38], [-0.38, 0.38], [-0.38, -0.38]],
  ]),
  createGroundSilhouette([
    [[0, 0.62], [0.46, 0], [0.32, 0], [0, 0.43]],
    [[0.46, 0], [0, -0.62], [0, -0.43], [0.32, 0]],
    [[0, -0.62], [-0.46, 0], [-0.32, 0], [0, -0.43]],
    [[-0.46, 0], [0, 0.62], [0, 0.43], [-0.32, 0]],
  ]),
];

for (let team = 0; team < 2; team++) {
  siegeMeshes[team] = makeInstances(createSiegeGeometry(), new THREE.MeshBasicMaterial({ color: TEAM_HEX[team] }), MAX_PER_TEAM);
  mountMeshes[team] = makeInstances(createMountGeometry(), new THREE.MeshBasicMaterial({ color: 0x8b6947 }), MAX_PER_TEAM);
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
  unitLodTeamMeshes[team] = makeInstances(
    unitLodMarkerGeometries[team],
    new THREE.MeshBasicMaterial({
      color: TEAM_HEX[team], side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false,
    }),
    MAX_PER_TEAM,
  );
  unitLodTeamMeshes[team].visible = false;
  unitLodTeamMeshes[team].renderOrder = 0.8;
  unitLodMeshesByTeam[team].push(unitLodTeamMeshes[team]);
  for (const role of UNIT_LOD_ROLES) {
    const mesh = makeInstances(
      unitLodRoleGeometries[role],
      new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide }),
      MAX_PER_TEAM,
    );
    mesh.visible = false;
    mesh.renderOrder = 1;
    unitLodRoleMeshes[team][role] = mesh;
    unitLodMeshesByTeam[team].push(mesh);
  }
}

function setUnitInstanceCount(team, count) {
  unitArtMeshes.forEach((pair) => { pair[team].count = count; });
  for (const mesh of unitLodMeshesByTeam[team]) mesh.count = count;
  unitSpriteRuntime.setCount(team, count);
}

function markUnitInstanceMatricesDirty(team) {
  if (unitSpritePreviewActive) unitSpriteRuntime.markTeamDirty(team);
  if (unitLowDetailActive) {
    const dirtyRoles = unitLodDirtyRoleMasks[team];
    for (const role of UNIT_LOD_ROLES) {
      if (dirtyRoles & UNIT_LOD_ROLE_BITS[role]) {
        unitLodRoleMeshes[team][role].instanceMatrix.needsUpdate = true;
      }
    }
    unitLodDirtyRoleMasks[team] = 0;
    if (unitLodTeamDirty[team]) {
      unitLodTeamMeshes[team].instanceMatrix.needsUpdate = true;
      unitLodTeamDirty[team] = false;
    }
  } else {
    unitArtMeshes.forEach((pair) => { pair[team].instanceMatrix.needsUpdate = true; });
  }
  flushUnitCargoPackColor(team);
}

function syncUnitDetailLevel() {
  const useLowDetail = zoom <= UNIT_LOD_ZOOM_THRESHOLD;
  const useUnitSprites = unitSpritePreviewRoles.length > 0 && unitSpriteReady;
  const useSpriteMarkers = useUnitSprites && zoom <= UNIT_SPRITE_MARKER_ZOOM_THRESHOLD;
  if (useLowDetail === unitLowDetailActive && useUnitSprites === unitSpritePreviewActive
    && useSpriteMarkers === unitSpriteMarkersActive) return;
  const restoreFullDetailTint = unitLowDetailActive && !useLowDetail;
  for (const pair of unitArtMeshes) {
    pair.forEach((mesh) => { mesh.visible = !useLowDetail; });
  }
  for (const team of unitLodMeshesByTeam) {
    for (const mesh of team) mesh.visible = useLowDetail;
  }
  unitLowDetailActive = useLowDetail;
  unitSpritePreviewActive = useUnitSprites;
  unitSpriteMarkersActive = useSpriteMarkers;
  unitSpriteRuntime.setVisible(useUnitSprites);
  const now = performance.now();
  for (const unit of units) {
    if (!unit) continue;
    if (restoreFullDetailTint) setUnitTint(unit, false);
    updateUnitTransform(unit, now);
  }
  if (restoreFullDetailTint) {
    for (let team = 0; team < 2; team++) {
      if (bodyMeshes[team].instanceColor) bodyMeshes[team].instanceColor.needsUpdate = true;
      if (headMeshes[team].instanceColor) headMeshes[team].instanceColor.needsUpdate = true;
    }
  }
  for (let team = 0; team < 2; team++) markUnitInstanceMatricesDirty(team);
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
const unitHealthBackground = makeInstances(
  new THREE.PlaneGeometry(1.22, 0.2),
  new THREE.MeshBasicMaterial({ color: 0x142018, depthTest: false, depthWrite: false }),
  MAX_UNITS,
);
const unitHealthFill = makeInstances(
  new THREE.PlaneGeometry(1.1, 0.1),
  new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false }),
  MAX_UNITS,
);
unitHealthBackground.renderOrder = 5;
unitHealthFill.renderOrder = 6;

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

function setUnitTint(unit, markBuffersDirty = true) {
  if (!shouldUpdateUnitFullDetailTint(unitLowDetailActive)) return false;
  const health = Math.max(0, unit.hp) / UNIT_DEFINITIONS[unit.kind].combat.maxHp;
  const strength = unit.hp > 0 ? 0.7 + health * 0.3 : unit.defeatStartedAt > 0 ? 0.58 : 0;
  const flashing = unit.damageFlashUntil > performance.now();
  color.setHex(TEAM_HEX[unit.team]);
  const presentation = unitPresentation(unit.kind);
  if (presentation.bodyTintWeight > 0) {
    color.lerp(unitPresentationTint.setHex(presentation.bodyTint), presentation.bodyTintWeight);
  }
  if (flashing) color.lerp(unitDamageFlashTint, 0.78);
  color.multiplyScalar(unit.tintVariation * strength);
  bodyMeshes[unit.team].setColorAt(unit.slot, color);
  color.setHex(presentation.headTint);
  if (flashing) color.lerp(unitDamageFlashTint, 0.82);
  color.multiplyScalar((0.91 + ((unit.id * 7) % 10) / 100) * strength);
  headMeshes[unit.team].setColorAt(unit.slot, color);
  if (markBuffersDirty) {
    bodyMeshes[unit.team].instanceColor.needsUpdate = true;
    headMeshes[unit.team].instanceColor.needsUpdate = true;
  }
  return true;
}

function updateUnitLodTransform(unit, visibleScale) {
  const role = unitPresentation(unit.kind).role;
  const roleUpdateMask = unitLodRoleMatrixUpdateMask(unit.lodRole, role);
  facing.setFromAxisAngle(worldUp, unit.angle);
  for (const roleName of UNIT_LOD_ROLES) {
    if (!(roleUpdateMask & UNIT_LOD_ROLE_BITS[roleName])) continue;
    dummy.position.set(unit.renderX, 0.07, unit.renderZ);
    dummy.quaternion.copy(facing);
    dummy.scale.setScalar(roleName === role ? visibleScale * 1.2 : 0);
    dummy.updateMatrix();
    unitLodRoleMeshes[unit.team][roleName].setMatrixAt(unit.slot, dummy.matrix);
    unitLodDirtyRoleMasks[unit.team] |= UNIT_LOD_ROLE_BITS[roleName];
  }
  unit.lodRole = role;
  dummy.position.set(unit.renderX, 0.035, unit.renderZ);
  dummy.quaternion.identity();
  dummy.scale.setScalar(visibleScale * 1.05);
  dummy.updateMatrix();
  unitLodTeamMeshes[unit.team].setMatrixAt(unit.slot, dummy.matrix);
  unitLodTeamDirty[unit.team] = true;
}

function updateUnitFocusVisual(unit) {
  const focused = unit.hp > 0 && unit.visible !== false && unit.targetedBy >= 2;
  const focusScale = focused
    ? unit.scale * (0.96 + Math.min(0.3, (unit.targetedBy - 2) * 0.018)) : 0;
  if (!shouldUpdateUnitFocusMatrix(unit.focusMatrixInitialized, unit.focused, focused,
    unit.focusVisualX, unit.focusVisualZ, unit.focusVisualScale,
    unit.renderX, unit.renderZ, focusScale)) return;
  dummy.position.set(unit.renderX, 0.03, unit.renderZ);
  dummy.quaternion.copy(ringRotation);
  dummy.scale.setScalar(focusScale);
  dummy.updateMatrix();
  attackFocusMesh.setMatrixAt(unit.focusSlot, dummy.matrix);
  unit.focused = focused;
  unit.focusVisualX = unit.renderX;
  unit.focusVisualZ = unit.renderZ;
  unit.focusVisualScale = focusScale;
  unit.focusMatrixInitialized = true;
  attackFocusDirty = true;
}

function updateUnitHealthVisual(unit) {
  const ratio = Math.max(0, Math.min(1, unit.hp / UNIT_DEFINITIONS[unit.kind].combat.maxHp));
  const visible = unit.visible !== false && ratio > 0 && ratio < 1;
  const scale = visible ? unit.scale : 0;
  if (unit.healthVisualScale === scale && (!visible
    || (unit.healthVisualRatio === ratio && unit.healthVisualX === unit.renderX
      && unit.healthVisualZ === unit.renderZ))) return;
  unit.healthVisualScale = scale;
  unit.healthVisualRatio = ratio;
  unit.healthVisualX = unit.renderX;
  unit.healthVisualZ = unit.renderZ;
  dummy.position.set(unit.renderX, unitPresentation(unit.kind).role === 'mounted' ? 2.1 : 1.55, unit.renderZ);
  dummy.quaternion.copy(camera.quaternion);
  dummy.scale.set(scale, scale, scale);
  dummy.updateMatrix();
  unitHealthBackground.setMatrixAt(unit.focusSlot, dummy.matrix);
  // Move the fill along camera-right so its left edge stays fixed as HP drops.
  dummy.translateX(-1.1 * scale * (1 - ratio) / 2);
  dummy.scale.set(scale * ratio, scale, scale);
  dummy.updateMatrix();
  unitHealthFill.setMatrixAt(unit.focusSlot, dummy.matrix);
  color.setHex(ratio > 0.55 ? 0x9bd77d : ratio > 0.25 ? 0xe3c46f : 0xe27461);
  unitHealthFill.setColorAt(unit.focusSlot, color);
  unitHealthBackground.instanceMatrix.needsUpdate = true;
  unitHealthFill.instanceMatrix.needsUpdate = true;
  unitHealthFill.instanceColor.needsUpdate = true;
}

function updateUnitTransform(unit, now = performance.now()) {
  updateUnitHealthVisual(unit);
  const spawnProgress = unit.spawnStartedAt > 0
    ? THREE.MathUtils.clamp((now - unit.spawnStartedAt) / SPAWN_POSE_MS, 0, 1) : 1;
  const spriteRole = castPreview ? unitSpriteRuntime.roleForUnit(unit) : unit.kind;
  const spriteDefeatMs = unitSpritePreviewActive && unitSpritePreviewRoleSet.has(unit.kind)
    ? unitSpriteRuntime.durationMs(spriteRole, 'defeat') : 0;
  const defeatElapsed = now - unit.defeatStartedAt;
  const defeatProgress = unit.defeatStartedAt > 0
    ? spriteDefeatMs > 0
      ? THREE.MathUtils.clamp((defeatElapsed - spriteDefeatMs) / 150, 0, 1)
      : THREE.MathUtils.clamp(defeatElapsed / DEFEAT_POSE_MS, 0, 1) : 0;
  const visibleScale = unit.visible === false ? 0 : unit.hp > 0
    ? unit.scale * (0.28 + spawnProgress * 0.72)
    : unit.defeatStartedAt > 0 ? unit.scale * (1 - defeatProgress) : 0;
  const presentationRole = unitPresentation(unit.kind).role;
  const isWorker = presentationRole === 'worker';
  const isArcher = presentationRole === 'archer';
  const isMounted = presentationRole === 'mounted';
  const isSiege = presentationRole === 'siege';
  const riderLift = isMounted ? 0.72 : 0;
  if (unitSpritePreviewActive && unitSpritePreviewRoleSet.has(unit.kind)) {
    updateUnitLodTransform(unit, unitSpriteMarkersActive ? visibleScale : 0);
    dummy.position.set(unit.renderX, 0, unit.renderZ);
    dummy.quaternion.identity();
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    unitArtMeshes.forEach((pair) => pair[unit.team].setMatrixAt(unit.slot, dummy.matrix));
    unitSpriteRuntime.update(unit, now, visibleScale);
    updateUnitCargoCueColor(unit);
    updateUnitFocusVisual(unit);
    return;
  }
  if (unitLowDetailActive) {
    updateUnitLodTransform(unit, visibleScale);
    updateUnitCargoCueColor(unit);
    updateUnitFocusVisual(unit);
    return;
  }
  const bodyScale = isSiege ? 0 : isWorker ? visibleScale * 0.82 : isArcher ? visibleScale * 0.9 : visibleScale;
  const actionPoseAllowed = unitActionPoseAllowed(unit.hp, unit.defeatStartedAt);
  const workerActionPose = actionPoseAllowed && isWorker
    ? unitWorkerActionPose(unit.kind, unit.visible, unit.task, unit.cargoType, unit.walking)
    : 'none';
  const stride = actionPoseAllowed && unit.walking ? Math.sin(unit.motionPhase || 0) * 0.038 : 0;
  const idleBreath = actionPoseAllowed && !unit.walking
    && unit.task !== 'gathering' && unit.task !== 'building' && unit.task !== 'repairing' && unit.attackStartedAt === 0
    ? Math.sin(now * 0.0024 + unit.id * 1.7) * 0.018 : 0;
  const attackAge = actionPoseAllowed && unit.attackStartedAt > 0
    ? (now - unit.attackStartedAt) / ATTACK_POSE_MS : 1;
  const attackPose = attackAge >= 0 && attackAge < 1 ? Math.sin(attackAge * Math.PI) : 0;
  const hitAge = actionPoseAllowed && unit.hitStartedAt > 0
    ? (now - unit.hitStartedAt) / HIT_POSE_MS : 1;
  const hitPose = hitAge >= 0 && hitAge < 1 ? Math.sin(hitAge * Math.PI) : 0;
  const workCycle = Math.sin(unit.motionPhase || 0);
  const workSwing = workerActionPose === 'chopping' ? workCycle * 0.66
    : workerActionPose === 'berry-gathering' ? workCycle * 0.14
      : workerActionPose === 'construction' ? workCycle * 0.46
        : workerActionPose === 'gathering' ? workCycle * 0.32
          : isWorker ? attackPose * 0.55 : 0;
  const forwardX = Math.sin(unit.angle);
  const forwardZ = Math.cos(unit.angle);
  const sideX = Math.cos(unit.angle);
  const sideZ = -Math.sin(unit.angle);
  facing.setFromAxisAngle(worldUp, unit.angle);
  dummy.position.set(unit.renderX + forwardX * (attackPose * 0.05 - hitPose * 0.075),
    (isWorker ? 0.23 : isArcher ? 0.25 : 0.27) + riderLift + Math.max(0, stride) + idleBreath
      - defeatProgress * 0.16,
    unit.renderZ + forwardZ * (attackPose * 0.05 - hitPose * 0.075));
  dummy.quaternion.copy(facing);
  const workLean = workerActionPose === 'berry-gathering' ? -0.075
    : workerActionPose === 'chopping' ? Math.max(0, workCycle) * 0.045 : 0;
  dummy.rotateX(attackPose * (isArcher ? -0.13 : 0.18) - hitPose * 0.18 + workLean);
  dummy.rotateZ(defeatProgress * 0.9);
  dummy.scale.setScalar(bodyScale);
  dummy.updateMatrix();
  bodyMeshes[unit.team].setMatrixAt(unit.slot, dummy.matrix);

  dummy.position.set(unit.renderX + sideX * defeatProgress * 0.16,
    (isWorker ? 0.48 : isArcher ? 0.54 : 0.61) + riderLift + Math.max(0, stride) + idleBreath * 0.7
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

  dummy.position.set(unit.renderX - sideX * 0.235 + forwardX * 0.1, 0.42 + riderLift + Math.max(0, stride),
    unit.renderZ - sideZ * 0.235 + forwardZ * 0.1);
  dummy.quaternion.copy(facing);
  dummy.rotateX(-attackPose * 0.16 + hitPose * 0.22);
  dummy.scale.setScalar(isWorker || isArcher || isSiege ? 0 : visibleScale);
  dummy.updateMatrix();
  shieldMeshes[unit.team].setMatrixAt(unit.slot, dummy.matrix);

  dummy.position.set(unit.renderX + sideX * 0.24, 0.57 + riderLift + Math.max(0, stride),
    unit.renderZ + sideZ * 0.24);
  dummy.quaternion.copy(facing);
  dummy.rotateX(attackPose * 0.66);
  dummy.scale.setScalar(isWorker || isArcher || isSiege ? 0 : visibleScale);
  dummy.updateMatrix();
  spearMeshes[unit.team].setMatrixAt(unit.slot, dummy.matrix);

  const berryReach = workerActionPose === 'berry-gathering' ? 0.075 : 0;
  dummy.position.set(unit.renderX + sideX * 0.265 + forwardX * berryReach,
    0.43 + Math.max(0, stride), unit.renderZ + sideZ * 0.265 + forwardZ * berryReach);
  dummy.quaternion.copy(facing);
  if (workerActionPose === 'berry-gathering') dummy.rotateX(-0.12 + workCycle * 0.06);
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

  dummy.position.set(unit.renderX, Math.max(0, stride), unit.renderZ);
  dummy.quaternion.copy(facing);
  dummy.rotateZ(defeatProgress * 0.9);
  dummy.scale.setScalar(isMounted ? visibleScale : 0);
  dummy.updateMatrix();
  mountMeshes[unit.team].setMatrixAt(unit.slot, dummy.matrix);
  dummy.rotateX(-attackPose * 0.07);
  dummy.scale.setScalar(isSiege ? visibleScale : 0);
  dummy.updateMatrix();
  siegeMeshes[unit.team].setMatrixAt(unit.slot, dummy.matrix);

  updateUnitCargoCueColor(unit);
  updateUnitFocusVisual(unit);
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
  for (let team = 0; team < 2; team++) setUnitInstanceCount(team, 0);
  arrowTraces.length = 0;
  arrowImpacts.length = 0;
  arrowMesh.count = 0;
  arrowImpactMesh.count = 0;
  attackFocusMesh.count = 0;
  unitHealthBackground.count = unitHealthFill.count = 0;
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
    setUnitInstanceCount(team, slot + 1);
    setUnitTint(unit);
    updateUnitTransform(unit);
    updateUnitCargoCueColor(unit);
  }
  for (let team = 0; team < 2; team++) {
    markUnitInstanceMatricesDirty(team);
    flushUnitCargoPackColor(team);
  }
  attackFocusMesh.count = nextAttackFocusSlot;
  unitHealthBackground.count = unitHealthFill.count = nextAttackFocusSlot;
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

function updateStationaryOrderControls(selectedBuilding) {
  const disabled = localTeam === null || matchWinner >= 0 || selectedIds().length === 0 || Boolean(selectedBuilding);
  for (const button of document.querySelectorAll('[data-stationary-order], [data-persistent-order]')) button.disabled = disabled;
}

function updateSelectionUI() {
  const selectedBuilding = latestBuildings.find((building) => building.id === selectedBuildingId
    && building.team === localTeam) || null;
  updateStationaryOrderControls(selectedBuilding);
  ui.selectedBuildingCard.hidden = !selectedBuilding;
  document.querySelector('#dock-selection').dataset.focus = selectedBuilding ? 'building' : 'units';
  if (selectedBuilding) {
    const maxHp = Math.max(1, Number(selectedBuilding.maxHp) || 1800);
    const hp = Math.max(0, Math.min(maxHp, Number(selectedBuilding.hp) || 0));
    const healthRatio = hp / maxHp;
    const construction = Math.round(Math.max(0, Math.min(1, Number(selectedBuilding.progress) || 0)) * 100);
    const queued = getBuildingQueueLength(selectedBuilding);
    const products = BUILDING_DEFINITIONS[selectedBuilding.type]?.products || [];
    const troop = selectedBuilding.productionQueue?.length
      ? UNIT_DEFINITIONS[selectedBuilding.productionQueue[0]].label
      : products.map((kind) => UNIT_DEFINITIONS[kind].label).join(' / ');
    const training = Math.round(Math.max(0, Math.min(1, Number(selectedBuilding.trainingProgress) || 0)) * 100);
    ui.selectedBuildingName.textContent = selectedBuilding.home ? 'TOWN CENTER · HOME' : `${buildingLabel(selectedBuilding.type)} #${selectedBuilding.id}`;
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
          : troop ? `Ready to train ${troop}.` : BUILDING_DEFINITIONS[selectedBuilding.type].dropoff?.length ? `Drop-off: ${BUILDING_DEFINITIONS[selectedBuilding.type].dropoff.join(' and ')}.` : `Population capacity +${BUILDING_DEFINITIONS[selectedBuilding.type].populationCapacity || 0}.`;
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
  const persistentCounts = new Map();
  for (const id of selectedIds()) {
    const order = units[id]?.persistentOrder;
    if (order) { const label = `${order.type.toUpperCase()}${order.status === 'blocked' ? ' BLOCKED' : ''}`;
      persistentCounts.set(label, (persistentCounts.get(label) || 0) + 1); }
  }
  const persistentSummary = document.querySelector('#selected-persistent-orders');
  if (persistentSummary) { persistentSummary.hidden = !persistentCounts.size;
    persistentSummary.textContent = [...persistentCounts].map(([label, count]) => `${count} ${label}`).join(' · '); }
  updateContextualCommands();
}

function updateContextualCommands() {
  updateBuildingLifecycleActions();
  const bar = document.querySelector('.contextual-command-bar');
  if (!bar) return;
  const building = latestBuildings.find((row) => row.id === selectedBuildingId && row.team === localTeam);
  const context = selectionContext(units, selected, localTeam, building);
  bar.dataset.context = context.kind;
  document.querySelector('#assign-selected-group').disabled = !context.total;
  bar.querySelector('[data-context-summary]').textContent = building
    ? `${buildingLabel(building.type)} · ${ui.selectedBuildingHealth.textContent} · ${ui.selectedBuildingProduction.textContent}`
    : context.total ? `${context.total} selected${context.kind === 'military' || context.kind === 'mixed' ? ` · ${ui.formationSelect.value} formation` : ''} · ${Object.entries(context.counts).filter(([, n]) => n).map(([role, n]) => `${n} ${role}`).join(' · ')}${context.counts.worker ? ` · Cargo ${formatResourceStock(context.cargo.food)} food / ${formatResourceStock(context.cargo.wood)} wood` : ''}` : '';
  for (const button of bar.querySelectorAll('[data-stationary-order], [data-persistent-order]')) {
    button.hidden = !['workers', 'military', 'mixed'].includes(context.kind);
  }
  updateRosterProductionOptions(bar.querySelector('[data-context-products]'), building);
  updateResearchOptions(bar.querySelector('[data-context-research-options]'), building);
  for (const button of bar.querySelectorAll('[data-context-proxy]')) {
    const source = document.getElementById(button.dataset.contextProxy);
    const action = button.dataset.contextProxy;
    button.hidden = action === 'order-target-toggle' && building && !BUILDING_DEFINITIONS[building.type]?.products.length ? true : action.startsWith('train-') ? true : action === 'order-target-toggle' ? context.kind === 'none'
      : action === 'attack-move-toggle' ? !['military', 'mixed'].includes(context.kind)
      : action === 'train-infantry' ? building?.type !== 'barracks'
      : action === 'train-archer' ? building?.type !== 'archery-range'
      : ['research-attack-upgrade', 'clear-building-rally'].includes(action) ? !building || source.hidden
      : action === 'select-workers' ? context.kind !== 'mixed' : false;
    button.disabled = source.disabled || (action.startsWith('train-') && building && (!building.complete || building.productionBlocked));
    if (source.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', source.getAttribute('aria-pressed'));
    if (action === 'order-target-toggle') button.textContent = tapOrderArmed ? 'Cancel target' : building ? 'Set rally' : context.kind === 'workers' ? 'Gather / move' : 'Target battlefield';
    if (action.startsWith('train-')) {
      button.setAttribute('aria-describedby', 'context-action-reason');
      const reason = !building?.complete ? 'Finish construction' : building.productionBlocked ? 'Clear spawn area'
        : source.disabled ? source.dataset.disabledReason || source.getAttribute('aria-label') : '';
      bar.querySelector('[data-context-reason]').textContent = button.hidden ? bar.querySelector('[data-context-reason]').textContent : reason;
    }
  }
  if (!building) bar.querySelector('[data-context-reason]').textContent = '';
  bar.querySelector('[data-context-build]').hidden = context.kind !== 'workers';
  bar.querySelector('[data-context-details]').hidden = context.kind === 'none' || Boolean(building && !BUILDING_DEFINITIONS[building.type]?.products.length);
  bar.querySelector('[data-context-details]').textContent = building ? 'Rally / upgrade details' : 'Formation / route';
  const research = bar.querySelector('[data-context-research]');
  research.hidden = !building || !BUILDING_DEFINITIONS[building.type]?.products.length;
  research.textContent = building ? `${ui.buildingRallyReadout.textContent} · ${ui.buildingResearchReadout.textContent}` : '';
  const groups = bar.querySelector('[data-context-groups]');
  for (let index = 0; index < 10; index++) {
    const button = groups.children[index];
    if (!button) continue;
    button.hidden = !controlGroups[index].size;
    button.textContent = `${controlGroupKeyLabel(index)} · ${controlGroups[index].size}`;
    button.setAttribute('aria-label', `Recall group ${controlGroupKeyLabel(index)}, ${controlGroups[index].size} units`);
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
    const compositionCount = Object.values(composition).reduce((sum, count) => sum + count, 0);
    const countElement = button.querySelector('.control-group-count');
    if (countElement) countElement.textContent = count.toLocaleString();
    button.classList.toggle('filled', count > 0);
    button.classList.toggle('has-composition', compositionCount > 0);
    button.style.setProperty('--group-worker-color', composition.worker > 0 ? '#76c596' : 'rgba(118,197,150,.14)');
    button.style.setProperty('--group-infantry-color', composition.infantry > 0 ? '#d5ef78' : 'rgba(213,239,120,.14)');
    button.style.setProperty('--group-archer-color', composition.archer > 0 ? '#efa071' : 'rgba(239,160,113,.14)');
    button.classList.toggle('active', activeControlGroup === index);
    button.setAttribute('aria-pressed', String(activeControlGroup === index));
    const compositionLabel = Object.entries(composition).filter(([, count]) => count > 0)
      .map(([kind, count]) => `${count.toLocaleString()} ${UNIT_DEFINITIONS[kind].label}`).join(', ') || 'empty';
    button.setAttribute('aria-label', `Control group ${number}: ${count.toLocaleString()} living friendly units; ${compositionLabel}`);
    button.title = `${count.toLocaleString()} living units · ${compositionLabel} · Ctrl/⌘ + ${number} replaces · Shift + ${number} adds · ${number} recalls`;
    button.disabled = localTeam === null;
  }
  updateContextualCommands();
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
  audio.playEvent({ cue: 'select', kind: groupUnits[0]?.kind });
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
  objectiveHoldSummary = hold;
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
    } else if (['capture', 'event', 'region-entry', 'construction-complete', 'research-complete'].includes(visual.event.trigger?.type)
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
      } else if (validCompletionTrigger(visual.event.trigger)) {
        visual.status.textContent = `WAITING FOR ${visual.event.trigger.buildingType || visual.event.trigger.technologyId} · TEAM ${visual.event.trigger.team}`;
      } else if (visual.event.trigger.type === 'region-entry') {
        const region = mapDefinition?.regions?.find((item) => item.id === visual.event.trigger.regionId);
        visual.status.textContent = `WAITING FOR ${region?.name?.toUpperCase() || 'REGION'}`;
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
        : ['capture', 'event', 'region-entry', 'construction-complete', 'research-complete'].includes(visual.event.trigger?.type)
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
  renderObjectiveSummary(elapsed);
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

function renderObjectiveSummary(elapsed = latestMatchElapsedSeconds) {
  const summary = objectiveSummary(mapDefinition || {}, [...latestObjectiveStates.values()], {
    team: localTeam, hold: objectiveHoldSummary, elapsed, started: latestScenarioClockStarted, winner: matchWinner,
  });
  document.querySelector('#map-summary').textContent = summary.action;
  const urgent = document.querySelector('#objective-urgent');
  urgent.textContent = summary.urgent;
  urgent.hidden = !summary.urgent;
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
    audio.playEvent({ cue: matchWinner === 2 ? 'draw' : matchWinner === localTeam ? 'victory' : 'defeat' });
  }
  matchWinnerReason = matchWinner >= 0 ? reason : null;
  if (matchWinner >= 0 && buildPlacementActive) cancelBuildPlacement(false);
  if (matchWinner >= 0) {
    attackMoveMode = false;
    persistentTargetMode = null;
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
  updateStationaryOrderControls(selectedBuilding);
  const rallyCell = Number.isInteger(selectedBuilding?.rallyCell) ? selectedBuilding.rallyCell : -1;
  const mode = selectedBuilding ? BUILDING_DEFINITIONS[selectedBuilding.type]?.products.length ? 'RALLY' : 'BUILDING' : persistentTargetMode ? persistentTargetMode.toUpperCase() : attackMoveMode ? 'ATTACK MOVE' : 'MOVE';
  if (ui.commandMode) {
    ui.commandMode.textContent = mode;
    ui.commandMode.dataset.mode = selectedBuilding ? 'rally' : attackMoveMode ? 'attack-move' : 'move';
  }
  if (ui.commandIcon) {
    const iconMode = selectedBuilding ? 'build' : attackMoveMode ? 'attack' : 'move';
    const fallbackGlyph = selectedBuilding ? '⚑' : attackMoveMode ? '⚔' : '⌖';
    const iconImage = ui.commandIcon.querySelector('.command-icon-image');
    const iconFallback = ui.commandIcon.querySelector('.command-icon-fallback');
    if (iconFallback) iconFallback.textContent = fallbackGlyph;
    if (iconImage) {
      const iconPath = `/assets/ui/icons/${iconMode}.svg`;
      if (iconImage.dataset.source !== iconPath) {
        iconImage.dataset.source = iconPath;
        ui.commandIcon.classList.remove('has-image');
        iconImage.onload = () => ui.commandIcon.classList.add('has-image');
        iconImage.onerror = () => ui.commandIcon.classList.remove('has-image');
        iconImage.src = iconPath;
      }
    }
    ui.commandIcon.classList.toggle('attack-move', !selectedBuilding && attackMoveMode);
  }
  if (ui.commandTitle) ui.commandTitle.textContent = selectedBuilding
    ? selectedBuilding.home ? 'TOWN CENTER · HOME' : `${buildingLabel(selectedBuilding.type)} #${selectedBuilding.id}`
    : persistentTargetMode === 'patrol' ? 'Patrol there and back' : persistentTargetMode === 'follow' ? 'Follow a friendly leader' : attackMoveMode ? 'Advance and engage' : 'Move or attack';
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const utilityBuilding = selectedBuilding && !BUILDING_DEFINITIONS[selectedBuilding.type]?.products.length;
  if (ui.commandHint) ui.commandHint.textContent = utilityBuilding ? BUILDING_DEFINITIONS[selectedBuilding.type].combat
      ? `Defends visible enemies within ${BUILDING_DEFINITIONS[selectedBuilding.type].combat.range} cells · ${BUILDING_DEFINITIONS[selectedBuilding.type].sight} sight.`
      : BUILDING_DEFINITIONS[selectedBuilding.type].dropoff
        ? 'Workers deposit food and wood here when complete.'
        : `Adds ${BUILDING_DEFINITIONS[selectedBuilding.type].populationCapacity || 0} population capacity when complete.` : tapOrderArmed
    ? selectedBuilding ? 'Tap or click ground to set the rally point'
      : attackMoveMode ? 'Tap or click ground to advance and engage' : 'Tap or click ground, an enemy, or a resource'
    : selectedBuilding ? coarsePointer ? 'Use Set rally point, then tap ground'
      : (rallyCell >= 0 ? 'Right-click ground to move the production rally' : 'Right-click ground to set a production rally')
      : coarsePointer ? 'Use Target battlefield, then tap a target'
        : attackMoveMode ? 'Right-click ground to advance and engage' : 'Right-click ground or an enemy';
  if (persistentTargetMode && ui.commandHint) ui.commandHint.textContent = `${tapOrderArmed ? 'Tap or click' : coarsePointer ? 'Use Target battlefield, then tap' : 'Right-click'} ${persistentTargetMode === 'follow' ? 'a friendly unit' : 'ground to set the second patrol endpoint'}`;
  for (const button of document.querySelectorAll('[data-persistent-order]')) {
    button.classList.toggle('active', button.dataset.persistentOrder === persistentTargetMode);
    button.setAttribute('aria-pressed', String(button.dataset.persistentOrder === persistentTargetMode));
  }
  if (ui.buildingCommandDetails) ui.buildingCommandDetails.hidden = !selectedBuilding || !BUILDING_DEFINITIONS[selectedBuilding.type]?.products.length;
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
  syncBattlefieldCursor();
  updateContextualCommands();
}

function syncTargetOrderUI() {
  if (!ui.orderTargetToggle) return;
  const selectedBuilding = latestBuildings.find((building) => building.id === selectedBuildingId
    && building.team === localTeam) || null;
  ui.orderTargetToggle.disabled = localTeam === null || matchWinner >= 0 || buildPlacementActive
    || Boolean(selectedBuilding && !BUILDING_DEFINITIONS[selectedBuilding.type]?.products.length);
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
  setUnitInstanceCount(team, slot + 1);
  attackFocusMesh.count = nextAttackFocusSlot;
  unitHealthBackground.count = unitHealthFill.count = nextAttackFocusSlot;
  setUnitTint(unit);
  updateUnitTransform(unit);
  updateUnitCargoCueColor(unit);
  return unit;
}

function applyState(state, initial = false) {
  const tracePanel = document.querySelector('#studio-scenario-diagnostics');
  tracePanel.hidden = !isHost || !Array.isArray(state?.scenarioTrace);
  if (!tracePanel.hidden) document.querySelector('#studio-scenario-trace').textContent = state.scenarioTrace.map(row =>
    `${row.name}: ${row.status.toUpperCase()} · ${row.deliveries} deliveries · ${JSON.stringify(row.reason)} · recipients ${row.recipients.join(',')} · activated ${row.activatedAtSeconds ?? 'pending'} by ${row.activatedByTeam}`).join('\n');
  if (state?.rulesetRevision && state.rulesetRevision !== GAMEPLAY_RULESET_REVISION) {
    showToast('GAME RULES CHANGED · RELOAD TO RECONNECT', 10000);
    return;
  }
  if (!state || (mapDefinition && state.mapId && state.mapId !== mapDefinition.id)) return;
  const matchRestarted = (matchWinner >= 0 && state.winner === -1)
    || (Number.isFinite(state.matchElapsedSeconds) && state.matchElapsedSeconds + 1 < latestMatchElapsedSeconds);
  const audioReset = initial || (state.armySize && state.armySize !== currentArmySize) || matchRestarted;
  // A same-size rematch drops trained units too. Rebuild render slots and local
  // selection before applying its authoritative roster, including on reconnect.
  if (state.armySize && (state.armySize !== currentArmySize || matchRestarted)) setArmySize(state.armySize);
  if (audioReset) { orderAudioGate.reset(); audio.stopWork(); }
  audio.updateWork(workAudioEvents(state.units, { localTeam, x: cameraTarget.x, z: cameraTarget.z }));
  for (const event of unitLifecycleAudioGate.observe({ units: state.units, tick: state.tick, localTeam, reset: audioReset })) audio.playEvent(event);
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
  if (Array.isArray(state.persistentOrders)) {
    for (const unit of units) if (unit) unit.persistentOrder = null;
    for (const [id, type, status, targetId] of state.persistentOrders) {
      if (units[id]?.team === localTeam) units[id].persistentOrder = { type, status, targetId };
    }
  }
  if (Array.isArray(state.queuedWaypointCounts)) applyWaypointQueueCounts(state.queuedWaypointCounts);
  if (initial || changed) {
    for (let team = 0; team < 2; team++) {
      markUnitInstanceMatricesDirty(team);
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
  applyForestState(state);
  if (Array.isArray(state.objectives)) updateObjectives(state.objectives);
  updateVictoryHoldCard(state.victoryHold, state.winner, state.winnerReason, state.scenarioClockStarted);
  updateScenarioEventCards(state.scenarioEvents || [], state.matchElapsedSeconds, state.scenarioClockStarted);
  const buildingDamage = Array.isArray(state.buildings) ? reconcileBuildings([...state.buildings, ...(state.homeTownCenters || [])], audioReset) : 0;
  if (audioReset) combatAudioGate.reset();
  else {
    const cue = combatAudioGate.observe({ friendlyDamage, selectedDamage, buildingDamage }, performance.now());
    if (cue) audio.playEvent({ cue });
  }
  if (Number.isInteger(state.winner)) {
    updateMatchResult(state.winner, state.winnerTriggerId, state.winnerReason);
  }
  if (Number.isInteger(state.connected)) updateRoomUI(state.connected);
  if (Array.isArray(state.population)) latestPopulation = state.population;
  if (Number.isFinite(state.rosterSize)) ui.total.textContent = state.rosterSize.toLocaleString();
  updateEconomyUI(state, audioReset);
  updateEnvironmentStateCaptureSnapshot(state);
  revalidateControlGroups();
  if (controlGroupsChanged) updateControlGroupUI();
  selectionDirty = true;
  syncSelectionMesh();
  updateSelectionUI();
}

function updateEnvironmentStateCaptureSnapshot(state) {
  if (roomPageUrl.searchParams.get('rendererCapture') !== 'environment-state') return;
  const resourceNodes = (Array.isArray(state.resourceNodes) ? state.resourceNodes : []).map((node) => {
    const definitionNode = mapDefinition?.resourceNodes?.find((row) => row.id === node.id);
    const visual = resourceNodeVisuals.get(node.id);
    const startingStock = definitionNode?.stock ?? visual?.startingStock ?? null;
    return {
      id: node.id, type: node.type, stock: node.stock, startingStock,
      stage: resourceVisualStage(node.stock, startingStock),
      x: definitionNode?.x ?? visual?.x ?? null, z: definitionNode?.z ?? visual?.z ?? null,
    };
  });
  const buildings = (Array.isArray(state.buildings) ? state.buildings : []).map((building) => ({
    id: building.id, team: building.team, type: building.type,
    x: building.x, z: building.z, progress: building.progress, complete: building.complete,
    groundStage: constructionGroundStage(building.progress, building.complete),
  }));
  const workerRows = (Array.isArray(state.units) ? state.units : []).filter((row) => row?.[5] === 'worker')
    .map((row) => ({ id: row[0], team: row[1], x: row[2], z: row[3], task: row[9] || 'idle' }));
  window.__rtsEnvironmentStateSnapshot = {
    mapId: state.mapId,
    team: localTeam,
    fogOfWar: state.fogOfWar === true,
    visibility: state.visibility || null,
    assetStatus: RESOURCE_STATE_ASSET_STATUS,
    resourceNodes,
    workers: workerRows,
    buildings,
    constructionDraws: [...constructionGroundMeshes].map(([stage, mesh]) => ({
      stage, count: mesh.count, visible: mesh.visible,
      buildingIds: buildings.filter((building) => building.groundStage === stage).map((building) => building.id),
    })),
  };
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

function updateRosterProductionOptions(container, selectedProducer = null, catalog = false) {
  if (!container) return;
  const products = selectedProducer ? BUILDING_DEFINITIONS[selectedProducer.type]?.products || []
    : catalog ? [...new Set(Object.values(BUILDING_DEFINITIONS).flatMap((definition) => definition.products || []))]
      .filter((kind) => !['worker', 'infantry', 'archer'].includes(kind)) : [];
  const key = products.join(',');
  if (container.dataset.products !== key) {
    container.replaceChildren();
    container.dataset.products = key;
    for (const kind of products) {
      const definition = UNIT_DEFINITIONS[kind];
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'economy-action'; button.dataset.product = kind;
      button.addEventListener('click', () => {
        const building = latestBuildings.find((row) => row.id === Number(button.dataset.producer));
        if (building) sendCommand({ type: 'trainUnit', kind, buildingId: building.id });
      });
      container.append(button);
    }
  }
  const alive = localTeam === null ? 0 : teamUnits[localTeam].filter((unit) => unit.hp > 0).length;
  const reserved = localTeam === null ? 0 : latestBuildings.filter((row) => row.team === localTeam && !row.home)
    .reduce((sum, row) => sum + getBuildingQueueLength(row), latestWorkerProduction[localTeam]?.queue || 0);
  const totalReserved = latestBuildings.filter((row) => !row.home).reduce((sum, row) => sum + getBuildingQueueLength(row), 0)
    + latestWorkerProduction.reduce((sum, row) => sum + (row?.queue || 0), 0);
  for (const button of container.children) {
    const definition = UNIT_DEFINITIONS[button.dataset.product];
    const producer = selectedProducer || latestBuildings.find((row) => row.team === localTeam && row.complete
      && !row.productionBlocked && getBuildingQueueLength(row) < BARRACKS_QUEUE_LIMIT
      && BUILDING_DEFINITIONS[row.type]?.products.includes(definition.id));
    const reason = localTeam === null ? 'Join a team' : matchWinner >= 0 ? 'Match finished'
      : !producer || !producer.complete ? 'Complete a production building'
      : producer.productionBlocked ? 'Clear spawn area'
      : getBuildingQueueLength(producer) >= BARRACKS_QUEUE_LIMIT ? 'Queue full'
      : alive + reserved >= MAX_PER_TEAM || latestRosterSize + totalReserved >= MAX_UNITS ? 'Unit cap reached'
      : latestFood[localTeam] < definition.cost.food || latestWood[localTeam] < definition.cost.wood
        ? `Need ${formatResourceRequirement(Math.max(0, definition.cost.food - latestFood[localTeam]))} food / ${formatResourceRequirement(Math.max(0, definition.cost.wood - latestWood[localTeam]))} wood` : '';
    const populationReason = localTeam !== null && latestPopulation[localTeam]
      && latestPopulation[localTeam].available < definition.population ? 'Population full · build a House' : '';
    button.dataset.producer = producer?.id ?? '';
    const authoritative = producer?.productionOptions?.find((option) => option.kind === definition.id);
    const authoritativeReason = authoritative && !authoritative.available ? authoritative.reason : '';
    button.disabled = Boolean(reason || populationReason || authoritativeReason);
    button.textContent = `Train ${definition.label} · ${definition.cost.food} food / ${definition.cost.wood} wood${reason || populationReason || authoritativeReason ? ` · ${authoritativeReason || reason || populationReason}` : ''}`;
  }
  container.hidden = products.length === 0;
}

function updateBuildingLifecycleActions() {
  const container = ui.buildingLifecycleActions;
  if (!container) return;
  const building = latestBuildings.find((row) => row.id === selectedBuildingId && row.team === localTeam);
  const active = building && latestTeamResearch[localTeam]?.active?.buildingId === building.id;
  const choices = !building ? [] : [
    ...(!building.complete ? [{ type: 'cancelConstruction', label: 'Cancel construction · refund unfinished work' }] : []),
    ...(building.complete && getBuildingQueueLength(building) > 0 ? [{ type: 'cancelTraining', label: 'Cancel last queued unit' }] : []),
    ...(active ? [{ type: 'cancelResearch', label: 'Cancel research · refund unfinished work' }] : []),
    ...(building.complete && building.hp < building.maxHp ? [{ type: 'repairBuilding', label: 'Repair with Workers · costs wood' }] : []),
  ];
  const signature = JSON.stringify([building?.id, choices.map((choice) => choice.type)]);
  if (container.dataset.signature !== signature) {
    container.dataset.signature = signature; container.replaceChildren();
    for (const choice of choices) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.action = choice.type; button.textContent = choice.label;
      button.addEventListener('click', () => {
        const command = { type: choice.type, buildingId: building.id };
        if (choice.type === 'repairBuilding') {
          command.ids = teamUnits[localTeam].filter((unit) => unit.hp > 0 && unit.kind === 'worker').map((unit) => unit.id);
        }
        if (choice.type === 'repairBuilding') sendTrackedOrder(command, 'REPAIR', command.ids.length, 'WORKERS');
        else sendCommand(command);
      });
      container.append(button);
    }
  }
  for (const button of container.children) button.disabled = matchWinner >= 0
    || (button.dataset.action === 'repairBuilding' && !teamUnits[localTeam].some((unit) => unit.hp > 0 && unit.kind === 'worker'));
  if (ui.cancelWorkerTraining) ui.cancelWorkerTraining.disabled = localTeam === null || matchWinner >= 0 || !(latestWorkerProduction[localTeam]?.queue > 0);
}

function updateRosterBuildingOptions(container) {
  if (!container) return;
  const definitions = Object.values(BUILDING_DEFINITIONS).filter((definition) => !['house', 'barracks', 'archery-range'].includes(definition.id));
  if (container.children.length !== definitions.length) {
    container.replaceChildren();
    for (const definition of definitions) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'economy-action build-action'; button.dataset.building = definition.id;
      button.addEventListener('click', () => {
        if (buildPlacementActive && buildPlacementType === definition.id) cancelBuildPlacement();
        else beginBuildPlacement(definition.id);
      });
      container.append(button);
    }
  }
  for (const button of container.children) {
    const definition = BUILDING_DEFINITIONS[button.dataset.building];
    const workers = localTeam === null ? [] : teamUnits[localTeam].filter((unit) => unit.kind === 'worker' && unit.hp > 0);
    const missing = (definition.requires || []).filter((id) => !latestTeamResearch[localTeam]?.[TECHNOLOGY_DEFINITIONS[id].upgradeKey]);
    button.disabled = localTeam === null || matchWinner >= 0 || buildPlacementPending || !workers.length || missing.length > 0
      || latestFood[localTeam] < definition.cost.food || latestWood[localTeam] < definition.cost.wood;
    button.textContent = `Build ${definition.label} · ${definition.cost.wood} WOOD${definition.cost.food ? ` + ${definition.cost.food} FOOD` : ''}${missing.length ? ' · RESEARCH REQUIRED' : ''}`;
    const active = buildPlacementActive && buildPlacementType === definition.id;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  }
}

function updateEconomyUI(state = {}, initial = false) {
  if (Array.isArray(state.population)) latestPopulation = state.population;
  if (Number.isFinite(state.rosterSize)) latestRosterSize = Math.max(0, Math.floor(state.rosterSize));
  if (Array.isArray(state.food)) latestFood = [Number(state.food[0]) || 0, Number(state.food[1]) || 0];
  if (Array.isArray(state.wood)) latestWood = [Number(state.wood[0]) || 0, Number(state.wood[1]) || 0];
  if (Array.isArray(state.workerProduction)) {

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
  if (ui.foodStock) ui.foodStock.textContent = localTeam === null ? '—' : formatResourceStock(latestFood[localTeam]);
  if (ui.woodStock) ui.woodStock.textContent = localTeam === null ? '—' : formatResourceStock(latestWood[localTeam]);
  const ownedUnits = localTeam === null ? [] : teamUnits[localTeam].filter((unit) => unit.hp > 0);
  const teamRosterCount = ownedUnits.length;
  const queuedByTeam = localTeam === null ? 0 : latestBuildings
    .filter((building) => building.team === localTeam && !building.home)
    .reduce((sum, building) => sum + getBuildingQueueLength(building), 0)
    + (latestWorkerProduction[localTeam]?.queue || 0);
  const queuedTotal = latestBuildings.filter((building) => !building.home).reduce((sum, building) => sum + getBuildingQueueLength(building), 0)
    + latestWorkerProduction.reduce((sum, production) => sum + (production?.queue || 0), 0);
  const populationFull = localTeam !== null && latestPopulation[localTeam]?.available === 0;
  const unitCapReached = populationFull || teamRosterCount + queuedByTeam >= MAX_PER_TEAM
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
    : `WORKER CARGO · ${formatResourceStock(carriedFood)} FOOD · ${formatResourceStock(carriedWood)} WOOD`;
  if (ui.trainInfantry) {
    ui.trainInfantry.disabled = localTeam === null || matchWinner >= 0 || !trainableBarracks
      || infantryQueueLength >= BARRACKS_QUEUE_LIMIT || food < INFANTRY_FOOD_COST || unitCapReached;
    ui.trainInfantry.setAttribute('aria-label', `Queue infantry for ${formatResourceRequirement(INFANTRY_FOOD_COST)} food${
      trainableBarracks ? `, queue ${infantryQueueLength} of ${BARRACKS_QUEUE_LIMIT}` : ', requires a completed Barracks with an open queue slot'
    }${unitCapReached ? ', unit cap reached' : ''}`);
  }
  if (ui.buildBarracks) {
    ui.buildBarracks.disabled = localTeam === null || matchWinner >= 0 || wood < BARRACKS_WOOD_COST
      || ownedWorkers.length === 0 || buildPlacementPending;
    ui.buildBarracks.classList.toggle('active', buildPlacementActive && buildPlacementType === 'barracks');
    ui.buildBarracks.setAttribute('aria-pressed', String(buildPlacementActive && buildPlacementType === 'barracks'));
    ui.buildBarracks.setAttribute('aria-label', `Build Barracks for ${formatResourceRequirement(BARRACKS_WOOD_COST)} wood${
      ownedWorkers.length === 0 ? ', no living workers' : ''
    }`);
  }
  if (ui.buildRange) {
    const selectedWorkerCount = ownedWorkers.length;
    ui.buildRange.disabled = localTeam === null || matchWinner >= 0 || wood < ARCHERY_RANGE_WOOD_COST
      || selectedWorkerCount === 0 || buildPlacementPending;
    ui.buildRange.classList.toggle('active', buildPlacementActive && buildPlacementType === 'archery-range');
    ui.buildRange.setAttribute('aria-pressed', String(buildPlacementActive && buildPlacementType === 'archery-range'));
    ui.buildRange.setAttribute('aria-label', `Build archery range for ${formatResourceRequirement(ARCHERY_RANGE_WOOD_COST)} wood${
      selectedWorkerCount === 0 ? ', no living workers' : ''
    }`);
  }
  const workerProduction = localTeam === null ? null : latestWorkerProduction[localTeam];
  const workerQueue = Math.max(0, Math.floor(workerProduction?.queue || 0));
  const homeCenter = latestBuildings.find((building) => building.home && building.team === localTeam);
  if (ui.trainWorker) {
    ui.trainWorker.disabled = localTeam === null || matchWinner >= 0
      || !homeCenter || food < WORKER_FOOD_COST || workerQueue >= WORKER_QUEUE_LIMIT || unitCapReached;
    ui.trainWorker.setAttribute('aria-label', 'Queue worker for ' + formatResourceRequirement(WORKER_FOOD_COST) + ' food'
      + (workerQueue > 0 ? ', queue ' + workerQueue + ' of ' + WORKER_QUEUE_LIMIT : '')
      + (unitCapReached ? ', unit cap reached' : ''));
  }
  if (ui.trainArcher) {
    ui.trainArcher.disabled = localTeam === null || matchWinner >= 0 || !trainableRange
      || queueLength >= ARCHERY_RANGE_QUEUE_LIMIT || food < ARCHER_FOOD_COST || wood < ARCHER_WOOD_COST
      || unitCapReached;
    ui.trainArcher.setAttribute('aria-label', `Queue archer for ${formatResourceRequirement(ARCHER_FOOD_COST)} food and ${formatResourceRequirement(ARCHER_WOOD_COST)} wood${
      trainableRange ? `, queue ${queueLength} of ${ARCHERY_RANGE_QUEUE_LIMIT}` : ', requires a completed archery range'
    }`);
  }
  if (ui.selectWorkers) ui.selectWorkers.disabled = localTeam === null
    || ownedWorkers.length === 0;
  if (ui.selectIdleWorkers) {
    const quickIdle = document.querySelector('#quick-idle');
    quickIdle.disabled = idleWorkerIds.length === 0;
    quickIdle.textContent = `Idle · ${idleWorkerIds.length}`;
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
      ui.barracksStatus.textContent = `No Barracks built · ${formatResourceRequirement(BARRACKS_WOOD_COST)} wood · ${formatResourceRequirement(INFANTRY_FOOD_COST)} food / infantry · ${INFANTRY_TRAIN_SECONDS}s`;
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
      + formatResourceRequirement(WORKER_FOOD_COST) + ' FOOD · ' + WORKER_TRAIN_SECONDS + 'S';
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
  for (const [button, costFood, costWood, producer, queue, limit] of [
    [ui.trainWorker, WORKER_FOOD_COST, 0, homeCenter, workerQueue, WORKER_QUEUE_LIMIT],
    [ui.trainInfantry, INFANTRY_FOOD_COST, 0, trainableBarracks, infantryQueueLength, BARRACKS_QUEUE_LIMIT],
    [ui.trainArcher, ARCHER_FOOD_COST, ARCHER_WOOD_COST, trainableRange, queueLength, ARCHERY_RANGE_QUEUE_LIMIT],
  ]) {
    if (!button) continue;
    const reason = localTeam === null ? 'Join a team' : matchWinner >= 0 ? 'Match finished'
      : !producer ? 'Complete a production building with spawn space'
      : queue >= limit ? 'Queue full' : unitCapReached ? populationFull ? 'Population full · build a House' : 'Unit cap reached'
      : food < costFood || wood < costWood ? `Need ${formatResourceRequirement(Math.max(0, costFood - food))} food / ${formatResourceRequirement(Math.max(0, costWood - wood))} wood` : '';
    button.dataset.disabledReason = reason;
    let note = button.querySelector('.action-disabled-reason');
    if (!note) { note = document.createElement('small'); note.className = 'action-disabled-reason'; button.append(note); }
    note.textContent = reason;
  }
  if (ui.populationStatus) {
    const population = latestPopulation[localTeam];
    ui.populationStatus.textContent = population ? `POPULATION · ${population.used} USED + ${population.reserved} QUEUED / ${population.capacity}${population.available === 0 ? ' · BUILD A HOUSE' : ''}` : 'POPULATION · JOIN A TEAM';
  }
  if (ui.buildHouse) {
    ui.buildHouse.disabled = localTeam === null || matchWinner >= 0 || wood < BUILDING_DEFINITIONS.house.cost.wood || ownedWorkers.length === 0 || buildPlacementPending;
    ui.buildHouse.classList.toggle('active', buildPlacementActive && buildPlacementType === 'house');
    ui.buildHouse.setAttribute('aria-pressed', String(buildPlacementActive && buildPlacementType === 'house'));
  }
  updateBuildingLifecycleActions();
  updateRosterBuildingOptions(ui.rosterBuildingOptions);
  updateRosterProductionOptions(ui.rosterProductionOptions, null, true);
  updateCommandUI();
}

function updateRoomUI(connected) {
  connectedPlayers = connected;
  ui.playersOnline.textContent = `${connected} / 2 PLAYERS`;
  ui.networkStatus.parentElement.dataset.urgent = String(waitingForResume);
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
  ui.networkStatus.parentElement.dataset.urgent = String(['OFFLINE', 'RECONNECTING', 'SEAT ACTIVE ELSEWHERE', 'INVALID ROOM LINK', 'ROOM NOT FOUND'].includes(status));
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

const ELEVATION_LEVEL_COLORS = [null, 'rgba(255, 211, 109, .34)', 'rgba(246, 140, 90, .46)'];
const ELEVATION_EDITOR_TOOLS = new Set([
  'elevation:raise', 'elevation:lower', 'elevation:0', 'elevation:1', 'elevation:2',
]);
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
  const definition = withCurrentEditorElevation({
    ...editorDefinition,
    id: ui.studioId.value,
    name: ui.studioName.value,
    terrainBase: ui.studioTerrainBase.value,
    terrainPatches: compressEditorGround(),
    obstacles: compressEditorObstacles(),
    resourceNodes: JSON.parse(JSON.stringify(editorResourceNodes)),
    triggers: JSON.parse(JSON.stringify(editorTriggers)),
    scenarioEvents: JSON.parse(JSON.stringify(editorScenarioEvents)),
    regions: (() => { try { return readEditorRegions(); } catch { return editorDefinition.regions || []; } })(),
    audio: selectedStudioAudio({ allowIncomplete: true }),
  });
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
  ui.studioRegions.value = JSON.stringify(definition.regions || [], null, 2);
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
  setEditorTool(EDITOR_MATERIALS.includes(state.editorTool) || ['rock', 'cliff', 'ground-reset', 'erase', 'azure', 'ember', 'resource-food', 'resource-wood', 'objective', 'pan', 'region-draw', 'region-move', 'region-resize'].includes(state.editorTool)
    || ELEVATION_EDITOR_TOOLS.has(state.editorTool)
    || (typeof state.editorTool === 'string' && state.editorTool.startsWith('ground:')
      && TERRAIN_MATERIALS.includes(state.editorTool.slice(7)))
    ? state.editorTool : 'stone');
  restoreMapStudioFormValues(state.formValues);
  try { selectedEditorRegionId = readEditorRegions().some(r => r.id === state.formValues?.['studio-region-list']?.value) ? state.formValues['studio-region-list'].value : null; } catch { selectedEditorRegionId = null; }
  syncEditorRegionControls();
  scenarioEditHistory.clear(); recordScenarioEdit();
  void refreshStudioAudioPacks(state.formValues?.['studio-audio-pack']?.value
    ? { packId: state.formValues['studio-audio-pack'].value, profileId: state.formValues?.['studio-audio-profile']?.value || '' }
    : undefined);
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

function readEditorRegions() {
  let regions;
  try { regions = JSON.parse(ui.studioRegions.value || '[]'); }
  catch { throw new Error('Named regions must be valid JSON.'); }
  validateScenarioRegions({ ...editorDefinition, regions });
  return regions;
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
  const source = validCompletionTrigger(event.trigger) ? `${event.trigger.type.toUpperCase()} · ${event.trigger.buildingType || event.trigger.technologyId} · TEAM ${event.trigger.team}` : event.trigger?.type === 'region-entry'
    ? `REGION ${event.trigger.regionId} · ${event.trigger.minimumUnits ?? 1} ${event.trigger.unitKind || 'UNITS'}`
    : objective
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
    rewards.push(TECHNOLOGY_DEFINITIONS[event.technologyReward]?.label || event.technologyReward);
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
  } else if (ui.studioEventTrigger.value === 'region-entry') {
    event.trigger = { type: 'region-entry', regionId: ui.studioEventRegion.value,
      team: ui.studioEventRegionTeam.value, minimumUnits: Number(ui.studioEventRegionMinimum.value) };
    if (ui.studioEventRegionKind.value) event.trigger.unitKind = ui.studioEventRegionKind.value;
  } else if (['construction-complete', 'research-complete'].includes(ui.studioEventTrigger.value)) {
    const type = ui.studioEventTrigger.value;
    event.trigger = {type, team: document.querySelector('#studio-event-completion-team').value,
      [type === 'construction-complete' ? 'buildingType' : 'technologyId']: document.querySelector('#studio-event-completion-id').value};
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
  recordScenarioEdit();
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
  const completion = ['construction-complete', 'research-complete'].includes(event?.trigger?.type);
  document.querySelector('#studio-event-completion-control').hidden = !completion;
  const completionRegistry = event?.trigger?.type === 'research-complete' ? TECHNOLOGY_DEFINITIONS : BUILDING_DEFINITIONS;
  document.querySelector('#studio-event-completion-id').replaceChildren(new Option('Choose registered ID', ''), ...Object.entries(completionRegistry).map(([id, rule]) => new Option(rule.label, id)));
  document.querySelector('#studio-event-completion-id').value = event?.trigger?.buildingType || event?.trigger?.technologyId || '';
  document.querySelector('#studio-event-completion-team').value = event?.trigger?.team || 'either';
  ui.studioEventRegionKind.replaceChildren(new Option('Any living unit', ''),
    ...Object.entries(UNIT_DEFINITIONS).map(([kind, rules]) => new Option(rules.label || kind, kind)));
  let regionOptions = []; try { regionOptions = readEditorRegions(); } catch {}
  ui.studioEventRegion.replaceChildren(new Option('Choose a region', ''), ...regionOptions.map(r => new Option(`${r.name} · ${r.id}`, r.id)));
  if (event?.trigger?.regionId && !regionOptions.some(r => r.id === event.trigger.regionId)) ui.studioEventRegion.add(new Option(`Missing region: ${event.trigger.regionId}`, event.trigger.regionId));
  ui.studioEventRegion.value = event?.trigger?.regionId || '';
  ui.studioEventRegionTeam.value = event?.trigger?.team || 'either';
  ui.studioEventRegionKind.value = event?.trigger?.unitKind || '';
  ui.studioEventRegionMinimum.value = event?.trigger?.minimumUnits ?? 1;
  ui.studioEventRegionControl.hidden = event?.trigger?.type !== 'region-entry';
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
    ui.studioEventTrigger.value = event.trigger?.type || 'clock';
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
  ui.studioEventAfterLabel.firstChild.textContent = completion ? 'DELAY AFTER COMPLETION (SECONDS)' : captureTriggered
    ? 'DELAY AFTER CAPTURE (SECONDS)' : eventTriggered
      ? 'DELAY AFTER EVENT (SECONDS)' : event?.trigger?.type === 'region-entry'
        ? 'DELAY AFTER REGION REACHED (SECONDS)' : 'AFTER MATCH START (SECONDS)';
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
  recordScenarioEdit();
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
  recordScenarioEdit();
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

let audioLibraryStorePromise = null;
async function getAudioLibraryStore() {
  audioLibraryStorePromise ||= import('./audio-library-store.mjs')
    .then(({ createAudioLibraryStore }) => createAudioLibraryStore());
  return audioLibraryStorePromise;
}
let mapAudioRequest = 0;
async function loadMapAudio(reference) {
  const request = ++mapAudioRequest;
  if (!reference) { await audio.setMapAudio(null); return; }
  try {
    const store = reference.version ? null : await getAudioLibraryStore();
    if (request === mapAudioRequest) await audio.setMapAudio(reference, store);
  } catch (error) {
    if (request === mapAudioRequest) ui.audioPackStatus.textContent = `Audio library unavailable: ${error.message}. Synthesized feedback remains available.`;
  }
}
function selectedStudioAudio({ allowIncomplete = false } = {}) {
  const packId = ui.studioAudioPack.value;
  const profileId = ui.studioAudioProfile.value;
  if (!packId) return undefined;
  if (!profileId) {
    if (allowIncomplete) return undefined;
    throw new Error('Choose an audio profile for this map.');
  }
  const shipped = SHIPPED_AUDIO_REFERENCES.find((ref) => ref.packId === packId);
  return validateMapAudioReference({ ...(shipped || studioOriginalAudioReference?.packId === packId ? shipped || studioOriginalAudioReference : {}), packId, profileId });
}
let studioOriginalAudioReference = null;
let studioAudioPackRequest = 0;
let studioAudioProfileRequest = 0;
async function refreshStudioAudioPacks(reference) {
  studioOriginalAudioReference = reference || null;
  const request = ++studioAudioPackRequest;
  ++studioAudioProfileRequest;
  const select = ui.studioAudioPack;
  select.replaceChildren(new Option('Synthesized default', ''));
  if (reference) {
    select.add(new Option(`Loading pack: ${reference.packId}`, reference.packId));
    select.value = reference.packId;
    ui.studioAudioProfile.replaceChildren(new Option(`Loading profile: ${reference.profileId}`, reference.profileId));
  }
  try {
    const library = await getAudioLibraryStore();
    const packs = [...SHIPPED_AUDIO_REFERENCES.map((ref) => ({ id: ref.packId, name: 'Shipped feedback · technical test' })), ...await library.listPacks()];
    if (request !== studioAudioPackRequest) return;
    const chosen = select.value;
    select.replaceChildren(new Option('Synthesized default', ''));
    for (const pack of packs) select.add(new Option(pack.name || pack.id, pack.id));
    if (reference && !packs.some((pack) => pack.id === reference.packId)) {
      select.add(new Option(`Missing pack: ${reference.packId}`, reference.packId));
    }
    select.value = chosen;
    await refreshStudioAudioProfiles(chosen === reference?.packId ? reference?.profileId : '');
  } catch (error) {
    if (request !== studioAudioPackRequest) return;
    for (const ref of SHIPPED_AUDIO_REFERENCES) if (![...select.options].some((option) => option.value === ref.packId)) select.add(new Option('Shipped feedback · technical test', ref.packId));
    if (reference?.version) { select.value = reference.packId; await refreshStudioAudioProfiles(reference.profileId); return; }
    if (reference && select.value === reference.packId) {
      const existing = [...select.options].find((option) => option.value === reference.packId);
      if (existing) existing.text = `Missing pack: ${reference.packId}`;
      else select.add(new Option(`Missing pack: ${reference.packId}`, reference.packId));
      select.value = reference.packId;
      ui.studioAudioProfile.replaceChildren(new Option(`Missing profile: ${reference.profileId}`, reference.profileId));
    }
    ui.studioMessage.textContent = `Audio library unavailable: ${error.message}`;
  }
}
async function refreshStudioAudioProfiles(selectedId = '') {
  const request = ++studioAudioProfileRequest;
  const select = ui.studioAudioProfile;
  select.replaceChildren(new Option('Choose profile', ''));
  if (selectedId) {
    select.add(new Option(`Loading profile: ${selectedId}`, selectedId));
    select.value = selectedId;
  }
  const packId = ui.studioAudioPack.value;
  if (!packId) return;
  try {
    const shipped = SHIPPED_AUDIO_REFERENCES.find((ref) => ref.packId === packId);
    const loaded = shipped ? await (await import('./audio-shipped-loader.mjs')).loadShippedAudio(shipped) : await (await getAudioLibraryStore()).loadPack(packId);
    if (request !== studioAudioProfileRequest || packId !== ui.studioAudioPack.value) return;
    select.replaceChildren(new Option('Choose profile', ''));
    for (const profile of loaded?.pack?.profiles || []) select.add(new Option(profile.name || profile.id, profile.id));
    if (selectedId && ![...(loaded?.pack?.profiles || [])].some((profile) => profile.id === selectedId)) {
      select.add(new Option(`Missing profile: ${selectedId}`, selectedId));
    }
    select.value = selectedId || select.options[1]?.value || '';
  } catch (error) {
    if (request !== studioAudioProfileRequest || packId !== ui.studioAudioPack.value) return;
    if (selectedId) {
      select.replaceChildren(new Option('Choose profile', ''));
      select.add(new Option(`Missing profile: ${selectedId}`, selectedId));
      select.value = selectedId;
    }
    ui.studioMessage.textContent = `Audio profiles unavailable: ${error.message}`;
  }
}
ui.studioAudioPack.addEventListener('change', () => { void refreshStudioAudioProfiles(); scheduleMapStudioDraftSave(); });
ui.studioAudioProfile.addEventListener('change', scheduleMapStudioDraftSave);

function populateMapEditor(definition, message) {
  scenarioEditHistory.clear();
  selectedEditorRegionId = null;
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
  editorGroundLevels = buildElevationGrid(editorDefinition.width, editorDefinition.height,
    editorDefinition.elevationPatches);
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
  ui.studioRegions.value = JSON.stringify(editorDefinition.regions || [], null, 2);
  syncEditorRegionControls();
  selectedEditorTriggerId = editorTriggers[0]?.id || null;
  selectedEditorScenarioEventId = editorScenarioEvents[0]?.id || null;
  editorTriggerCreationPending = false;
  editorResourceNodes = JSON.parse(JSON.stringify(editorDefinition.resourceNodes || []));
  selectedEditorResourceId = null;
  ui.studioName.value = editorDefinition.name;
  ui.studioId.value = editorDefinition.id;
  ui.studioSummary.value = editorDefinition.summary || '';
  void refreshStudioAudioPacks(editorDefinition.audio);
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
  editorPanDrag = null;
  fitMapStudioViewport();
  setEditorTool('stone');
  recordScenarioEdit();
}

function validateImportedMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON must contain a map object.');
  const definition = JSON.parse(JSON.stringify(value));
  validateMapAudioReference(definition.audio);
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
  const invalidElevationPatches = validateElevationPatches(
    definition.width, definition.height, definition.elevationPatches,
  );
  if (invalidElevationPatches) {
    const reason = invalidElevationPatches.reason === 'limit' ? 'more than 4,096 patches'
      : invalidElevationPatches.reason === 'overlap' ? 'overlapping patches'
        : invalidElevationPatches.reason === 'level' ? 'a level outside 0–2'
          : invalidElevationPatches.reason === 'bounds' ? 'a patch outside the map grid'
            : 'an invalid patch list';
    throw new Error(`Map has invalid elevation patches: ${reason}.`);
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
  const elevationLevels = (definition.elevationPatches || []).some((patch) => patch.level > 0)
    ? buildElevationGrid(definition.width, definition.height, definition.elevationPatches) : null;
  const unreachableNode = findUnreachableResourceNode(
    definition.width, definition.height, blockedCells, definition.spawnPoints, definition.resourceNodes,
    elevationLevels,
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
      || (trigger.unitKind !== undefined && !Object.hasOwn(UNIT_DEFINITIONS, trigger.unitKind))
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
    elevationLevels,
  );
  if (unreachableTrigger) {
    throw new Error(`Capture zone ${unreachableTrigger.triggerId} is unreachable from team ${unreachableTrigger.team}.`);
  }
  const regions = validateScenarioRegions(definition);
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
    if (['construction-complete', 'research-complete'].includes(eventTrigger?.type) && !validCompletionTrigger(eventTrigger)) throw new Error(`Event ${event.id}: choose a registered ${eventTrigger.type === 'construction-complete' ? 'buildingType' : 'technologyId'} and team.`);
    if (eventTrigger?.type === 'region-entry' && !regions.some(r => r.id === eventTrigger.regionId)) throw new Error(`Event ${event.id}: trigger.regionId must reference an existing named region.`);
    const validEventTrigger = eventTrigger === undefined || validCaptureTrigger || validEventChain || validRegionEntryTrigger(eventTrigger, regions) || validCompletionTrigger(eventTrigger);
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
      || (event.unitKind !== undefined && !Object.hasOwn(UNIT_DEFINITIONS, event.unitKind))
      || (event.technologyReward !== undefined
        && !Object.hasOwn(TECHNOLOGY_DEFINITIONS, event.technologyReward))
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

function isElevationEditorTool(tool) {
  return ELEVATION_EDITOR_TOOLS.has(tool);
}

function elevationBrushTarget(tool, currentLevel) {
  if (tool === 'elevation:raise') return Math.min(2, currentLevel + 1);
  if (tool === 'elevation:lower') return Math.max(0, currentLevel - 1);
  return Number(tool.slice('elevation:'.length));
}

function setEditorTool(tool) {
  editorTool = tool;
  ui.studioGrid.dataset.editorTool = tool;
  for (const button of document.querySelectorAll('[data-map-tool]')) {
    const active = button.dataset.mapTool === tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  const hints = {
    rock: 'DRAG TO PAINT LOW ROCK OUTCROPS', stone: 'DRAG TO PAINT BASALT RIDGES',
    cliff: 'DRAG TO PAINT TALL CLIFFS', forest: 'DRAG TO PAINT FOREST', water: 'DRAG TO PAINT WATER',
    'ground-reset': 'DRAG TO BRUSH THE BASE GROUND MATERIAL',
    erase: 'DRAG TO CLEAR TERRAIN', azure: 'CLICK TO PLACE AZURE SPAWN',
    ember: 'CLICK TO PLACE EMBER SPAWN', 'resource-food': 'CLICK EMPTY CELL TO PLACE · CLICK NODE TO EDIT',
    'resource-wood': 'CLICK EMPTY CELL TO PLACE · CLICK NODE TO EDIT',
    pan: 'DRAG TO PAN · WHEEL TO ZOOM',
    'region-draw': 'DRAG TO DRAW A NAMED REGION',
    'region-move': 'DRAG INSIDE A REGION TO SELECT AND MOVE IT',
    'region-resize': 'DRAG THE LOWER-RIGHT EXTENT TO RESIZE A REGION',
    'elevation:raise': 'DRAG TO RAISE GROUND ONE LEVEL · MAX 2',
    'elevation:lower': 'DRAG TO LOWER GROUND ONE LEVEL · MIN 0',
    'elevation:0': 'DRAG TO LEVEL GROUND AT 0',
    'elevation:1': 'DRAG TO LEVEL GROUND AT 1',
    'elevation:2': 'DRAG TO LEVEL GROUND AT 2',
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

function mapStudioViewportSize() {
  const viewport = ui.studioGridViewport;
  const style = window.getComputedStyle(viewport);
  const borderWidth = Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);
  const borderHeight = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
  return {
    width: Math.max(0, viewport.offsetWidth - borderWidth),
    height: Math.max(0, viewport.offsetHeight - borderHeight),
  };
}

function updateMapStudioZoomControls() {
  ui.studioGridZoomLevel.value = `${Math.round(editorViewZoom * 100)}%`;
  ui.studioGridZoomOut.disabled = editorViewZoom <= MIN_MAP_STUDIO_ZOOM;
  ui.studioGridZoomIn.disabled = editorViewZoom >= MAX_MAP_STUDIO_ZOOM;
}

function setMapStudioZoom(zoom, anchorX, anchorY) {
  if (!editorDefinition) return;
  const viewport = ui.studioGridViewport;
  const fromZoom = editorViewZoom;
  const toZoom = clampMapStudioZoom(zoom);
  if (toZoom === fromZoom) return;
  const x = Number.isFinite(anchorX) ? anchorX : viewport.clientWidth / 2;
  const y = Number.isFinite(anchorY) ? anchorY : viewport.clientHeight / 2;
  const scroll = mapStudioScrollAtZoom({
    scrollLeft: viewport.scrollLeft,
    scrollTop: viewport.scrollTop,
    anchorX: x,
    anchorY: y,
    fromZoom,
    toZoom,
  });
  editorViewZoom = toZoom;
  updateMapStudioZoomControls();
  drawEditorGrid();
  if (scroll) {
    viewport.scrollLeft = scroll.left;
    viewport.scrollTop = scroll.top;
  }
}

function fitMapStudioViewport() {
  editorViewZoom = MIN_MAP_STUDIO_ZOOM;
  updateMapStudioZoomControls();
  ui.studioGridViewport.scrollLeft = 0;
  ui.studioGridViewport.scrollTop = 0;
  drawEditorGrid();
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
  const resizedGroundLevels = new Uint8Array(width * height);
  const resizedElevations = new Float64Array(width * height);
  resizedElevations.fill(1.12);
  for (let row = 0; row < Math.min(height, oldHeight); row++) {
    for (let column = 0; column < Math.min(width, oldWidth); column++) {
      resized[row * width + column] = editorCellMaterials[row * oldWidth + column];
      resizedGround[row * width + column] = editorGroundMaterials[row * oldWidth + column];
      resizedGroundLevels[row * width + column] = editorGroundLevels[row * oldWidth + column];
      resizedElevations[row * width + column] = editorCellElevations[row * oldWidth + column];
    }
  }
  editorCellMaterials = resized;
  editorGroundMaterials = resizedGround;
  editorGroundLevels = resizedGroundLevels;
  editorCellElevations = resizedElevations;
  const regions = readEditorRegions();
  editorDefinition.width = width;
  editorDefinition.height = height;
  for (const region of regions) {
    region.zone.column = Math.min(width-1,region.zone.column); region.zone.row = Math.min(height-1,region.zone.row);
    region.zone.width = Math.min(region.zone.width,width-region.zone.column); region.zone.height = Math.min(region.zone.height,height-region.zone.row);
  }
  scenarioEditHistory.clear(); writeEditorRegions(regions);
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
  return mapStudioCellAtPointer({
    clientX: event.clientX,
    clientY: event.clientY,
    rect: ui.studioGrid.getBoundingClientRect(),
    mapWidth: editorDefinition.width,
    mapHeight: editorDefinition.height,
  });
}

function updateMapStudioCellReadout(cell) {
  ui.studioGridPosition.textContent = cell
    ? `CELL ${cell.column + 1}, ${cell.row + 1} · LEVEL ${editorGroundLevels[cell.row * editorDefinition.width + cell.column]}`
    : 'CELL —';
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

function paintEditorElevationStroke(drag, next) {
  const from = drag.current;
  const steps = Math.max(Math.abs(next.column - from.column), Math.abs(next.row - from.row));
  const radius = (Number(ui.studioElevationBrushSize.value) - 1) / 2;
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
  const viewportSize = mapStudioViewportSize();
  const size = mapStudioCanvasSize({
    mapWidth: editorDefinition.width,
    mapHeight: editorDefinition.height,
    viewportWidth: viewportSize.width,
    viewportHeight: viewportSize.height,
    zoom: editorViewZoom,
  });
  if (!size || size.width < 2 || size.height < 2) return;
  canvas.style.width = `${size.width}px`;
  canvas.style.height = `${size.height}px`;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, editorViewZoom > 2 ? 1 : 2);
  const pixelWidth = Math.round(size.width * pixelRatio);
  const pixelHeight = Math.round(size.height * pixelRatio);
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
  const cellPixels = Math.min(size.width / editorDefinition.width, size.height / editorDefinition.height);
  for (let row = 0; row < editorDefinition.height; row++) {
    for (let column = 0; column < editorDefinition.width; column++) {
      const index = row * editorDefinition.width + column;
      const ground = editorGroundMaterials[index];
      if (ground >= 0) {
        context.fillStyle = TERRAIN_COLORS[TERRAIN_MATERIALS[ground]];
        context.fillRect(column, row, 1, 1);
      }
      const level = editorGroundLevels[index];
      if (level > 0) {
        context.fillStyle = ELEVATION_LEVEL_COLORS[level];
        context.fillRect(column, row, 1, 1);
        if (cellPixels >= 10 && editorCellMaterials[index] < 0) {
          context.fillStyle = 'rgba(24, 28, 20, .92)';
          context.font = '0.55px monospace';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(String(level), column + 0.5, row + 0.5);
        }
      }
      const material = editorCellMaterials[index];
      if (material < 0) continue;
      context.fillStyle = EDITOR_MATERIAL_COLORS[material] || EDITOR_MATERIAL_COLORS[0];
      context.fillRect(column, row, 1, 1);
      context.fillStyle = 'rgba(230,238,210,.11)';
      context.fillRect(column + 0.06, row + 0.06, 0.88, 0.08);
    }
  }
  context.textAlign = 'start';
  context.textBaseline = 'alphabetic';
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
  // Invalid in-progress JSON remains editable and autosaved; only valid rectangles are previewed.
  try {
    for (const region of readEditorRegions()) {
      const { column, row, width, height } = region.zone;
      context.save();
      context.fillStyle = 'rgba(203, 143, 247, .15)';
      context.fillRect(column, row, width, height);
      context.strokeStyle = '#ce9af3';
      context.lineWidth = region.id === selectedEditorRegionId ? 0.25 : 0.12;
      context.setLineDash([0.4, 0.3]);
      context.strokeRect(column, row, width, height);
      context.setLineDash([]);
      context.font = '0.8px sans-serif';
      context.fillStyle = '#f0d5ff';
      context.fillText(region.name, column + 0.2, row + 0.9);
      context.restore();
    }
  } catch { /* Validation reports malformed regions when publishing or exporting. */ }
  if (editorDrag?.tool.startsWith('region-')) {
    const zone = regionGestureZone(editorDrag, editorDefinition.width, editorDefinition.height);
    context.strokeStyle = '#ffffff'; context.lineWidth = .2;
    context.strokeRect(zone.column, zone.row, zone.width, zone.height);
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
  if (editorDrag && isElevationEditorTool(editorDrag.tool)) {
    for (const index of editorDrag.paintCells) {
      const level = elevationBrushTarget(editorDrag.tool, editorGroundLevels[index]);
      context.fillStyle = level > 0 ? ELEVATION_LEVEL_COLORS[level] : 'rgba(224, 239, 202, .35)';
      context.fillRect(index % editorDefinition.width, Math.floor(index / editorDefinition.width), 1, 1);
    }
  } else if (editorDrag && isGroundEditorTool(editorDrag.tool)) {
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
  updateMapStudioZoomControls();
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

function compressEditorElevation() {
  const width = editorDefinition.width;
  const height = editorDefinition.height;
  const visited = new Uint8Array(width * height);
  const patches = [];
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const index = row * width + column;
      const level = editorGroundLevels[index];
      if (level === 0 || visited[index]) continue;
      let rectangleWidth = 1;
      while (column + rectangleWidth < width
        && editorGroundLevels[row * width + column + rectangleWidth] === level
        && !visited[row * width + column + rectangleWidth]) rectangleWidth++;
      let rectangleHeight = 1;
      while (row + rectangleHeight < height) {
        let same = true;
        for (let dx = 0; dx < rectangleWidth; dx++) {
          const next = (row + rectangleHeight) * width + column + dx;
          if (editorGroundLevels[next] !== level || visited[next]) { same = false; break; }
        }
        if (!same) break;
        rectangleHeight++;
      }
      for (let dy = 0; dy < rectangleHeight; dy++) {
        for (let dx = 0; dx < rectangleWidth; dx++) visited[(row + dy) * width + column + dx] = 1;
      }
      patches.push({ column, row, width: rectangleWidth, height: rectangleHeight, level });
      if (patches.length > MAX_ELEVATION_PATCHES) return patches;
    }
  }
  return patches;
}

function withCurrentEditorElevation(definition) {
  const elevationPatches = compressEditorElevation();
  if (elevationPatches.length > MAX_ELEVATION_PATCHES) {
    throw new Error(`This map has more than ${MAX_ELEVATION_PATCHES} separate elevation patches.`);
  }
  if (elevationPatches.length > 0) definition.elevationPatches = elevationPatches;
  else delete definition.elevationPatches;
  return definition;
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
  if (document.querySelector('[id^="studio-region-"][aria-invalid="true"]')) throw new Error('Correct the invalid region field before publishing or exporting.');
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
  const definition = withCurrentEditorElevation({
    ...editorDefinition,
    id, name, audio: selectedStudioAudio(), victoryMode: ui.studioVictoryMode.value,
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
    regions: readEditorRegions(),
  });
  return validateImportedMap(definition);
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
  noticeHistory = rememberNotice(noticeHistory, message);
  const history = document.querySelector('#notice-history');
  history.replaceChildren(...noticeHistory.map((notice) => {
    const item = document.createElement('li');
    item.textContent = notice.text + (notice.count > 1 ? ` ×${notice.count}` : '');
    return item;
  }));
  if (isLocalRejection(message)) audio.playEvent({ cue: 'reject' });
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
  if (/^(STOP ORDER|HOLD POSITION ORDER|PATROL ORDER|FOLLOW ORDER|REPAIR ORDER|MOVE ORDER|ATTACK MOVE ORDER|WAYPOINT ORDER|ATTACK ORDER|ATTACK BUILDING ORDER|GATHER ORDER|BUILD ORDER|BUILD RESUME ORDER) · /.test(message)
    || message.startsWith('WAYPOINT QUEUED · ')) {
    finishOrderStatus(token, message, 'applied');
    return true;
  }
  return true;
}

function sendTrackedOrder(command, label, count, unitName = 'UNITS') {
  const token = beginOrderStatus(label, count, unitName);
  if (sendCommand({ ...command, clientOrderToken: token })) {
    orderAudioGate.sent(token, { cue: command.type === 'stop' ? 'stop' : command.type === 'holdPosition' ? 'hold' : command.type === 'patrol' ? 'patrol' : command.type === 'follow' ? 'follow' : command.type === 'repairBuilding' ? 'repair' : command.type === 'build' ? 'build'
      : command.type === 'gather' ? 'gather'
        : command.type === 'attack' || command.type === 'attackBuilding' || command.type === 'attackMove'
          ? 'attack' : 'move', kind: units[command.ids?.[0]]?.kind,
      resource: command.type === 'gather' ? (command.forestCell !== undefined ? 'wood'
        : mapDefinition?.resourceNodes?.find((node) => node.id === command.nodeId)?.type) : undefined });
    audio.play('send');
    return token;
  }
  finishOrderStatus(token, 'ORDER NOT SENT · CONNECTION OFFLINE', 'failed');
  return null;
}

function sendCommand(command) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    showToast('SERVER CONNECTION IS OFFLINE');
    audio.playEvent({ cue: 'reject' });
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
    audio.playEvent({ cue: 'reject' });
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

function pickAt(x, y, predicate, { advance = true } = {}) {
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
  if (advance) lastUnitPickState = pick.state;
  return {
    ...pick,
    unit: pick.id === null ? null : units[pick.id],
  };
}

function pickResourceNodeAt(x, y, { visibleOnly = false } = {}) {
  if (localTeam === null || !Array.isArray(mapDefinition?.resourceNodes)) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  let nearest = null;
  let nearestDistance = 26 * 26;
  for (const node of mapDefinition.resourceNodes) {
    if (visibleOnly && mapDefinition.fogOfWar) {
      const column = Math.floor(node.x + MAP_WIDTH / 2);
      const row = Math.floor(node.z + MAP_HEIGHT / 2);
      if (latestFogCells?.[row * MAP_WIDTH + column] !== 2) continue;
    }
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

function pickForestCellAt(x, y) {
  if (localTeam === null || forestTreeSlots.size === 0) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  let nearestCell = null;
  let nearestDistance = 30 * 30;
  for (const [cell, slot] of forestTreeSlots) {
    if (latestForestStocks.get(cell) === 0) continue;
    if (mapDefinition?.fogOfWar && latestFogCells?.[cell] !== 2) continue;
    screenPoint.set(slot.x, 1.25, slot.z).project(camera);
    if (screenPoint.z < -1 || screenPoint.z > 1) continue;
    const treeX = (screenPoint.x * 0.5 + 0.5) * rect.width;
    const treeY = (-screenPoint.y * 0.5 + 0.5) * rect.height;
    const dx = treeX - x;
    const dy = treeY - y;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearestCell = cell;
      nearestDistance = distance;
    }
  }
  return nearestCell;
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
  showToast(`${buildingLabel(building.type)} SELECTED${BUILDING_DEFINITIONS[building.type]?.products.length ? ` · ${window.matchMedia('(pointer: coarse)').matches ? 'USE SET RALLY POINT, THEN TAP GROUND' : 'RIGHT-CLICK GROUND TO SET RALLY'}` : ''}`);
  audio.playEvent({ cue: 'select', buildingType: building.type });
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
  if (found && selected.size > 0) audio.playEvent({ cue: 'select', kind: found.kind });
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
  if (boxSelection.ids.length > 0) audio.playEvent({ cue: 'select', kind: units[boxSelection.ids[0]]?.kind });
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

function issueStationaryOrder(type) {
  persistentTargetMode = null;
  if (localTeam === null || matchWinner >= 0) return;
  const ids = selectedIds();
  if (!ids.length) { showToast('SELECT YOUR UNITS BEFORE ISSUING AN ORDER'); return; }
  if (sendTrackedOrder({ type, ids }, type === 'stop' ? 'STOP' : 'HOLD POSITION', ids.length)) {
    setTapOrderArmed(false, false);
    setAttackMoveMode(false, false);
  }
}
for (const button of document.querySelectorAll('[data-stationary-order]')) {
  button.addEventListener('click', () => issueStationaryOrder(button.dataset.stationaryOrder));
}

function setPersistentTargetMode(type) {
  if (localTeam === null || matchWinner >= 0 || !selectedIds().length) return;
  attackMoveMode = false;
  persistentTargetMode = persistentTargetMode === type ? null : type;
  updateCommandUI();
  showToast(persistentTargetMode === 'patrol' ? 'PATROL READY · TARGET GROUND TO PATROL THERE AND BACK'
    : persistentTargetMode === 'follow' ? 'FOLLOW READY · TARGET A FRIENDLY UNIT'
    : 'MOVE MODE READY');
}
for (const button of document.querySelectorAll('[data-persistent-order]')) {
  button.addEventListener('click', () => setPersistentTargetMode(button.dataset.persistentOrder));
}

function setAttackMoveMode(enabled, announce = true) {
  if (enabled && (localTeam === null || matchWinner >= 0)) return;
  if (enabled) persistentTargetMode = null;
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
  if (persistentTargetMode === 'follow') { showToast('FOLLOW NEEDS A FRIENDLY UNIT TARGET'); return; }
  const patrolOrder = persistentTargetMode === 'patrol';
  const type = patrolOrder ? 'patrol' : attackMoveOrder ? 'attackMove' : 'move';
  const formation = ['line', 'column'].includes(ui.formationSelect?.value)
    ? ui.formationSelect.value : 'box';
  if (sendTrackedOrder({ type, ids, x: point.x, z: point.z, formation,
    ...(queueWaypoint && !patrolOrder ? { queue: true } : {}) },
  patrolOrder ? 'PATROL' : queueWaypoint ? 'QUEUE WAYPOINT' : attackMoveOrder ? 'ATTACK MOVE' : 'MOVE', ids.length)) {
    moveMarker.position.set(point.x, 0.045, point.z);
    moveMarker.material.color.setHex(attackMoveOrder ? 0xf0b47c : 0xe5f79a);
    moveMarker.scale.setScalar(1);
    moveMarker.material.opacity = 0.95;
    moveMarker.visible = true;
    moveMarkerAge = 0;
    if (patrolOrder) { persistentTargetMode = null; updateCommandUI(); }
    if (attackMoveOrder) setAttackMoveMode(false, false);
  }
}

function issueBuildingRallyPoint(clientX, clientY) {
  const building = latestBuildings.find((row) => row.id === selectedBuildingId
    && row.team === localTeam && BUILDING_DEFINITIONS[row.type]?.products.length > 0);
  const point = worldAt(clientX, clientY);
  if (!building || !point) return;
  if (sendCommand({ type: 'setRallyPoint', buildingId: building.id, x: point.x, z: point.z })) {
    showToast('RALLY POINT REQUEST SENT');
  }
}

function clearSelectedBuildingRally() {
  const building = latestBuildings.find((row) => row.id === selectedBuildingId
    && row.team === localTeam && BUILDING_DEFINITIONS[row.type]?.products.length > 0);
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

function issueForestGather(cell) {
  if (localTeam === null) { showToast('SPECTATORS CANNOT ISSUE COMMANDS'); return; }
  const workers = selectedIds().filter((id) => units[id]?.kind === 'worker');
  if (workers.length === 0) {
    showToast('SELECT WORKERS FIRST · USE THE SELECT WORKERS BUTTON');
    return;
  }
  if (sendTrackedOrder({ type: 'gather', ids: workers, forestCell: cell },
    'GATHER WOOD', workers.length, 'WORKERS')) {
    setAttackMoveMode(false, false);
    showToast(`GATHER WOOD · ${workers.length} WORKERS`);
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
  if (persistentTargetMode === 'patrol') {
    const point = worldAt(clientX, clientY); if (point) issueMove(point); return;
  }
  if (persistentTargetMode === 'follow') {
    const friendly = pickAt(x, y, unit => unit.team === localTeam)?.unit;
    if (!friendly) { showToast('FOLLOW NEEDS A FRIENDLY UNIT TARGET'); return; }
    const ids = selectedIds().filter(id => id !== friendly.id);
    if (!ids.length) { showToast('SELECT FOLLOWERS OTHER THAN THE LEADER'); return; }
    if (sendTrackedOrder({ type: 'follow', ids, targetId: friendly.id }, 'FOLLOW', ids.length)) {
      persistentTargetMode = null; setTapOrderArmed(false, false); updateCommandUI();
    }
    return;
  }
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
      const forestCell = pickForestCellAt(x, y);
      if (forestCell !== null) issueForestGather(forestCell);
      else {
        const point = worldAt(clientX, clientY);
        if (point) issueMove(point, queueWaypoint);
      }
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
  if (startColumn < 0 || startColumn + footprint > MAP_WIDTH || startRow < 0 || startRow + footprint > MAP_HEIGHT) blockedReason = 'TOO CLOSE TO MAP EDGE';
  else if (localTeam === null || latestWood[localTeam] < woodCost) blockedReason = `NEED ${formatResourceRequirement(woodCost)} WOOD`;
  else if (latestFood[localTeam] < (BUILDING_DEFINITIONS[buildPlacementType].cost.food || 0)) blockedReason = `NEED ${BUILDING_DEFINITIONS[buildPlacementType].cost.food} FOOD`;
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
    const clearance = (footprint + buildingFootprint(building.type)) / 2;
    if (Math.abs(centerColumn - buildingColumn) < clearance
      && Math.abs(centerRow - buildingRow) < clearance) blockedReason ||= 'ANOTHER BUILDING TOO CLOSE';
  }
  return { x, z, column: centerColumn, row: centerRow, valid: !blockedReason, blockedReason };
}

function updateBuildPlacementGhost(clientX, clientY) {
  if (!buildPlacementActive) return;
  const placement = buildPlacementAt(clientX, clientY);
  placementGhost.visible = Boolean(placement);
  if (ui.placementStatus) {
    const message = placement
      ? placement.valid ? `CLEAR ${buildingFootprint(buildPlacementType)} × ${buildingFootprint(buildPlacementType)} SITE` : `BLOCKED · ${placement.blockedReason}`
      : 'CHOOSE A SITE ON THE BATTLEFIELD';
    const state = placement?.valid ? 'clear' : 'blocked';
    if (ui.placementStatus.textContent !== message) ui.placementStatus.textContent = message;
    if (ui.placementStatus.dataset.state !== state) ui.placementStatus.dataset.state = state;
  }
  syncBattlefieldCursor();
  if (!placement) return;
  placementGhost.position.set(placement.x, 0, placement.z);
  placementGhost.scale.set(buildingFootprint(buildPlacementType) / 3, 1, buildingFootprint(buildPlacementType) / 3);
  const tint = placement.valid ? 0x9cdb8a : 0xe7836d;
  for (const material of placementGhostMaterials) material.color.setHex(tint);
  const isBarracks = buildPlacementType === 'barracks';
  ghostRoof.visible = !isBarracks;
  ghostBarracksWalls.visible = isBarracks;
  for (const panel of ghostBarracksRoofPanels) panel.visible = isBarracks;
}

function updateBuildPlacementHint() {
  const guidance = document.querySelector('.field-hint');
  const forced = buildPlacementActive || tapOrderArmed;
  guidance.classList.toggle('guidance-dismissed', guidanceDismissed && !forced);
  const guidanceToggle = document.querySelector('#guidance-toggle');
  guidanceToggle.hidden = forced;
  guidanceToggle.textContent = guidanceDismissed ? 'Show hints' : 'Hide hints';
  guidanceToggle.setAttribute('aria-expanded', String(!guidanceDismissed));
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
    ui.placementStatus.textContent = buildPlacementActive ? `CHOOSE A CLEAR ${buildingFootprint(buildPlacementType)} × ${buildingFootprint(buildPlacementType)} SITE` : '';
    ui.placementStatus.dataset.state = 'ready';
  }
  syncTargetOrderUI();
  syncBattlefieldCursor();
  if (ui.buildBarracks) {
    ui.buildBarracks.classList.toggle('active', buildPlacementActive && buildPlacementType === 'barracks');
    ui.buildBarracks.setAttribute('aria-pressed', String(buildPlacementActive && buildPlacementType === 'barracks'));
  }
  if (ui.buildRange) {
    ui.buildRange.classList.toggle('active', buildPlacementActive && buildPlacementType === 'archery-range');
    ui.buildRange.setAttribute('aria-pressed', String(buildPlacementActive && buildPlacementType === 'archery-range'));
  }
}

function setBattlefieldCursor(mode) {
  if (renderer.domElement.dataset.cursorMode !== mode) renderer.domElement.dataset.cursorMode = mode;
}

function syncBattlefieldCursor() {
  const ids = selectedIds();
  const ownedBuilding = latestBuildings.find((row) => row.id === selectedBuildingId && row.team === localTeam);
  const state = {
    panning: Boolean(pan), panReady: spaceDown, dragging: Boolean(drag && movedPointer),
    crossing: Boolean(drag && drag.currentX < drag.startX),
    canOrder: localTeam !== null && matchWinner < 0,
    building: buildPlacementActive, buildValid: ui.placementStatus?.dataset.state === 'clear',
    selectedBuilding: selectedBuildingId !== null,
    rallySupported: Boolean(ownedBuilding && BUILDING_DEFINITIONS[ownedBuilding.type]?.products.length > 0),
    count: ids.length, workers: ids.some((id) => units[id].kind === 'worker'),
    military: ids.some((id) => units[id].kind !== 'worker'),
    attackMove: attackMoveMode, armed: tapOrderArmed, shift: cursorShift,
  };
  // Picking is read-only here: hovering must never cycle an overlapping target stack.
  if (cursorPointer && state.canOrder && !state.panning && !state.panReady && !state.dragging
      && !state.building && !state.selectedBuilding) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = cursorPointer.x - rect.left, y = cursorPointer.y - rect.top;
    if (ids.length) {
      state.enemy = Boolean(pickAt(x, y, (unit) => unit.team !== localTeam, { advance: false }).unit);
      if (!state.enemy) state.enemyBuilding = Boolean(pickBuildingAt(x, y, (building) => building.team !== localTeam));
      if (!state.enemy && !state.enemyBuilding) {
        state.resource = pickResourceNodeAt(x, y, { visibleOnly: true })?.type;
        if (!state.resource) state.forest = pickForestCellAt(x, y) !== null;
      }
    }
    if (cursorShift) {
      const friendly = pickAt(x, y, (unit) => unit.team === localTeam, { advance: false }).unit;
      state.friendly = Boolean(friendly);
      state.alreadySelected = Boolean(friendly && selected.has(friendly.id));
    }
  }
  setBattlefieldCursor(battlefieldCursor(state));
}

function cancelBuildPlacement(announce = true) {
  const wasActive = buildPlacementActive;
  buildPlacementActive = false;
  buildPlacementPending = false;
  pendingBuildOrderToken = null;
  pendingBuildBaseline = new Set();
  placementGhost.visible = false;
  updateBuildPlacementHint();
  if (typeof closeDockDetails === 'function') closeDockDetails({ restoreFocus: false });
  updateEconomyUI();
  if (announce && wasActive) showToast(`${buildingLabel(buildPlacementType)} PLACEMENT CANCELLED`);
}

function beginBuildPlacement(type) {
  if (localTeam === null || matchWinner >= 0) return;
  if (tapOrderArmed) setTapOrderArmed(false, false);
  const label = buildingLabel(type);
  const woodCost = buildingWoodCost(type);
  const foodCost = BUILDING_DEFINITIONS[type]?.cost.food || 0;
  const workers = teamUnits[localTeam].filter((unit) => unit.kind === 'worker' && unit.hp > 0);
  if (workers.length === 0) { showToast(`NO LIVING WORKERS TO CONSTRUCT ${label}`); return; }
  if (latestFood[localTeam] < foodCost) { showToast(`${label} NEEDS ${foodCost} FOOD`); return; }
  if (latestWood[localTeam] < woodCost) {
    showToast(`${label} NEEDS ${formatResourceRequirement(woodCost)} WOOD`);
    return;
  }
  selected.clear();
  for (const worker of workers) selected.add(worker.id);
  clearActiveControlGroup();
  selectionDirty = true;
  syncSelectionMesh();
  updateSelectionUI();
  attackMoveMode = false;
  persistentTargetMode = null;
  updateCommandUI();
  buildPlacementType = type;
  buildPlacementActive = true;
  buildPlacementPending = false;
  placementGhost.visible = false;
  pendingBuildOrderToken = null;
  pendingBuildBaseline = new Set(latestBuildings.filter((building) => building.team === localTeam).map((building) => building.id));
  updateBuildPlacementHint();
  if (typeof closeDockDetails === 'function') closeDockDetails({ restoreFocus: false });
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
    showToast('WORKER NEEDS ' + formatResourceRequirement(WORKER_FOOD_COST) + ' FOOD');
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
    showToast(`INFANTRY NEEDS ${formatResourceRequirement(INFANTRY_FOOD_COST)} FOOD`);
    return;
  }
  if (getBuildingQueueLength(building) >= BARRACKS_QUEUE_LIMIT) {
    showToast('BARRACKS QUEUE FULL');
    return;
  }
  sendCommand({ type: 'trainUnit', kind: 'infantry', buildingId: building.id });
}

function queueArcher() {
  if (localTeam === null || matchWinner >= 0) return;
  const building = findTrainableArcheryRange(localTeam);
  if (!building) {
    showToast('COMPLETE AN ARCHERY RANGE WITH AN OPEN QUEUE SLOT');
    return;
  }
  if (latestFood[localTeam] < ARCHER_FOOD_COST || latestWood[localTeam] < ARCHER_WOOD_COST) {
    showToast(`ARCHER NEEDS ${formatResourceRequirement(ARCHER_FOOD_COST)} FOOD + ${formatResourceRequirement(ARCHER_WOOD_COST)} WOOD`);
    return;
  }
  sendCommand({ type: 'trainUnit', kind: 'archer', buildingId: building.id });
}

function startSelectedAttackResearch() {
  if (localTeam === null || matchWinner >= 0) return;
  const building = latestBuildings.find(row => row.id === selectedBuildingId && row.team === localTeam);
  const upgrade = ui.researchAttackUpgrade?.dataset.technology;
  if (!building || !upgrade) { showToast('SELECT A RESEARCH BUILDING'); return; }
  const option = researchAction(building, upgrade, { team: localTeam, food: latestFood[localTeam], wood: latestWood[localTeam],
    upgrades: latestTeamResearch[localTeam], active: latestTeamResearch[localTeam]?.active, matchOver: matchWinner >= 0 });
  if (!option.available) { showToast(option.reason); return; }
  sendCommand({ type: 'researchUpgrade', buildingId: building.id, upgrade });
}

function resumeConstruction() {
  if (localTeam === null || matchWinner >= 0) return;
  const building = latestBuildings.find((row) => row.team === localTeam
    && Object.hasOwn(BUILDING_DEFINITIONS, row.type) && row.complete !== true);
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

let cursorPointer = null;
let cursorShift = false;
let lastCursorSample = 0;
let drag = null;
let pan = null;
let spaceDown = false;
let movedPointer = false;
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
function updateEdgeScrollPointer(event) {
  if (event.pointerType !== 'mouse') {
    edgeScrollPointer = null;
    return;
  }
  edgeScrollPointer = {
    x: event.clientX,
    y: event.clientY,
    pointerType: event.pointerType,
    buttons: event.buttons ?? 0,
  };
}
document.addEventListener('pointermove', updateEdgeScrollPointer, true);
document.addEventListener('pointerover', updateEdgeScrollPointer, true);
document.addEventListener('pointerdown', updateEdgeScrollPointer, true);
document.addEventListener('pointerup', updateEdgeScrollPointer, true);
document.addEventListener('pointercancel', updateEdgeScrollPointer, true);
document.addEventListener('pointerout', (event) => {
  if (event.pointerType === 'mouse' && !event.relatedTarget) edgeScrollPointer = null;
}, true);
renderer.domElement.addEventListener('wheel', (event) => {
  event.preventDefault();
  lastUnitPickState = null;
  const nextZoom = THREE.MathUtils.clamp(zoom * Math.exp(-event.deltaY * 0.001), cameraMinZoom, 2.3);
  if (nextZoom === zoom) return;
  mapFitActive = false;
  const anchorBeforeZoom = worldAt(event.clientX, event.clientY);
  zoom = nextZoom;
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  setCamera();
  const anchorAfterZoom = worldAt(event.clientX, event.clientY);
  if (anchorBeforeZoom && anchorAfterZoom) {
    const target = cameraTargetForZoomAnchor(cameraTarget, anchorBeforeZoom, anchorAfterZoom);
    cameraTarget.x = target.x;
    cameraTarget.z = target.z;
    setCamera();
  }
  resizeResourceCallouts();
  updateResourceNodeCallouts(performance.now(), true);
  drawMinimap(performance.now(), true);
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
    mapFitActive = false;
    pan = { x: event.clientX, y: event.clientY };
    syncBattlefieldCursor();
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
  syncBattlefieldCursor();
  renderer.domElement.setPointerCapture(event.pointerId);
  selectionBox.style.display = 'block';
  selectionBox.dataset.mode = 'window';
  selectionBox.style.left = `${x}px`;
  selectionBox.style.top = `${y}px`;
  selectionBox.style.width = '0px';
  selectionBox.style.height = '0px';
});

renderer.domElement.addEventListener('pointerleave', () => { cursorPointer = null; });
renderer.domElement.addEventListener('pointermove', (event) => {
  cursorPointer = { x: event.clientX, y: event.clientY };
  cursorShift = event.shiftKey;
  if (tapOrderPointer?.id === event.pointerId) return;
  if (pan) {
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    const delta = cameraPanDeltaFromScreen({
      dx,
      dy,
      viewportHeight: viewport.clientHeight,
      baseFrustum,
      zoom,
    });
    cameraTarget.x += delta.x;
    cameraTarget.z += delta.z;
    pan = { x: event.clientX, y: event.clientY };
    setCamera();
    return;
  }
  if (buildPlacementActive) {
    updateBuildPlacementGhost(event.clientX, event.clientY);
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  if (!drag) {
    if (performance.now() - lastCursorSample >= 80) {
      lastCursorSample = performance.now();
      syncBattlefieldCursor();
    }
    return;
  }
  drag.currentX = event.clientX - rect.left;
  drag.currentY = event.clientY - rect.top;
  selectionBox.dataset.mode = drag.currentX < drag.startX ? 'crossing' : 'window';
  if (Math.abs(drag.currentX - drag.startX) + Math.abs(drag.currentY - drag.startY) > 5) movedPointer = true;
  syncBattlefieldCursor();
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
  if (pan) {
    pan = null;
    syncBattlefieldCursor();
    return;
  }
  if (!drag) return;
  const finished = drag;
  drag = null;
  selectionBox.style.display = 'none';
  selectionBox.removeAttribute('data-mode');
  if (movedPointer) selectInRect(finished.startX, finished.startY, finished.currentX, finished.currentY, finished.additive);
  else pickFriendly(finished.startX, finished.startY, finished.additive);
  syncBattlefieldCursor();
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
  if (selected.size > 0) audio.playEvent({ cue: 'select', kind: units[selected.values().next().value]?.kind });
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
  if (selected.size > 0) audio.playEvent({ cue: 'select', kind: units[selected.values().next().value]?.kind });
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
  if (selected.size > 0) audio.playEvent({ cue: 'select', kind: units[selected.values().next().value]?.kind });
  showToast(selected.size ? `IDLE WORKERS SELECTED · ${selected.size}` : 'NO IDLE WORKERS');
}
function selectInfantry() { selectFriendlyUnitKind('infantry', 'INFANTRY'); }
function selectArchers() { selectFriendlyUnitKind('archer', 'ARCHERS'); }
function selectMilitary() { selectFriendlyUnitKinds(Object.values(UNIT_DEFINITIONS).filter((definition) => definition.capabilities.includes('attack') && !definition.capabilities.includes('gather')).map((definition) => definition.id), 'MILITARY'); }

const matchMenu = document.querySelector('#match-menu');
const helpPanel = document.querySelector('#help-panel');
const scenarioBriefPanel = document.querySelector('#scenario-brief-panel');
const scenarioBriefToggle = document.querySelector('#scenario-brief-toggle');
const hudScrim = document.querySelector('#hud-scrim');
const matchMenuToggle = document.querySelector('#match-menu-toggle');
const helpToggle = document.querySelector('#help-toggle');
const appShell = document.querySelector('.app-shell');
const fullscreenToggle = document.querySelector('#fullscreen-toggle');
const cameraSpeedInput = document.querySelector('#camera-speed');
const cameraSpeedValue = document.querySelector('#camera-speed-value');
const edgeScrollInput = document.querySelector('#edge-scroll-enabled');
const fullscreenSupported = Boolean(document.fullscreenEnabled
  && typeof appShell?.requestFullscreen === 'function'
  && typeof document.exitFullscreen === 'function');
const commandDock = document.querySelector('.control-dock');
const dockTabs = [...document.querySelectorAll('[data-dock-tab]')];
const dockToggle = document.querySelector('#dock-toggle');
const hudHeader = document.querySelector('.topbar');
const hudObjective = document.querySelector('.map-label');
const hudCamera = document.querySelector('.camera-toolbar');
function syncHudRows() {
  const headerHeight = hudHeader.getBoundingClientRect().height;
  const objectiveHeight = hudObjective.getBoundingClientRect().height;
  const cameraHeight = hudCamera.getBoundingClientRect().height;
  const narrow = appShell.clientWidth <= 920;
  const controlsBottom = headerHeight + (narrow
    ? objectiveHeight + cameraHeight + 16
    : Math.max(objectiveHeight, cameraHeight) + 8);
  appShell.style.setProperty('--hud-header-height', `${headerHeight}px`);
  appShell.style.setProperty('--hud-objective-height', `${objectiveHeight}px`);
  appShell.style.setProperty('--hud-controls-bottom', `${controlsBottom}px`);
}
const hudRowObserver = new ResizeObserver(syncHudRows);
for (const element of [hudHeader, hudObjective, hudCamera, appShell]) hudRowObserver.observe(element);
syncHudRows();
const contextualBar = document.querySelector('.contextual-command-bar');
if (contextualBar) {
  const syncContextHeight = () => document.querySelector('.workspace').style.setProperty('--context-bar-height', `${contextualBar.getBoundingClientRect().height}px`);
  new ResizeObserver(syncContextHeight).observe(contextualBar);
  syncContextHeight();
}
let dockOpener = dockToggle;
function closeDockDetails({ restoreFocus = false } = {}) {
  commandDock.hidden = true;
  dockToggle.setAttribute('aria-expanded', 'false');
  clearHeldCameraKeys();
  if (restoreFocus) (dockOpener?.isConnected && dockOpener.getClientRects().length ? dockOpener : document.querySelector('.contextual-command-bar button') || dockToggle).focus();
}
dockToggle.addEventListener('click', () => {
  if (commandDock.hidden) selectDockTab(commandDock.dataset.activePanel || 'selection', true);
  else closeDockDetails({ restoreFocus: true });
});
document.querySelector('#dock-close').addEventListener('click', () => closeDockDetails({ restoreFocus: true }));
document.querySelector('#quick-army').addEventListener('click', selectMilitary);
document.querySelector('#quick-idle').addEventListener('click', () => ui.selectIdleWorkers.click());
let hudPreferences;
try { hudPreferences = normalizeHudPreferences(JSON.parse(localStorage.getItem('skirmish-hud') || '{}')); }
catch { hudPreferences = normalizeHudPreferences(); }
function applyHudPreferences(changes = {}) {
  hudPreferences = normalizeHudPreferences({ ...hudPreferences, ...changes });
  appShell.dataset.hudDensity = hudPreferences.density;
  appShell.dataset.minimapSize = hudPreferences.minimap;
  document.querySelector('.minimap-panel').hidden = hudPreferences.minimap === 'hidden';
  document.querySelector('#minimap-reopen').hidden = hudPreferences.minimap !== 'hidden';
  document.querySelector('#hud-density').value = hudPreferences.density;
  document.querySelector('#hud-minimap').value = hudPreferences.minimap;
  document.querySelector('#minimap-size-toggle').setAttribute('aria-label', hudPreferences.minimap === 'large' ? 'Shrink tactical map' : 'Enlarge tactical map');
  document.querySelector('#minimap-size-toggle').textContent = hudPreferences.minimap === 'large' ? '−' : '+';
  try { localStorage.setItem('skirmish-hud', JSON.stringify(hudPreferences)); } catch { /* Storage may be unavailable. */ }
}
applyHudPreferences();
document.querySelector('#hud-density').addEventListener('change', (event) => applyHudPreferences({ density: event.target.value }));
document.querySelector('#hud-minimap').addEventListener('change', (event) => applyHudPreferences({ minimap: event.target.value }));
document.querySelector('#minimap-size-toggle').addEventListener('click', () => applyHudPreferences({ minimap: hudPreferences.minimap === 'large' ? 'small' : 'large' }));
document.querySelector('#minimap-hide').addEventListener('click', () => { applyHudPreferences({ minimap: 'hidden' }); document.querySelector('#minimap-reopen').focus(); });
document.querySelector('#minimap-reopen').addEventListener('click', () => { applyHudPreferences({ minimap: 'small' }); document.querySelector('#minimap-size-toggle').focus(); });

function syncFullscreenToggle() {
  const isFullscreen = document.fullscreenElement === appShell;
  fullscreenToggle.disabled = !fullscreenSupported;
  fullscreenToggle.textContent = fullscreenSupported
    ? (isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen')
    : 'Fullscreen unavailable';
  fullscreenToggle.setAttribute('aria-pressed', String(isFullscreen));
  fullscreenToggle.title = fullscreenSupported
    ? '' : 'Fullscreen is unavailable in this browser';
}

syncFullscreenToggle();
function syncNavigationControls() {
  const settings = getNavigationSettings();
  cameraSpeedInput.value = String(Math.round(settings.cameraSpeed * 100));
  cameraSpeedValue.value = `${Math.round(settings.cameraSpeed * 100)}%`;
  edgeScrollInput.checked = settings.edgeScrollEnabled;
}
syncNavigationControls();
cameraSpeedInput.addEventListener('input', () => {
  setNavigationSettings({ cameraSpeed: Number(cameraSpeedInput.value) / 100 });
  syncNavigationControls();
});
edgeScrollInput.addEventListener('change', () => {
  setNavigationSettings({ edgeScrollEnabled: edgeScrollInput.checked });
  if (!edgeScrollInput.checked) edgeScrollPointer = null;
});

function centerCameraOnSelection() {
  const building = latestBuildings.find((item) => item.id === selectedBuildingId && item.team === localTeam);
  if (building) {
    const safe = cameraSafeRect();
    focusGroundPointAtScreen({ x: building.x, z: building.z },
      safe.left + safe.width / 2, safe.top + safe.height / 2);
    drawMinimap(performance.now(), true);
    return;
  }
  const selectedUnits = [...selected].map((id) => units[id]).filter((unit) => unit && unit.hp > 0);
  if (selectedUnits.length === 0) {
    showToast('SELECT A UNIT OR BUILDING FIRST');
    return;
  }
  const point = selectedUnits.reduce((center, unit) => ({ x: center.x + unit.renderX, z: center.z + unit.renderZ }), { x: 0, z: 0 });
  point.x /= selectedUnits.length;
  point.z /= selectedUnits.length;
  const safe = cameraSafeRect();
  focusGroundPointAtScreen(point, safe.left + safe.width / 2, safe.top + safe.height / 2);
  drawMinimap(performance.now(), true);
}

function centerCameraOnHomeBase() {
  if (!mapDefinition || localTeam === null) {
    showToast('YOUR TOWN CENTER IS NOT AVAILABLE');
    return;
  }
  const point = townCenterSpawnPosition(mapDefinition.spawnPoints, localTeam, MAP_WIDTH, MAP_HEIGHT);
  const safe = cameraSafeRect();
  focusGroundPointAtScreen(point, safe.left + safe.width / 2, safe.top + safe.height / 2);
  drawMinimap(performance.now(), true);
}

document.querySelector('#camera-center-selection').addEventListener('click', centerCameraOnSelection);
document.querySelector('#camera-home-base').addEventListener('click', centerCameraOnHomeBase);
document.querySelector('#camera-fit-map').addEventListener('click', fitMapToViewport);
fullscreenToggle.addEventListener('click', async () => {
  if (!fullscreenSupported) return;
  try {
    if (document.fullscreenElement === appShell) await document.exitFullscreen();
    else await appShell.requestFullscreen();
  } catch {
    showToast('FULLSCREEN COULD NOT BE CHANGED');
  }
});
document.addEventListener('fullscreenchange', () => {
  syncFullscreenToggle();
  resize();
});
document.addEventListener('fullscreenerror', syncFullscreenToggle);

function closeHudPanels({ restoreFocus = false } = {}) {
  const trigger = !matchMenu.hidden ? matchMenuToggle : !helpPanel.hidden ? helpToggle : null;
  matchMenu.hidden = true;
  helpPanel.hidden = true;
  hudScrim.hidden = true;
  matchMenuToggle.setAttribute('aria-expanded', 'false');
  helpToggle.setAttribute('aria-expanded', 'false');
  clearHeldCameraKeys();
  if (restoreFocus) trigger?.focus();
}

function closeScenarioBrief({ restoreFocus = false } = {}) {
  scenarioBriefPanel.hidden = true;
  scenarioBriefToggle.setAttribute('aria-expanded', 'false');
  clearHeldCameraKeys();
  if (restoreFocus) scenarioBriefToggle.focus();
}

function toggleHudPanel(panel, trigger) {
  const opening = panel.hidden;
  if (tapOrderArmed) setTapOrderArmed(false, false);
  closeHudPanels();
  closeDockDetails();
  if (!opening) return;
  panel.hidden = false;
  hudScrim.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  panel.querySelector('.hud-panel-close')?.focus();
}

function selectDockTab(name, focus = false) {
  if (name !== 'command' && tapOrderArmed) setTapOrderArmed(false, false);
  if (commandDock.hidden) dockOpener = document.activeElement instanceof HTMLElement && document.activeElement.matches('button, [tabindex]') && !commandDock.contains(document.activeElement) ? document.activeElement : document.querySelector('.contextual-command-bar button') || dockToggle;
  closeScenarioBrief();
  commandDock.hidden = false;
  dockToggle.setAttribute('aria-expanded', 'true');
  commandDock.dataset.activePanel = name;
  for (const panel of commandDock.querySelectorAll(':scope > [role="tabpanel"]')) panel.hidden = panel.id !== `dock-${name}`;
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
  closeDockDetails();
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
closeDockDetails();
document.querySelector('#guidance-toggle').addEventListener('click', () => {
  guidanceDismissed = !guidanceDismissed;
  try { localStorage.setItem('rts-guidance-dismissed', String(guidanceDismissed)); } catch {}
  updateBuildPlacementHint();
});
updateBuildPlacementHint();
window.addEventListener('keydown', (event) => {
  if (document.fullscreenElement === appShell && event.key === 'Escape') return;
  if (event.key !== 'Escape' || (matchMenu.hidden && helpPanel.hidden && scenarioBriefPanel.hidden && commandDock.hidden)
    || document.querySelector('dialog[open]')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!scenarioBriefPanel.hidden) closeScenarioBrief({ restoreFocus: true });
  else if (!matchMenu.hidden || !helpPanel.hidden) closeHudPanels({ restoreFocus: true });
  else closeDockDetails({ restoreFocus: true });
}, true);

const AUDIO_CAPTIONS = Object.freeze({
  ready: 'UNIT READY',
  death: 'UNIT LOST',
  complete: 'UNIT READY',
  'building-complete': 'BUILDING COMPLETE',
  'research-complete': 'RESEARCH COMPLETE',
  'scenario-reward': 'SCENARIO REWARD',
  objective: 'OBJECTIVE CAPTURED',
  'objective-lost': 'OBJECTIVE LOST',
  'resource-empty': 'RESOURCE NODE DEPLETED',
  'base-lost': 'PRODUCTION BUILDING LOST',
  'battle-alert': 'BATTLE NEARBY',
  'selected-alert': 'SELECTED FORCE UNDER ATTACK',
  'base-alert': 'BASE UNDER ATTACK',
  victory: 'MATCH VICTORY',
  defeat: 'MATCH DEFEAT',
  draw: 'MATCH DRAW',
});

function clearAudioCaption() {
  window.clearTimeout(audioCaptionTimer);
  audioCaptionTimer = 0;
  ui.audioCaption.hidden = true;
}

function showProfileAudioCaption(caption) {
  if (!audio.getSettings().captions || !caption) return;
  ui.audioCaption.textContent = `SOUND · ${caption}`;
  ui.audioCaption.hidden = false;
  window.clearTimeout(audioCaptionTimer);
  audioCaptionTimer = window.setTimeout(clearAudioCaption, 3000);
}

function showAudioCaption(cue) {
  if (!audio.getSettings().captions) return;
  const caption = AUDIO_CAPTIONS[cue];
  if (!caption) return;
  ui.audioCaption.textContent = `SOUND · ${caption}`;
  ui.audioCaption.hidden = false;
  window.clearTimeout(audioCaptionTimer);
  audioCaptionTimer = window.setTimeout(clearAudioCaption,
    ['victory', 'defeat', 'draw'].includes(cue) ? 4000 : 2600);
}

function syncAudioControls() {
  const settings = audio.getSettings();
  ui.audioEnabled.checked = settings.enabled;
  ui.audioCaptions.checked = settings.captions;
  if (!settings.captions) clearAudioCaption();
  ui.audioVolume.value = String(Math.round(settings.volume * 100));
  ui.audioVolumeValue.value = `${Math.round(settings.volume * 100)}%`;
  ui.audioVoiceLevel.value = String(Math.round(settings.voiceLevel * 100));
  ui.audioVoiceLevelValue.value = `${Math.round(settings.voiceLevel * 100)}%`;
  ui.audioMusicLevel.value = String(Math.round(settings.musicLevel * 100));
  ui.audioMusicLevelValue.value = `${Math.round(settings.musicLevel * 100)}%`;
  ui.audioEffectsLevel.value = String(Math.round(settings.effectsLevel * 100));
  ui.audioEffectsLevelValue.value = `${Math.round(settings.effectsLevel * 100)}%`;
  ui.audioAmbience.checked = settings.ambience;
  ui.audioAmbienceLevel.value = String(Math.round(settings.ambienceLevel * 100));
  ui.audioAmbienceLevelValue.value = `${Math.round(settings.ambienceLevel * 100)}%`;
  ui.audioEnabled.disabled = audioRecognitionActive;
  ui.audioCaptions.disabled = audioRecognitionActive;
  ui.audioVolume.disabled = !settings.enabled || audioRecognitionActive;
  ui.audioEffectsLevel.disabled = !settings.enabled || audioRecognitionActive;
  ui.audioVoiceLevel.disabled = !settings.enabled || audioRecognitionActive;
  ui.audioMusicLevel.disabled = !settings.enabled || audioRecognitionActive;
  ui.audioAmbience.disabled = !settings.enabled || audioRecognitionActive;
  ui.audioAmbienceLevel.disabled = !settings.enabled || !settings.ambience || audioRecognitionActive;
  const status = audio.getStatus();
  ui.audioStatus.dataset.state = status;
  const previewDisabled = status === 'muted' || status === 'unavailable' || status === 'closed'
    || settings.effectsLevel <= 0;
  ui.audioPreview.disabled = previewDisabled || audioRecognitionActive;
  ui.audioPreviewCue.disabled = previewDisabled || audioRecognitionActive;
  ui.audioPreviewControls.hidden = audioRecognitionActive;
  ui.audioRecognitionStart.disabled = previewDisabled || audioRecognitionActive;
  ui.audioRecognitionPlay.disabled = previewDisabled || !audioRecognitionActive || audioRecognitionAwaitingNext;
  for (const button of audioRecognitionAnswerButtons) {
    button.disabled = previewDisabled || !audioRecognitionTrialPlayed;
  }
  ui.audioAmbiencePreview.disabled = ambiencePreviewPlaying || status === 'muted' || status === 'unavailable' || status === 'closed'
    || settings.musicLevel <= 0 || audioRecognitionActive;
  ui.audioStatus.textContent = {
    running: 'SOUND READY', waiting: 'SOUND STARTS WITH FIRST INPUT', muted: 'SOUND MUTED',
    silent: 'NO AUDIBLE CHANNELS',
    unavailable: 'AUDIO UNAVAILABLE IN THIS BROWSER', suspended: 'TAP TO RESUME AUDIO',
    interrupted: 'AUDIO INTERRUPTED', closed: 'AUDIO UNAVAILABLE',
  }[status] || 'SOUND STARTS WITH FIRST INPUT';
}
syncAudioControls();
ui.audioEnabled.addEventListener('change', () => { audio.setSettings({ enabled: ui.audioEnabled.checked }); syncAudioControls(); });
ui.audioCaptions.addEventListener('change', () => {
  audio.setSettings({ captions: ui.audioCaptions.checked });
  syncAudioControls();
});
ui.audioVolume.addEventListener('input', () => { audio.setSettings({ volume: Number(ui.audioVolume.value) / 100 }); syncAudioControls(); });
ui.audioVoiceLevel.addEventListener('input', () => { audio.setSettings({ voiceLevel: Number(ui.audioVoiceLevel.value) / 100 }); syncAudioControls(); });
ui.audioMusicLevel.addEventListener('input', () => { audio.setSettings({ musicLevel: Number(ui.audioMusicLevel.value) / 100 }); syncAudioControls(); });
ui.audioEffectsLevel.addEventListener('input', () => { audio.setSettings({ effectsLevel: Number(ui.audioEffectsLevel.value) / 100 }); syncAudioControls(); });
ui.audioPreview.addEventListener('click', () => { audio.unlock(); audio.preview(ui.audioPreviewCue.value); });
function renderAudioRecognitionTrial() {
  const trial = audioRecognitionRound?.current();
  if (!trial) return false;
  audioRecognitionTrialPlayed = false;
  audioRecognitionAwaitingNext = false;
  ui.audioRecognitionProgress.textContent = `SAMPLE ${trial.position} OF ${trial.total}`;
  ui.audioRecognitionPrompt.textContent = 'Play the sample, then choose what it means.';
  ui.audioRecognitionPlay.textContent = 'Play sample';
  ui.audioRecognitionAnswers.hidden = false;
  ui.audioRecognitionFeedback.textContent = 'No cue label is shown until you answer.';
  ui.audioRecognitionNext.hidden = true;
  syncAudioControls();
  return true;
}

function endAudioRecognitionCheck({ showResults = false } = {}) {
  if (showResults && audioRecognitionRound) {
    const responses = audioRecognitionRound.responses;
    const summary = summarizeAudioRecognitionResponses(responses, {
      captionsEnabled: audioRecognitionCaptionState,
      mixSettings: audioRecognitionMixSettings,
    });
    ui.audioRecognitionScore.textContent = summary.score;
    ui.audioRecognitionResultConditions.textContent = summary.conditions ? `MIX · ${summary.conditions}` : '';
    audioRecognitionLastReport = summary.report;
    ui.audioRecognitionReport.textContent = summary.report;
    ui.audioRecognitionCopyStatus.textContent = 'Copies only when you choose; nothing is sent.';
    ui.audioRecognitionResults.hidden = false;
    ui.audioRecognitionStart.textContent = 'Run again';
  } else {
    audioRecognitionLastReport = '';
    ui.audioRecognitionResultConditions.textContent = '';
    ui.audioRecognitionResults.hidden = true;
    ui.audioRecognitionStart.textContent = 'Start check';
  }
  audioRecognitionActive = false;
  audioRecognitionTrialPlayed = false;
  audioRecognitionAwaitingNext = false;
  audioRecognitionRound = null;
  audioRecognitionMixSettings = null;
  ui.audioRecognitionRun.hidden = true;
  ui.audioRecognitionNext.hidden = true;
  clearAudioCaption();
  syncAudioControls();
}

ui.audioRecognitionStart.addEventListener('click', () => {
  audio.unlock();
  clearAudioCaption();
  audioRecognitionLastReport = '';
  audioRecognitionRound = createAudioRecognitionRound();
  const settings = audio.getSettings();
  audioRecognitionCaptionState = settings.captions;
  audioRecognitionMixSettings = {
    volume: settings.volume,
    effectsLevel: settings.effectsLevel,
    ambience: settings.ambience,
    ambienceLevel: settings.ambienceLevel,
  };
  audioRecognitionActive = true;
  ui.audioRecognitionCondition.textContent = audioRecognitionCaptionState
    ? 'CAPTIONS ON · NORMAL CAPTIONS ARE PART OF THIS CHECK'
    : 'CAPTIONS OFF · FIXED FOR THIS CHECK';
  ui.audioRecognitionResults.hidden = true;
  ui.audioRecognitionRun.hidden = false;
  ui.audioRecognitionNext.hidden = true;
  renderAudioRecognitionTrial();
  syncAudioControls();
  ui.audioRecognitionPlay.focus();
});

ui.audioRecognitionPlay.addEventListener('click', () => {
  const trial = audioRecognitionRound?.current();
  if (!audioRecognitionActive || !trial) return;
  audio.unlock();
  if (!audio.preview(trial.cue)) {
    ui.audioRecognitionFeedback.textContent = 'The sample did not play. Check the audio output settings and try again.';
    return;
  }
  audioRecognitionTrialPlayed = true;
  ui.audioRecognitionPlay.textContent = 'Replay sample';
  ui.audioRecognitionFeedback.textContent = 'Choose what you heard.';
  syncAudioControls();
});

for (const button of audioRecognitionAnswerButtons) {
  button.addEventListener('click', () => {
    if (!audioRecognitionActive || !audioRecognitionTrialPlayed) return;
    const response = audioRecognitionRound.submit(button.dataset.audioRecognitionAnswer);
    if (!response) return;
    audioRecognitionTrialPlayed = false;
    audioRecognitionAwaitingNext = true;
    ui.audioRecognitionAnswers.hidden = true;
    const answerFeedback = response.answer === AUDIO_RECOGNITION_UNSURE_ANSWER
      ? 'Marked not sure.'
      : response.correct ? 'Correct.' : 'Not quite.';
    ui.audioRecognitionFeedback.textContent = `${answerFeedback} It was ${AUDIO_RECOGNITION_CUE_LABELS[response.cue]}.`;
    ui.audioRecognitionNext.textContent = audioRecognitionRound.current() ? 'Next sample' : 'See results';
    ui.audioRecognitionNext.hidden = false;
    syncAudioControls();
  });
}

ui.audioRecognitionNext.addEventListener('click', () => {
  if (audioRecognitionRound?.current()) {
    renderAudioRecognitionTrial();
    ui.audioRecognitionPlay.focus();
    return;
  }
  endAudioRecognitionCheck({ showResults: true });
  ui.audioRecognitionStart.focus();
});

ui.audioRecognitionEnd.addEventListener('click', () => {
  endAudioRecognitionCheck();
  ui.audioRecognitionStart.focus();
});
ui.audioRecognitionCopy.addEventListener('click', async () => {
  if (!audioRecognitionLastReport) return;
  if (await copyAudioRecognitionText(audioRecognitionLastReport)) {
    ui.audioRecognitionCopyStatus.textContent = 'Copied. Paste these notes into the audio playtest log.';
  } else {
    ui.audioRecognitionCopyStatus.textContent = 'Clipboard unavailable. Open trial notes and copy them manually.';
  }
});
document.querySelector('#audio-inspector-refresh').addEventListener('click', () => {
  document.querySelector('#audio-inspector-output').textContent = JSON.stringify(audio.getInspector(), null, 2);
});
ui.audioAmbience.addEventListener('change', () => { audio.setSettings({ ambience: ui.audioAmbience.checked }); syncAudioControls(); });
ui.audioAmbiencePreview.addEventListener('click', () => {
  audio.unlock();
  if (!audio.previewAmbience()) return;
  ambiencePreviewPlaying = true;
  ui.audioAmbiencePreview.textContent = 'Phrase playing';
  syncAudioControls();
  globalThis.setTimeout(() => {
    ambiencePreviewPlaying = false;
    ui.audioAmbiencePreview.textContent = 'Preview phrase';
    syncAudioControls();
  }, AMBIENCE_PREVIEW_DURATION_MS);
});
ui.audioAmbienceLevel.addEventListener('input', () => { audio.setSettings({ ambienceLevel: Number(ui.audioAmbienceLevel.value) / 100 }); syncAudioControls(); });
document.addEventListener('pointerdown', () => audio.unlock(), { capture: true, once: true });
document.addEventListener('keydown', () => audio.unlock(), { capture: true, once: true });
function keyboardTargetIsEditing(event) {
  const target = event.target instanceof Element ? event.target : null;
  return !matchMenu.hidden || !helpPanel.hidden || !scenarioBriefPanel.hidden
    || Boolean(target?.closest('input, textarea, select, [contenteditable], dialog, [role="tab"]'));
}

function clearHeldCameraKeys() {
  heldCameraKeys.clear();
  lastKeyboardPanTime = 0;
}

function cameraNavigationKeydown(event) {
  if (!cameraArrowInputAllowed({
    key: event.key,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    defaultPrevented: event.defaultPrevented,
    mapAvailable: Boolean(mapDefinition),
    pageVisible: document.visibilityState === 'visible',
    dialogOpen: Boolean(document.querySelector('dialog[open]')),
    menuOpen: !matchMenu.hidden || !helpPanel.hidden || !scenarioBriefPanel.hidden,
    mapStudioOpen: ui.mapStudio.open,
    buildPlacement: buildPlacementActive,
    selectionDragging: Boolean(drag),
    manualPan: Boolean(pan),
    targetOrder: Boolean(tapOrderArmed || tapOrderPointer),
    editingTarget: keyboardTargetIsEditing(event),
  })) return false;
  heldCameraKeys.press(event.key);
  event.preventDefault();
  return true;
}

function moveKeyboardCamera(now) {
  if (heldCameraKeys.pressed.length === 0) return;
  if (document.visibilityState !== 'visible' || keyboardTargetIsEditing({ target: document.activeElement })
    || ui.mapStudio.open || document.querySelector('dialog[open]') || buildPlacementActive
    || drag || pan || tapOrderArmed || tapOrderPointer) {
    clearHeldCameraKeys();
    return;
  }
  const elapsed = lastKeyboardPanTime ? Math.min(0.1, (now - lastKeyboardPanTime) / 1000) : 0;
  lastKeyboardPanTime = now;
  if (elapsed <= 0) return;
  const direction = heldCameraKeys.direction();
  const pixels = 650 * getNavigationSettings().cameraSpeed * elapsed;
  const delta = cameraPanDeltaFromScreen({
    dx: -direction.x * pixels,
    dy: -direction.y * pixels,
    viewportHeight: Math.max(1, viewport.clientHeight),
    baseFrustum,
    zoom,
  });
  mapFitActive = false;
  cameraTarget.x += delta.x;
  cameraTarget.z += delta.z;
  setCamera();
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
  if (document.fullscreenElement === appShell && event.key === 'Escape') return;
  const editing = keyboardTargetIsEditing(event);
  if (cameraNavigationKeydown(event)) return;
  const buttonFocused = event.target instanceof Element && Boolean(event.target.closest('button'));
  if (event.code === 'Space') {
    if (!editing && !buttonFocused) {
      spaceDown = true;
      syncBattlefieldCursor();
      event.preventDefault();
    }
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
    && ['p', 'f'].includes(event.key.toLowerCase())) {
    event.preventDefault(); setPersistentTargetMode(event.key.toLowerCase() === 'p' ? 'patrol' : 'follow'); return;
  }
  if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
    && ['s', 'h'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    issueStationaryOrder(event.key.toLowerCase() === 's' ? 'stop' : 'holdPosition');
    return;
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
    if (persistentTargetMode) { persistentTargetMode = null; updateCommandUI(); return; }
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
window.addEventListener('keydown', (event) => {
  if (event.key === 'Shift') { cursorShift = true; syncBattlefieldCursor(); }
});
window.addEventListener('keyup', (event) => {
  if (event.key === 'Shift') { cursorShift = false; syncBattlefieldCursor(); }
  if (event.key.startsWith('Arrow')) heldCameraKeys.release(event.key);
  if (event.code !== 'Space') return;
  spaceDown = false;
  syncBattlefieldCursor();
});
window.addEventListener('blur', () => {
  cursorPointer = null;
  cursorShift = false;
  if (tapOrderArmed) setTapOrderArmed(false, false);
  spaceDown = false;
  clearHeldCameraKeys();
  pan = null;
  edgeScrollPointer = null;
  syncBattlefieldCursor();
  lastControlGroupRecall = null;
  lastFriendlyUnitClick = null;
  lastUnitPickState = null;
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    edgeScrollPointer = null;
    clearHeldCameraKeys();
  }
});
document.addEventListener('focusin', (event) => {
  if (event.target instanceof Element
    && event.target.closest('input, textarea, select, [contenteditable], dialog, [role="tab"]')) clearHeldCameraKeys();
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
if (ui.studioEventTechnologyReward) {
  const none = document.createElement('option'); none.value = ''; none.textContent = 'None';
  ui.studioEventTechnologyReward.replaceChildren(none, ...Object.values(TECHNOLOGY_DEFINITIONS).map(definition => {
    const option = document.createElement('option'); option.value = definition.id; option.textContent = definition.label;
    return option;
  }));
}
for (const selector of [ui.studioObjectiveUnitKind, ui.studioEventUnitKind]) {
  const initial = selector.value || 'infantry';
  selector.replaceChildren(...Object.values(UNIT_DEFINITIONS).map((definition) => {
    const option = document.createElement('option'); option.value = definition.id; option.textContent = definition.label; return option;
  }));
  selector.value = initial;
}
ui.selectWorkers?.addEventListener('click', selectWorkers);
ui.selectIdleWorkers?.addEventListener('click', selectIdleWorkers);
ui.selectInfantry?.addEventListener('click', selectInfantry);
ui.selectArchers?.addEventListener('click', selectArchers);
ui.selectMilitary?.addEventListener('click', selectMilitary);
ui.trainInfantry?.addEventListener('click', queueInfantry);
ui.trainWorker?.addEventListener('click', queueWorker);
ui.cancelWorkerTraining?.addEventListener('click', () => sendCommand({ type: 'cancelTraining', kind: 'worker' }));
ui.trainArcher?.addEventListener('click', queueArcher);
ui.resumeRange?.addEventListener('click', resumeConstruction);
ui.buildHouse?.addEventListener('click', () => {
  if (buildPlacementActive && buildPlacementType === 'house') cancelBuildPlacement();
  else beginBuildPlacement('house');
});
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
ui.studioElevationBrushSize.addEventListener('change', () => {
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
for (const id of ['studio-event-completion-team', 'studio-event-completion-id']) document.querySelector(`#${id}`).addEventListener('change', saveSelectedEditorScenarioEventFields);
ui.studioRegions.addEventListener('input', () => { syncEditorRegionControls(); syncEditorScenarioEventControls(); drawEditorGrid(); recordScenarioEdit(); });
document.querySelector('#studio-region-list').addEventListener('change', e => { selectedEditorRegionId = e.target.value; syncEditorRegionControls(); drawEditorGrid(); });
document.querySelector('#studio-region-delete').addEventListener('click', () => {
  const regions = readEditorRegions().filter(r => r.id !== selectedEditorRegionId);
  selectedEditorRegionId = null; writeEditorRegions(regions);
  ui.studioMessage.textContent = 'Region removed. Events referencing it must choose another region before publishing; undo restores it.';
});
for (const key of ['name','column','row','width','height']) document.querySelector(`#studio-region-${key}`).addEventListener('change', e => {
  try {
    const regions = readEditorRegions(); const region = regions.find(r => r.id === selectedEditorRegionId); if (!region) return;
    if (key === 'name') region.name = e.target.value; else region.zone[key] = Number(e.target.value);
    validateScenarioRegions({ ...editorDefinition, regions }); e.target.removeAttribute('aria-invalid'); writeEditorRegions(regions);
  } catch (error) { ui.studioMessage.textContent = error.message; e.target.setAttribute('aria-invalid','true'); }
});
document.querySelector('#studio-scenario-undo').addEventListener('click', () => restoreScenarioEdit('undo'));
document.querySelector('#studio-scenario-redo').addEventListener('click', () => restoreScenarioEdit('redo'));
for (const field of [ui.studioEventRegion, ui.studioEventRegionTeam, ui.studioEventRegionKind,
  ui.studioEventRegionMinimum]) field.addEventListener('change', saveSelectedEditorScenarioEventFields);
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
  if (!editorDefinition) return;
  const shouldPan = event.button === 1 || (event.button === 0 && editorTool === 'pan');
  if (shouldPan) {
    editorPanDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: ui.studioGridViewport.scrollLeft,
      scrollTop: ui.studioGridViewport.scrollTop,
    };
    ui.studioGrid.classList.add('is-panning');
    ui.studioGrid.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  if (event.button !== 0) return;
  const cell = editorCellFromPointer(event);
  if (!cell) return;
  if (editorTool === 'region-draw' || editorTool === 'region-move' || editorTool === 'region-resize') {
    let regions; try { regions = readEditorRegions(); } catch (error) { ui.studioMessage.textContent = error.message; return; }
    recordScenarioEdit();
    if (editorTool !== 'region-draw') {
      const region = [...regions].reverse().find(r => cell.column >= r.zone.column && cell.column < r.zone.column+r.zone.width && cell.row >= r.zone.row && cell.row < r.zone.row+r.zone.height);
      if (!region) { selectedEditorRegionId = null; syncEditorRegionControls(); drawEditorGrid(); return; }
      selectedEditorRegionId = region.id;
      editorDrag = { tool: editorTool, start: cell, current: cell, regionId: region.id, zone: {...region.zone} };
    } else {
      if (regions.length >= 32) { ui.studioMessage.textContent = 'At most 32 named regions.'; return; }
      editorDrag = { tool: editorTool, start: cell, current: cell };
    }
    syncEditorRegionControls(); ui.studioGrid.setPointerCapture(event.pointerId); drawEditorGrid(); event.preventDefault(); return;
  }
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
  } else if (isElevationEditorTool(editorTool)) {
    editorDrag.paintCells = new Set();
    paintEditorElevationStroke(editorDrag, cell);
  }
  ui.studioGrid.setPointerCapture(event.pointerId);
  drawEditorGrid();
  event.preventDefault();
});
ui.studioGrid.addEventListener('pointermove', (event) => {
  const cell = editorCellFromPointer(event);
  updateMapStudioCellReadout(cell);
  if (editorPanDrag) {
    if (editorPanDrag.pointerId !== event.pointerId) return;
    const scroll = mapStudioScrollAtPan({
      scrollLeft: editorPanDrag.scrollLeft,
      scrollTop: editorPanDrag.scrollTop,
      startX: editorPanDrag.startX,
      startY: editorPanDrag.startY,
      clientX: event.clientX,
      clientY: event.clientY,
    });
    if (scroll) {
      ui.studioGridViewport.scrollLeft = scroll.left;
      ui.studioGridViewport.scrollTop = scroll.top;
    }
    return;
  }
  if (!editorDrag) return;
  if (cell) {
    if (isGroundEditorTool(editorDrag.tool)) paintEditorGroundStroke(editorDrag, cell);
    else if (isElevationEditorTool(editorDrag.tool)) paintEditorElevationStroke(editorDrag, cell);
    editorDrag.current = cell;
  }
  drawEditorGrid();
});
ui.studioGrid.addEventListener('pointerleave', () => {
  if (!editorDrag && !editorPanDrag) updateMapStudioCellReadout(null);
});
function finishEditorPointer(event, commit) {
  if (editorPanDrag) {
    if (editorPanDrag.pointerId !== event.pointerId) return;
    editorPanDrag = null;
    ui.studioGrid.classList.remove('is-panning');
    return;
  }
  if (!editorDrag) return;
  const drag = editorDrag;
  editorDrag = null;
  if (drag.tool.startsWith('region-')) {
    if (commit) {
      drag.current = editorCellFromPointer(event) || drag.current;
      const regions = readEditorRegions();
      const zone = regionGestureZone(drag, editorDefinition.width, editorDefinition.height);
      if (drag.tool === 'region-draw') {
        let suffix = 1; while (regions.some(r => r.id === `region-${suffix}`)) suffix++;
        selectedEditorRegionId = `region-${suffix}`;
        regions.push({id:selectedEditorRegionId, name:`Region ${suffix}`, zone});
      } else { const region = regions.find(r => r.id === drag.regionId); if (region) region.zone = zone; }
      writeEditorRegions(regions);
    } else drawEditorGrid();
    return;
  }
  if (commit) {
    const next = editorCellFromPointer(event) || drag.current;
    if (isGroundEditorTool(drag.tool)) paintEditorGroundStroke(drag, next);
    else if (isElevationEditorTool(drag.tool)) paintEditorElevationStroke(drag, next);
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
    } else if (isElevationEditorTool(drag.tool)) {
      let changedCells = 0;
      for (const index of drag.paintCells) {
        const nextLevel = elevationBrushTarget(drag.tool, editorGroundLevels[index]);
        if (nextLevel === editorGroundLevels[index]) continue;
        editorGroundLevels[index] = nextLevel;
        changedCells++;
      }
      const action = drag.tool === 'elevation:raise' ? 'Raised'
        : drag.tool === 'elevation:lower' ? 'Lowered' : `Set to level ${drag.tool.slice('elevation:'.length)} at`;
      ui.studioMessage.textContent = changedCells > 0
        ? `${action} ${changedCells} ground cell${changedCells === 1 ? '' : 's'}.`
        : 'No ground levels changed.';
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
ui.studioGridZoomIn.addEventListener('click', () => setMapStudioZoom(editorViewZoom * 1.25));
ui.studioGridZoomOut.addEventListener('click', () => setMapStudioZoom(editorViewZoom / 1.25));
ui.studioGridZoomFit.addEventListener('click', fitMapStudioViewport);
ui.studioGridViewport.addEventListener('wheel', (event) => {
  if (!editorDefinition || !ui.mapStudio.open) return;
  event.preventDefault();
  const rect = ui.studioGridViewport.getBoundingClientRect();
  const anchorX = event.clientX - rect.left - ui.studioGridViewport.clientLeft;
  const anchorY = event.clientY - rect.top - ui.studioGridViewport.clientTop;
  setMapStudioZoom(editorViewZoom * Math.exp(-event.deltaY * 0.0015), anchorX, anchorY);
}, { passive: false });
ui.mapStudio.addEventListener('close', () => {
  window.clearTimeout(editorDraftWriteTimer);
  editorDraftWriteTimer = 0;
  persistMapStudioDraft(true);
  editorDrag = null;
  editorPanDrag = null;
  ui.studioGrid.classList.remove('is-panning');
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
      const hasPlayerSeat = [0, 1].includes(message.player.team);
      const joinedSeat = hasPlayerSeat && message.player.team !== cameraSeatTeam;
      if (hasPlayerSeat) cameraSeatTeam = message.player.team;
      else if (message.player.resumePending !== true) cameraSeatTeam = null;
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
      void loadMapAudio(message.map.audio);
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
      if (joinedSeat) {
        mapFitActive = false;
        zoom = Math.max(cameraMinZoom, defaultCameraZoom);
        resize();
        centerCameraOnHomeBase();
      }
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
      void loadMapAudio(message.map.audio);
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
      audio.playEvent({ cue: localTeam !== null && message.team !== localTeam ? 'objective-lost' : 'objective' });
      showToast(message.message, 2400);
      return;
    }
    if (message.type === 'scenarioEvent') {
      const cue = cueForScenarioEvent(message, { localTeam });
      if (cue) audio.playEvent({ cue });
      showToast(message.message, 3600);
      return;
    }
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
      const appliedAudio = orderAudioGate.observe(noticeToken, notice);
      if (appliedAudio) audio.playEvent(appliedAudio);
      if (feedback.applyOrderStatus) applyOrderNotice(noticeToken, notice);
      if (feedback.showToast) {
        const cue = cueForNotice(notice, { localTeam, tokenized: noticeToken !== null });
        if (cue && !notice.endsWith(' READY')) audio.playEvent({ cue });
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
    audio.stopWork(); orderAudioGate.reset();
    if (pageLeaving) return;
    const retryImmediately = retryWhenSeatFree;
    retryWhenSeatFree = false;
    // A lost rejection or snapshot must not leave placement waiting forever.
    // Only release the local input mode; the server may have accepted the build.
    if (buildPlacementPending) cancelBuildPlacement(false);
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
  if (cursorPointer && now - lastCursorSample >= 100) {
    lastCursorSample = now;
    if (buildPlacementActive) updateBuildPlacementGhost(cursorPointer.x, cursorPointer.y);
    else syncBattlefieldCursor();
  }
  requestAnimationFrame(animate);
  moveKeyboardCamera(now);
  syncUnitDetailLevel();
  renderScenarioEventCountdown(now);
  animateBuildingCombatFeedback(now);
  const frameDelta = Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;
  if (edgeScrollPointer && mapDefinition) {
    const rect = renderer.domElement.getBoundingClientRect();
    const localX = edgeScrollPointer.x - rect.left;
    const localY = edgeScrollPointer.y - rect.top;
    const insideViewport = localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height;
    const hoveredElement = insideViewport ? document.elementFromPoint(edgeScrollPointer.x, edgeScrollPointer.y) : null;
    const hudControlHovered = hoveredElement instanceof Element
      && Boolean(hoveredElement.closest(
        'button, a[href], input, select, textarea, [contenteditable="true"], [role="button"], [role="tab"], .control-dock, .hud-quick-access, .contextual-command-bar, #minimap-canvas, .minimap-panel, .objective-panel, .scenario-brief-panel, .match-result, #art-review-panel',
      ));
    const activeElement = document.activeElement;
    const hudControlFocused = activeElement instanceof Element
      && shouldBlockEdgeScrollForFocus({
        editable: activeElement.matches('input, select, textarea, [contenteditable="true"]'),
        keyboardFocusedControl: activeElement.matches(
          'button, a[href], [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"])',
        ) && activeElement.matches(':focus-visible'),
      });
    const settings = getNavigationSettings();
    const eligible = canEdgeScroll({
      pointerType: edgeScrollPointer.pointerType,
      buttons: edgeScrollPointer.buttons,
      insideViewport,
      mapAvailable: Boolean(mapDefinition) && settings.edgeScrollEnabled,
      pageVisible: document.visibilityState === 'visible',
      selectionDragging: Boolean(drag),
      manualPan: Boolean(pan),
      targetOrder: Boolean(tapOrderArmed || tapOrderPointer),
      buildPlacement: buildPlacementActive,
      mapStudioOpen: ui.mapStudio.open,
      dialogOpen: Boolean(document.querySelector('dialog[open]')),
      hudPanelOpen: !matchMenu.hidden || !helpPanel.hidden || !scenarioBriefPanel.hidden || !hudScrim.hidden,
      hudControlHovered,
      hudControlFocused,
    });
    if (eligible) {
      const direction = edgeScrollDirection(localX, localY, rect.width, rect.height, CAMERA_EDGE_ZONE_PX);
      if (direction.x || direction.y) {
        const pixels = CAMERA_EDGE_SPEED_PX_PER_SECOND * settings.cameraSpeed * frameDelta;
        const unitsPerPixel = baseFrustum / (Math.max(1, viewport.clientHeight) * zoom);
        const delta = edgeScrollCameraDelta(direction.x, direction.y, pixels, unitsPerPixel);
        cameraTarget.x += delta.x;
        cameraTarget.z += delta.z;
        mapFitActive = false;
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
      && (unit.task === 'gathering' || unit.task === 'building' || unit.task === 'repairing');
    // Keep pose phase current in LOD so a zoom-in resumes without a swing reset.
    if (working) unit.motionPhase += frameDelta * (['building', 'repairing'].includes(unit.task) ? 6 : 5);
    const activeAttack = unit.attackStartedAt > 0;
    const activeHit = unit.hitStartedAt > 0;
    const activeSpawn = unit.spawnStartedAt > 0;
    const activeDefeat = unit.defeatStartedAt > 0;
    const hasSprite = unitSpritePreviewActive && unitSpritePreviewRoleSet.has(unit.kind);
    const spriteRole = castPreview ? unitSpriteRuntime.roleForUnit(unit) : unit.kind;
    const attackLifetime = hasSprite ? unitSpriteRuntime.durationMs(spriteRole, 'attack') || ATTACK_POSE_MS : ATTACK_POSE_MS;
    const defeatLifetime = hasSprite ? (unitSpriteRuntime.durationMs(spriteRole, 'defeat') || DEFEAT_POSE_MS) + 150 : DEFEAT_POSE_MS;
    if (activeAttack && now - unit.attackStartedAt >= attackLifetime) unit.attackStartedAt = 0;
    if (activeHit && now - unit.hitStartedAt >= HIT_POSE_MS) unit.hitStartedAt = 0;
    if (activeSpawn && now - unit.spawnStartedAt >= SPAWN_POSE_MS) unit.spawnStartedAt = 0;
    if (activeDefeat && now - unit.defeatStartedAt >= defeatLifetime) unit.defeatStartedAt = 0;
    const idle = idlePoseDue && unit.hp > 0 && !walking && !working;
    const transformChanged = walking || wasWalking || turning || activeSpawn || activeDefeat;
    const fullDetailAnimationDue = working || activeAttack || activeHit || idle;
    if (shouldUpdateUnitTransformForFrame(unitLowDetailActive && !hasSprite,
      transformChanged, fullDetailAnimationDue)) {
      updateUnitTransform(unit, now);
      artAnimated = true;
    }
  }
  if (artAnimated) {
    for (let team = 0; team < 2; team++) {
      markUnitInstanceMatricesDirty(team);
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
  updateResourceNodeCallouts(now);
  for (const visual of capturedBuildingVisuals) {
    updateCapturedBuildingSprite(visual.sprite, camera, visual.lifecycleInput);
    if (visual.sprite.visible) visual.fallbackRoot.visible = false;
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

for (const button of document.querySelectorAll('[data-context-proxy]')) {
  button.addEventListener('click', () => { document.getElementById(button.dataset.contextProxy).click(); updateContextualCommands(); });
}
for (const button of document.querySelectorAll('[data-context-panel]')) {
  button.addEventListener('click', () => selectDockTab(button.dataset.contextPanel, true));
}
for (let index = 0; index < 10; index++) {
  const button = document.createElement('button');
  button.type = 'button'; button.hidden = true;
  button.addEventListener('click', () => recallControlGroup(index));
  document.querySelector('[data-context-groups]').append(button);
}
document.querySelector('#assign-selected-group').addEventListener('click', () => {
  assignControlGroup(Number(document.querySelector('#assign-group-slot').value));
  updateContextualCommands();
});
updateContextualCommands();
