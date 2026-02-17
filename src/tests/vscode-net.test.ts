/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AddressInfo } from 'node:net';

const helpersPath = pathToFileURL(path.join(process.cwd(), 'vscode-extension/src/net-helpers.js')).href;

test('fetchWithTimeout works without global fetch (Node 16 fallback)', async () => {
  const server = http.createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address !== 'object') {
    server.close();
    throw new Error('Could not get server address');
  }
  const port = (address as AddressInfo).port;

  const { fetchWithTimeout } = await import(helpersPath);
  // force fallback
  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = undefined;

  const response = await fetchWithTimeout(`http://127.0.0.1:${port}/health`, 1000);
  // restore
  (globalThis as any).fetch = originalFetch;
  server.close();

  assert.equal(response.ok, true);
  assert.equal(response.status, 200);
});

test('parsePort validates numeric ports', async () => {
  const { parsePort } = await import(helpersPath);
  assert.equal(parsePort('3123'), 3123);
  assert.equal(parsePort('0'), null);
  assert.equal(parsePort('abc'), null);
  assert.equal(parsePort(65536), null);
});
