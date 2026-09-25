function normalizeOrigin(value, label) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${label} must be a valid URL origin.`); }
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${label} must contain only an HTTP or HTTPS origin.`);
  }
  return parsed.origin;
}

export function configuredPublicOrigins(environment = process.env) {
  const origins = new Set();
  const extraOrigins = String(environment.RTS_PUBLIC_ORIGINS || '')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  for (const origin of extraOrigins) origins.add(normalizeOrigin(origin, 'RTS_PUBLIC_ORIGINS entry'));

  const railwayDomain = String(environment.RAILWAY_PUBLIC_DOMAIN || '').trim();
  if (railwayDomain) origins.add(normalizeOrigin(`https://${railwayDomain}`, 'RAILWAY_PUBLIC_DOMAIN'));
  return origins;
}

// Public deployments use explicit origins; only local runs derive an origin from Host.
export function sameOriginRequest(request, {
  allowedOrigins = new Set(),
  httpsTerminatedAtEdge = false,
} = {}) {
  const originHeader = request.headers?.origin;
  if (originHeader === undefined) return true;

  let origin;
  try { origin = new URL(originHeader); } catch { return false; }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) return false;

  if (allowedOrigins.size > 0) return allowedOrigins.has(origin.origin);

  const host = request.headers?.host;
  if (typeof host !== 'string' || !host || host.trim() !== host) return false;
  const scheme = httpsTerminatedAtEdge || request.socket?.encrypted ? 'https:' : 'http:';
  let target;
  try { target = new URL(`${scheme}//${host}`); } catch { return false; }
  if (target.username || target.password || target.pathname !== '/' || target.search || target.hash) return false;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname.toLowerCase())) return false;
  return origin.origin === target.origin;
}
