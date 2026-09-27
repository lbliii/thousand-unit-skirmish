import { checkClientImports } from './check-client-imports.mjs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import tls from 'node:tls';

const args = process.argv.slice(2);
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
  if (!['--environment', '--project'].includes(args[index]) || !args[index + 1]
    || options.has(args[index])) {
    throw new Error('Usage: node scripts/railway-smoke.mjs --environment staging|production [--project PROJECT_ID]');
  }
  options.set(args[index], args[index + 1]);
}
const environment = options.get('--environment');
if (!['staging', 'production'].includes(environment)) {
  throw new Error('Usage: node scripts/railway-smoke.mjs --environment staging|production [--project PROJECT_ID]');
}
const service = 'game';

function railway(...command) {
  const result = spawnSync('railway', [...command, '--json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Railway ${command[0]} lookup failed`);
  return JSON.parse(result.stdout);
}

const project = options.get('--project') || railway('status').id;
if (!project) throw new Error('Pass --project or link this checkout to the Railway project first');
const scope = ['--project', project, '--environment', environment, '--service', service];
const domains = railway('domain', 'list', ...scope).domains;
const domain = domains?.find((item) => item.type === 'service' && item.syncStatus === 'ACTIVE')?.domain;
if (!domain) throw new Error(`No active Railway service domain for ${environment}`);

const variables = railway('variable', 'list', ...scope);
const password = variables.RTS_ACCESS_PASSWORD;
if (!password) throw new Error(`RTS_ACCESS_PASSWORD is missing in ${environment}`);
const user = variables.RTS_ACCESS_USER || 'players';
const authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
const base = `https://${domain}`;

async function check(path, expected, authenticated = false) {
  const response = await fetch(new URL(path, base), {
    headers: authenticated ? { authorization } : {},
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== expected) throw new Error(`${path}: HTTP ${response.status}, expected ${expected}`);
  const body = await response.arrayBuffer();
  if (expected === 200 && body.byteLength === 0) throw new Error(`${path}: empty successful response`);
  if (path === '/ready' && JSON.parse(Buffer.from(body).toString()).ok !== true) {
    throw new Error('/ready did not report ok');
  }
  return { path, status: response.status };
}

function checkWebSocket(authenticated, expected) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: domain, port: 443, servername: domain });
    const timer = setTimeout(() => socket.destroy(new Error('WebSocket upgrade timed out')), 10000);
    let headers = '';
    let settled = false;
    const finish = (error, status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve({ path: '/ws', status, authenticated });
    };
    socket.on('secureConnect', () => {
      const lines = [
        'GET /ws HTTP/1.1', `Host: ${domain}`, 'Upgrade: websocket', 'Connection: Upgrade',
        'Sec-WebSocket-Version: 13', `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}`,
      ];
      if (authenticated) lines.push(`Authorization: ${authorization}`);
      socket.write(lines.join('\r\n') + '\r\n\r\n');
    });
    socket.on('data', (chunk) => {
      headers += chunk.toString();
      if (!headers.includes('\r\n')) return;
      const status = Number(/^HTTP\/1\.1 (\d+)/.exec(headers)?.[1]);
      finish(status === expected ? null : new Error(`/ws: HTTP ${status}, expected ${expected}`), status);
    });
    socket.on('error', (error) => finish(error));
  });
}

try {
  const checks = [await check('/ready', 200), await check('/', 401), await check('/health', 401)];
  for (const path of [
    '/', '/health', '/vendor/three.module.js', '/vendor/three.core.js', '/src/audio.mjs',
    '/src/environment-art.mjs', '/assets/environment/frontier-v1/meadow.webp',
  ]) checks.push(await check(path, 200, true));
  checks.push(...await checkClientImports(base, { authorization }));
  checks.push(await checkWebSocket(false, 401));
  checks.push(await checkWebSocket(true, 101));
  console.log(JSON.stringify({ environment, domain, checks }));
} catch (error) {
  console.error(`${environment} smoke check failed: ${error.message}`);
  process.exitCode = 1;
}
