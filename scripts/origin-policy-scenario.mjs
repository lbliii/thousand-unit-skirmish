import assert from 'node:assert/strict';
import { configuredPublicOrigins, sameOriginRequest } from '../origin-policy.mjs';

function request(origin, host, {
  encrypted = false,
  forwardedHost = 'attacker.example',
  forwardedProto = 'https',
} = {}) {
  return {
    headers: {
      origin,
      host,
      'x-forwarded-host': forwardedHost,
      'x-forwarded-proto': forwardedProto,
    },
    socket: { encrypted },
  };
}

const stagingOrigins = configuredPublicOrigins({ RAILWAY_PUBLIC_DOMAIN: 'game-staging.up.railway.app' });
assert.equal(sameOriginRequest(request('https://game-staging.up.railway.app', 'internal.local'), {
  allowedOrigins: stagingOrigins,
  httpsTerminatedAtEdge: true,
}), true, 'the configured Railway domain should work behind its HTTPS edge');
assert.equal(sameOriginRequest(request('https://attacker.example', 'internal.local'), {
  allowedOrigins: stagingOrigins,
  httpsTerminatedAtEdge: true,
}), false, 'forwarded-header spoofing must not add an origin to the Railway allowlist');
assert.equal(sameOriginRequest(request('http://game-staging.up.railway.app', 'internal.local'), {
  allowedOrigins: stagingOrigins,
  httpsTerminatedAtEdge: true,
}), false, 'the public Railway origin must use HTTPS');

const productionOrigins = configuredPublicOrigins({ RAILWAY_PUBLIC_DOMAIN: 'game-production.up.railway.app' });
assert.equal(sameOriginRequest(request('https://game-production.up.railway.app', 'internal.local'), {
  allowedOrigins: productionOrigins,
  httpsTerminatedAtEdge: true,
}), true, 'the production environment should use its own Railway public-domain allowlist');

const customOrigins = configuredPublicOrigins({ RTS_PUBLIC_ORIGINS: 'https://play.example, https://game.example:8443' });
assert.equal(sameOriginRequest(request('https://game.example:8443', 'internal.local'), {
  allowedOrigins: customOrigins,
}), true, 'explicit custom origins should support a known public host');
assert.equal(sameOriginRequest(request('https://attacker.example', 'internal.local'), {
  allowedOrigins: customOrigins,
}), false, 'explicit custom origins must remain allowlisted');

const lanOrigins = configuredPublicOrigins({ RTS_PUBLIC_ORIGINS: 'http://192.168.1.25:4173' });
assert.equal(sameOriginRequest(request('http://192.168.1.25:4173', '192.168.1.25:4173'), {
  allowedOrigins: lanOrigins,
}), true, 'a LAN origin should work only when explicitly configured');

assert.equal(sameOriginRequest(request('http://127.0.0.1:4173', '127.0.0.1:4173'), {}), true,
  'local same-origin requests should match Host and the unencrypted socket scheme');
assert.equal(sameOriginRequest(request('http://localhost:4173', 'localhost:4173'), {}), true,
  'local same-origin requests should support localhost');
assert.equal(sameOriginRequest(request('http://[::1]:4173', '[::1]:4173'), {}), true,
  'local same-origin requests should support IPv6 loopback');
assert.equal(sameOriginRequest(request('https://attacker.example', '127.0.0.1:4173'), {}), false,
  'local X-Forwarded-* spoofing must not bypass the Host check');
assert.equal(sameOriginRequest(request('http://attacker.example:4173', 'attacker.example:4173'), {}), false,
  'a matching attacker-controlled Host must not pass local origin checks through DNS rebinding');
assert.equal(sameOriginRequest(request('http://localhost:4174', 'localhost:4173'), {}), false,
  'local Origin and Host must match the same port');
assert.equal(sameOriginRequest({ headers: {}, socket: { encrypted: false } }, {}), true,
  'native clients without an Origin should remain supported');

console.log(JSON.stringify({
  status: 'passed',
  assertions: 14,
  railwayOrigin: 'https://game-staging.up.railway.app',
  localOrigin: 'http://127.0.0.1:4173',
}, null, 2));
