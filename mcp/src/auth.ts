import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type BackendIdentity = {
  accessToken: string;
  refreshToken: string;
  appSessionId: string;
  expiresAt: number;
  appExpiresAt: number;
  userId: string;
};

type Pending = { clientId: string; redirectUri: string; challenge: string; state: string; resource: string; created: number; attempts: number };
type Code = { pending: Pending; identity: BackendIdentity; created: number };
type Grant = { identity: BackendIdentity; clientId: string; expires: number };

const pending = new Map<string, Pending>();
const codes = new Map<string, Code>();
const access = new Map<string, Grant>();
const refresh = new Map<string, Grant>();
const loginAttempts: number[] = [];
const renewals = new WeakMap<BackendIdentity, Promise<void>>();
const random = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('base64url');
const key = (value: string) => createHash('sha256').update(value).digest('hex');
const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const backendUrl = () => process.env.MCP_BACKEND_URL || 'http://127.0.0.1:5000';
const issuer = () => process.env.MCP_PUBLIC_URL || `http://localhost:${process.env.MCP_PORT || 3001}`;
const clientId = () => process.env.MCP_OAUTH_CLIENT_ID || '';
const redirectUri = () => process.env.MCP_OAUTH_REDIRECT_URI || '';
const configured = () => Boolean(clientId() && redirectUri());
const expired = (grant: Grant) => grant.expires <= Date.now() || grant.identity.appExpiresAt <= Date.now();

export function publicOrigin() { return issuer(); }
export function oauthConfigured() { return configured(); }

export function cleanExpired() {
  const now = Date.now();
  for (const [id, value] of pending) if (now - value.created > 5 * 60_000) pending.delete(id);
  for (const [id, value] of codes) if (now - value.created > 2 * 60_000) codes.delete(id);
  for (const [id, value] of access) if (expired(value)) access.delete(id);
  for (const [id, value] of refresh) if (expired(value)) refresh.delete(id);
}

export function json(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}

function html(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  });
  res.end(body);
}

function loginPage(nonce: string, error = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ALZHEN TMS access</title><style>body{font:15px system-ui;background:#f5f7fb;color:#173252;margin:5rem auto;max-width:24rem;padding:1rem}form{background:white;border:1px solid #dbe3ed;border-radius:12px;padding:1.5rem}label{display:block;margin-top:1rem}input{box-sizing:border-box;width:100%;padding:.65rem;margin-top:.35rem;border:1px solid #bdc9d8;border-radius:6px}button{margin-top:1.3rem;background:#173252;color:white;border:0;border-radius:6px;padding:.7rem 1rem;width:100%;cursor:pointer}small{color:#52677e}.error{color:#b3261e}</style></head><body><h1>Connect ALZHEN TMS</h1><p>Sign in with your ALZHEN account to grant read-only trip access.</p><form method="post" action="/oauth/authorize"><input type="hidden" name="nonce" value="${nonce}"><label>Email<input type="email" name="email" autocomplete="username" required></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label>${error ? '<p class="error">Sign-in failed or the service is unavailable. Check your account and try again.</p>' : ''}<button type="submit">Connect</button></form><p><small>This page is served by your MCP server. Your password is sent only to the local ALZHEN backend and is not sent to ChatGPT.</small></p></body></html>`;
}

export function metadata(res: ServerResponse, path: string) {
  if (!configured()) return json(res, 503, { error: 'oauth_not_configured' });
  if (path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp') {
    return json(res, 200, { resource: `${issuer()}/mcp`, authorization_servers: [issuer()], scopes_supported: ['tms:read'] });
  }
  return json(res, 200, {
    issuer: issuer(), authorization_endpoint: `${issuer()}/oauth/authorize`, token_endpoint: `${issuer()}/oauth/token`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['tms:read'], authorization_response_iss_parameter_supported: true,
  });
}

export function challenge(res: ServerResponse, status = 401) {
  return json(res, status, { error: status === 401 ? 'unauthorized' : 'oauth_not_configured' }, status === 401 && configured()
    ? { 'WWW-Authenticate': `Bearer resource_metadata="${issuer()}/.well-known/oauth-protected-resource", scope="tms:read"` }
    : {});
}

export function beginAuthorization(url: URL, res: ServerResponse) {
  if (!configured()) return json(res, 503, { error: 'oauth_not_configured' });
  const q = url.searchParams;
  if (q.get('client_id') !== clientId() || q.get('redirect_uri') !== redirectUri() || q.get('response_type') !== 'code'
    || q.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(q.get('code_challenge') || '')
    || q.get('resource') !== `${issuer()}/mcp` || !q.get('state') || q.get('state')!.length > 512
    || (q.get('scope') && q.get('scope') !== 'tms:read')) {
    return json(res, 400, { error: 'invalid_request' });
  }
  cleanExpired();
  if (pending.size >= 1000) return json(res, 429, { error: 'temporarily_unavailable' });
  const nonce = random();
  pending.set(nonce, { clientId: clientId(), redirectUri: redirectUri(), challenge: q.get('code_challenge')!,
    state: q.get('state')!, resource: q.get('resource')!, created: Date.now(), attempts: 0 });
  return html(res, 200, loginPage(nonce));
}

async function body(req: IncomingMessage): Promise<URLSearchParams> {
  if (!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) throw Error('invalid_request');
  let raw = '';
  for await (const chunk of req) { raw += chunk.toString(); if (raw.length > 8192) throw Error('invalid_request'); }
  return new URLSearchParams(raw);
}

async function backend(path: string, init: RequestInit, timeout = 12_000) {
  const response = await fetch(`${backendUrl()}${path}`, { ...init, signal: AbortSignal.timeout(timeout), redirect: 'error' });
  const value = await response.json().catch(() => null);
  return { response, value };
}

export async function completeAuthorization(req: IncomingMessage, res: ServerResponse) {
  let form: URLSearchParams;
  try { form = await body(req); } catch { return json(res, 400, { error: 'invalid_request' }); }
  const nonce = form.get('nonce') || '';
  const request = pending.get(nonce);
  if (!request || Date.now() - request.created > 5 * 60_000) return json(res, 400, { error: 'invalid_request' });
  request.attempts += 1;
  if (request.attempts > 5) { pending.delete(nonce); return json(res, 429, { error: 'too_many_attempts' }); }
  const email = form.get('email') || '', password = form.get('password') || '';
  if (email.length > 254 || !email.includes('@') || !password || password.length > 1024) return html(res, 400, loginPage(nonce, 'error'));
  while (loginAttempts.length && loginAttempts[0] < Date.now() - 15 * 60_000) loginAttempts.shift();
  if (loginAttempts.length >= 20) return json(res, 429, { error: 'too_many_attempts' });
  loginAttempts.push(Date.now());
  try {
    const { response, value } = await backend('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'ALZHEN-MCP/1.0' },
      body: JSON.stringify({ email, password }),
    });
    const data = value?.data;
    if (!response.ok || !data?.session?.access_token || !data?.session?.refresh_token || !data?.appSessionId
      || !['ADMIN', 'STAFF'].includes(String(data.profile?.role).toUpperCase())) return html(res, 401, loginPage(nonce, 'error'));
    pending.delete(nonce);
    const identity: BackendIdentity = {
      accessToken: data.session.access_token, refreshToken: data.session.refresh_token,
      appSessionId: data.appSessionId, expiresAt: Date.now() + Math.max(1, Number(data.session.expires_in || 3600)) * 1000,
      appExpiresAt: Date.parse(data.expiresAt || '') || Date.now() + 12 * 60 * 60_000,
      userId: String(data.authUser?.id || ''),
    };
    const code = random(); codes.set(key(code), { pending: request, identity, created: Date.now() });
    const callback = new URL(request.redirectUri);
    callback.searchParams.set('code', code); callback.searchParams.set('state', request.state); callback.searchParams.set('iss', issuer());
    res.writeHead(302, { Location: callback.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end();
  } catch { return html(res, 503, loginPage(nonce, 'error')); }
}

function issue(grant: Grant, res: ServerResponse) {
  const accessToken = random(), refreshToken = random();
  access.set(key(accessToken), { ...grant, expires: Math.min(Date.now() + 30 * 60_000, grant.identity.appExpiresAt) });
  refresh.set(key(refreshToken), { ...grant, expires: grant.identity.appExpiresAt });
  return json(res, 200, { access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer',
    expires_in: Math.max(1, Math.floor((Math.min(Date.now() + 30 * 60_000, grant.identity.appExpiresAt) - Date.now()) / 1000)),
    scope: 'tms:read' });
}

export async function tokenEndpoint(req: IncomingMessage, res: ServerResponse) {
  if (!configured()) return json(res, 503, { error: 'oauth_not_configured' });
  let form: URLSearchParams;
  try { form = await body(req); } catch { return json(res, 400, { error: 'invalid_request' }); }
  if (form.get('client_id') !== clientId() || (form.get('resource') && form.get('resource') !== `${issuer()}/mcp`))
    return json(res, 400, { error: 'invalid_client' });
  cleanExpired();
  if (form.get('grant_type') === 'authorization_code') {
    const token = form.get('code') || '', stored = codes.get(key(token));
    if (stored) codes.delete(key(token));
    const verifier = form.get('code_verifier') || '';
    if (!stored || Date.now() - stored.created > 2 * 60_000 || form.get('redirect_uri') !== stored.pending.redirectUri
      || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !safeEqual(hash(verifier), stored.pending.challenge))
      return json(res, 400, { error: 'invalid_grant' });
    return issue({ identity: stored.identity, clientId: stored.pending.clientId, expires: stored.identity.appExpiresAt }, res);
  }
  if (form.get('grant_type') === 'refresh_token') {
    const token = form.get('refresh_token') || '', stored = refresh.get(key(token));
    if (!stored || expired(stored)) return json(res, 400, { error: 'invalid_grant' });
    try { await verifyBackend(stored.identity); }
    catch (error) {
      if (error instanceof Error && error.message === 'backend_authorization_failed') {
        refresh.delete(key(token)); return json(res, 400, { error: 'invalid_grant' });
      }
      return json(res, 503, { error: 'temporarily_unavailable' });
    }
    refresh.delete(key(token));
    return issue(stored, res);
  }
  return json(res, 400, { error: 'unsupported_grant_type' });
}

async function renewBackend(identity: BackendIdentity) {
  const url = process.env.MCP_SUPABASE_URL, anon = process.env.MCP_SUPABASE_ANON_KEY;
  if (!url || !anon || !/^https:\/\//.test(url)) throw Error('backend_session_expired');
  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: identity.refreshToken }), signal: AbortSignal.timeout(10_000), redirect: 'error',
  });
  const value = await response.json().catch(() => null);
  if (!response.ok || !value?.access_token || !value?.refresh_token) throw Error('backend_session_expired');
  identity.accessToken = value.access_token; identity.refreshToken = value.refresh_token;
  identity.expiresAt = Date.now() + Math.max(1, Number(value.expires_in || 3600)) * 1000;
}

export async function ensureBackendToken(identity: BackendIdentity) {
  if (identity.appExpiresAt <= Date.now()) throw Error('backend_session_expired');
  if (identity.expiresAt - Date.now() >= 60_000) return;
  let current = renewals.get(identity);
  if (!current) {
    current = renewBackend(identity).finally(() => renewals.delete(identity));
    renewals.set(identity, current);
  }
  await current;
}

export async function verifyBackend(identity: BackendIdentity) {
  await ensureBackendToken(identity);
  const { response, value } = await backend('/api/auth/me', {
    headers: { Authorization: `Bearer ${identity.accessToken}`, 'X-App-Session': identity.appSessionId, 'User-Agent': 'ALZHEN-MCP/1.0' },
  });
  if (!response.ok || !['ADMIN', 'STAFF'].includes(String(value?.data?.profile?.role).toUpperCase())
    || value?.data?.authUser?.id !== identity.userId) throw Error('backend_authorization_failed');
}

export async function bearerIdentity(req: IncomingMessage): Promise<BackendIdentity | null> {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(String(req.headers.authorization || ''));
  if (!match) return null;
  const grant = access.get(key(match[1]));
  if (!grant || expired(grant)) return null;
  return grant.identity;
}

export function invalidate(identity: BackendIdentity) {
  for (const [token, grant] of access) if (grant.identity === identity) access.delete(token);
  for (const [token, grant] of refresh) if (grant.identity === identity) refresh.delete(token);
}

export function backendHeaders(identity: BackendIdentity) {
  return { Authorization: `Bearer ${identity.accessToken}`, 'X-App-Session': identity.appSessionId, 'User-Agent': 'ALZHEN-MCP/1.0' };
}
