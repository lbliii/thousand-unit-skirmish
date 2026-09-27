import assert from 'node:assert/strict';

// Audit served modules, so deployment/packaging omissions cannot hide behind
// source-file checks. This follows static imports, not runtime asset requests.
export async function checkClientImports(base, { authorization, fetchImpl = fetch } = {}) {
  const origin = new URL(base).origin;
  const pending = ['/src/main.js'];
  const visited = new Set();
  const checks = [];
  while (pending.length) {
    const modulePath = pending.pop();
    if (visited.has(modulePath)) continue;
    visited.add(modulePath);
    const url = new URL(modulePath, origin);
    assert.equal(url.origin, origin, `browser import must stay on the game origin: ${modulePath}`);
    const response = await fetchImpl(url, {
      headers: authorization ? { authorization } : {},
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200, `browser import ${modulePath} must be served`);
    assert.match(response.headers.get('content-type') || '', /(?:java|ecma)script/i,
      `browser import ${modulePath} must have JavaScript MIME`);
    const source = await response.text();
    assert.ok(source.trim(), `browser import ${modulePath} must not be empty`);
    checks.push({ path: modulePath, status: response.status });
    const imports = source.matchAll(/(?:import|export)\s+(?:[^;'"`]*?\s+from\s*)?['"]([^'"]+)['"]/g);
    for (const [, specifier] of imports) {
      const dependency = specifier === 'three' ? '/vendor/three.module.js'
        : specifier.startsWith('.') ? new URL(specifier, url).pathname
          : specifier.startsWith('/') ? specifier : null;
      assert.ok(dependency, `unmapped browser import ${specifier} in ${modulePath}`);
      pending.push(dependency);
    }
  }
  return checks;
}
