import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./browser-performance-scenario.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function installBrowserInstrumentationExpression()');
const end = source.indexOf('\nasync function waitForBrowserReady', start);
assert.ok(start >= 0 && end > start);

function harness(supported) {
  const observers = new Map();
  class Observer {
    static supportedEntryTypes = supported;
    constructor(callback) { this.callback = callback; }
    observe({ type }) { observers.set(type, this.callback); }
  }
  const context = vm.createContext({ window: { requestAnimationFrame() {} },
    performance: { now: () => 123 }, PerformanceObserver: Observer });
  const expression = vm.runInContext(`${source.slice(start, end)}\ninstallBrowserInstrumentationExpression()`, context);
  vm.runInContext(expression, context);
  return { state: context.window.__rtsBrowserPerf,
    emit(type, entries) { observers.get(type)?.({ getEntries: () => entries }); } };
}

test('optional frame attribution records measured script details and resets between windows', () => {
  const h = harness(['longtask', 'long-animation-frame']);
  const frame = { startTime: 140, duration: 88, blockingDuration: 38, renderStart: 141,
    styleAndLayoutStart: 225, scripts: [{ duration: 80, executionStart: 142,
      forcedStyleAndLayoutDuration: 2, invoker: 'FrameRequestCallback', invokerType: 'user-callback',
      sourceURL: 'http://localhost/src/main.js', sourceFunctionName: 'animate', sourceCharPosition: 100 }] };
  h.emit('long-animation-frame', [frame]);
  assert.equal(h.state.longAnimationFrames.length, 0);
  h.state.begin();
  h.emit('long-animation-frame', [frame]);
  h.emit('longtask', [{ startTime: 142, duration: 80 }]);
  assert.equal(h.state.longAnimationFrameObserverAvailable, true);
  assert.equal(h.state.measurementStartedAt, 123);
  assert.equal(h.state.longAnimationFrames[0].durationMs, 88);
  assert.equal(h.state.longAnimationFrames[0].measurementPhase, 'within-window');
  assert.equal(h.state.longAnimationFrames[0].scripts[0].sourceFunctionName, 'animate');
  assert.equal(h.state.longAnimationFrames[0].scripts[0].forcedStyleAndLayoutDurationMs, 2);
  assert.equal(h.state.longTasks[0].durationMs, 80, 'existing budget samples are retained independently');
  h.state.end(); h.emit('long-animation-frame', [frame]);
  assert.equal(h.state.longAnimationFrames.length, 1);
  h.state.begin();
  assert.equal(h.state.longAnimationFrames.length, 0);
  assert.equal(h.state.longTasks.length, 0);
  h.emit('long-animation-frame', [{ ...frame, startTime: 0, duration: 80 },
    { ...frame, startTime: 100, duration: 80 }]);
  assert.equal(h.state.longAnimationFrames[0].measurementPhase, 'before-window', 'deferred startup entries stay identifiable');
  assert.equal(h.state.longAnimationFrames[1].measurementPhase, 'overlaps-window');
});

test('browsers without frame attribution retain ordinary long-task measurement', () => {
  const h = harness(['longtask']);
  h.state.begin(); h.emit('longtask', [{ startTime: 150, duration: 60 }]);
  assert.equal(h.state.longAnimationFrameObserverAvailable, false);
  assert.equal(h.state.longTaskObserverAvailable, true);
  assert.equal(h.state.longTasks.length, 1);
  assert.equal(h.state.longAnimationFrames.length, 0);
});

test('deferred pre-window long tasks do not fail the measured window; overlapping tasks still count', () => {
  const h = harness(['longtask']);
  h.state.begin();
  h.emit('longtask', [{ startTime: 20, duration: 60 }, { startTime: 100, duration: 60 },
    { startTime: 150, duration: 75 }]);
  assert.deepEqual(Array.from(h.state.longTasks, (entry) => entry.startTime), [100, 150]);
  assert.deepEqual(Array.from(h.state.preWindowLongTasks, (entry) => entry.startTime), [20]);
  h.state.begin();
  assert.equal(h.state.preWindowLongTasks.length, 0);
});
