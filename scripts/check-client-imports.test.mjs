import assert from 'node:assert/strict';
import test from 'node:test';
import { checkClientImports } from './check-client-imports.mjs';

function fixture(files) {
  const requests = [];
  return {
    requests,
    async fetchImpl(url, options) {
      assert.equal(url.origin, 'https://game.example');
      assert.equal(options.headers.authorization, 'Basic fixture');
      assert.equal(options.redirect, 'error');
      requests.push(url.pathname);
      const file = files[url.pathname];
      return new Response(file?.body ?? 'missing', {
        status: file?.status ?? (file ? 200 : 404),
        headers: { 'content-type': file?.mime || 'text/javascript' },
      });
    },
  };
}

async function audit(files) {
  const server = fixture(files);
  const checks = await checkClientImports('https://game.example', {
    authorization: 'Basic fixture', fetchImpl: server.fetchImpl,
  });
  return { checks, requests: server.requests };
}

test('transitive imports, exports, Three alias and cycles are checked once', async () => {
  const { checks, requests } = await audit({
    '/src/main.js': { body: "import './helper.mjs'; import * as THREE from 'three';" },
    '/src/helper.mjs': { body: "export { value } from './nested.mjs';" },
    '/src/nested.mjs': { body: "import './helper.mjs'; export const value = 1;" },
    '/vendor/three.module.js': { body: "export { Core } from './three.core.js';" },
    '/vendor/three.core.js': { body: 'export const Core = 1;' },
  });
  assert.equal(new Set(requests).size, 5);
  assert.equal(requests.length, 5);
  assert.equal(checks.length, 5);
});

test('a missing transitive helper fails with its public path', async () => {
  await assert.rejects(audit({
    '/src/main.js': { body: "import './resource-format.mjs';" },
  }), /browser import \/src\/resource-format.mjs must be served/);
});

test('HTML fallback is rejected even with HTTP 200', async () => {
  await assert.rejects(audit({
    '/src/main.js': { body: '<html>Login</html>', mime: 'text/html' },
  }), /must have JavaScript MIME/);
});

test('a cross-origin import is rejected before credentials can be sent', async () => {
  await assert.rejects(audit({
    '/src/main.js': { body: "import '//other.example/private.mjs';" },
  }), /must stay on the game origin/);
});


test('an empty successful module is not accepted as a loaded client', async () => {
  await assert.rejects(audit({ '/src/main.js': { body: '' } }), /must not be empty/);
});
