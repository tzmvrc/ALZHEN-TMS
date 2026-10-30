import './env.js';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import {
  bearerIdentity, beginAuthorization, challenge, cleanExpired, completeAuthorization, json,
  metadata, oauthConfigured, publicOrigin, tokenEndpoint, type BackendIdentity,
} from './auth.js';
import { registerTools } from './tools.js';

const port = Number(process.env.MCP_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('MCP_PORT must be a valid port.');
const origin = publicOrigin();
const publicUrl = new URL(origin);
if (publicUrl.origin !== origin || (process.env.MCP_PUBLIC_URL && publicUrl.protocol !== 'https:'))
  throw Error('MCP_PUBLIC_URL must be an HTTPS origin without a path or trailing slash.');
if (oauthConfigured() && (!/^https:\/\//.test(process.env.MCP_OAUTH_REDIRECT_URI || '')
  || !process.env.MCP_SUPABASE_URL || !process.env.MCP_SUPABASE_ANON_KEY))
  throw Error('OAuth requires an HTTPS callback and the Supabase URL and publishable/anon key for session renewal.');
if (process.env.MCP_SUPABASE_ANON_KEY) {
  const value = process.env.MCP_SUPABASE_ANON_KEY;
  let role = '';
  try { role = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role || ''; } catch { /* publishable keys are opaque */ }
  if (value.startsWith('sb_secret_') || role === 'service_role' || (!value.startsWith('sb_publishable_') && role !== 'anon'))
    throw Error('MCP_SUPABASE_ANON_KEY must be a publishable or legacy anon key. Never use a service-role key.');
}
const backendUrl = new URL(process.env.MCP_BACKEND_URL || 'http://127.0.0.1:5000');
if (backendUrl.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(backendUrl.hostname)
  || backendUrl.pathname !== '/' || backendUrl.search || backendUrl.hash)
  throw Error('MCP_BACKEND_URL must be a local HTTP origin.');

const configuredHosts = (process.env.MCP_ALLOWED_HOSTS || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
for (const host of configuredHosts) {
  const labels = host.split('.');
  if (host === '*' || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || host.length > 253)
    throw Error('MCP_ALLOWED_HOSTS must contain exact hostnames only, separated by commas. No URLs, ports, or wildcards.');
}
const allowedHosts = [...new Set(['localhost', '127.0.0.1', '[::1]', ...configuredHosts])];
if (process.env.MCP_PUBLIC_URL && !allowedHosts.includes(publicUrl.hostname))
  throw Error('MCP_PUBLIC_URL hostname must also be listed in MCP_ALLOWED_HOSTS.');
const validateHost = hostHeaderValidation(allowedHosts);
const validateOrigin = originValidation(allowedHosts);
const mcp = createMcpHandler(({ authInfo }) => {
  const server = new McpServer({ name: 'alzhen-tms', version: '1.0.0' });
  registerTools(server, (authInfo as typeof authInfo & { backendIdentity: BackendIdentity }).backendIdentity);
  return server;
}, { responseMode: 'json' });
const serveMcp = toNodeHandler(mcp, { maxRequestBodySize: 64 * 1024, onerror: () => console.error('MCP request failed.') });

const http = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (!validateHost(req, res) || !validateOrigin(req, res)) return;
  const url = new URL(req.url || '/', `http://localhost:${port}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (url.pathname === '/health' && req.method === 'GET') return json(res, 200, { status: 'ok', service: 'alzhen-tms-mcp', oauth_configured: oauthConfigured() });
  if (url.pathname === '/.well-known/oauth-protected-resource' || url.pathname === '/.well-known/oauth-protected-resource/mcp'
    || url.pathname === '/.well-known/oauth-authorization-server') {
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
    return metadata(res, url.pathname);
  }
  if (url.pathname === '/oauth/authorize' && req.method === 'GET') return beginAuthorization(url, res);
  if (url.pathname === '/oauth/authorize' && req.method === 'POST') { void completeAuthorization(req, res); return; }
  if (url.pathname === '/oauth/token' && req.method === 'POST') { void tokenEndpoint(req, res); return; }
  if (url.pathname !== '/mcp') return json(res, 404, { error: 'not_found' });
  if (!oauthConfigured()) return challenge(res, 503);
  if (!['GET', 'POST', 'DELETE'].includes(req.method || '')) return json(res, 405, { error: 'method_not_allowed' });
  void (async () => {
    const identity = await bearerIdentity(req);
    if (!identity) return challenge(res);
    (req as IncomingMessage & { auth: unknown }).auth = {
      token: String(req.headers.authorization).slice(7), clientId: process.env.MCP_OAUTH_CLIENT_ID!, scopes: ['tms:read'],
      resource: new URL(`${origin}/mcp`), backendIdentity: identity,
    };
    await serveMcp(req, res);
  })().catch(() => { if (!res.headersSent) json(res, 503, { error: 'service_unavailable' }); else res.end(); });
});

http.requestTimeout = 20_000;
http.headersTimeout = 10_000;
http.maxRequestsPerSocket = 100;
http.on('error', error => { console.error(error instanceof Error ? error.message : 'MCP server failed to start.'); process.exitCode = 1; });
http.listen(port, '127.0.0.1', () => {
  console.log(`ALZHEN MCP listening at http://localhost:${port}/mcp (${oauthConfigured() ? 'OAuth configured' : 'authentication setup required'}). Allowed hosts: ${allowedHosts.join(', ')}.`);
});
const cleanup = setInterval(cleanExpired, 60_000); cleanup.unref();
let closing = false;
async function shutdown() {
  if (closing) return; closing = true; clearInterval(cleanup);
  http.closeAllConnections();
  await Promise.allSettled([mcp.close(), new Promise<void>(resolve => http.close(() => resolve()))]);
  process.exit(0);
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
