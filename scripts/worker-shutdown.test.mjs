import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../room-supervisor.mjs', import.meta.url), 'utf8');
const start = source.indexOf('async function stopWorker(');
const end = source.indexOf('\nconst SHIPPED_MAP_DIRECTORY', start);
assert.ok(start >= 0 && end > start);
const context = vm.createContext({ once, setTimeout, clearTimeout, WORKER_STOP_TIMEOUT_MS: 100 });
vm.runInContext(source.slice(start, end), context);

async function childProcess(t, behavior) {
  const child = spawn(process.execPath, ['-e', `${behavior}; process.send('ready'); setInterval(() => {}, 1000);`],
    { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
  });
  await once(child, 'message');
  return child;
}

async function boundedStop(child) {
  let timer;
  try {
    await Promise.race([
      context.stopWorker({ child }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('stopWorker waited for an exit that already happened')), 5000); }),
    ]);
  } finally { clearTimeout(timer); }
}

test('shutdown completes when SIGTERM terminates a child by signal', async (t) => {
  const child = await childProcess(t, '');
  await boundedStop(child);
  assert.equal(child.signalCode, 'SIGTERM');
});

test('already signal-killed worker requires no second exit event', async (t) => {
  const child = await childProcess(t, '');
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
  await boundedStop(child);
  assert.equal(child.signalCode, 'SIGKILL');
});

test('unresponsive child is killed after the grace period', async (t) => {
  const child = await childProcess(t, "process.on('SIGTERM', () => {})");
  await boundedStop(child);
  assert.equal(child.signalCode, 'SIGKILL');
});

test('clean child shutdown remains graceful', async (t) => {
  const child = await childProcess(t, "process.on('SIGTERM', () => process.exit(0))");
  await boundedStop(child);
  assert.equal(child.exitCode, 0);
  assert.equal(child.signalCode, null);
});
