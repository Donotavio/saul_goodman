/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const queuePath = pathToFileURL(
  path.join(process.cwd(), 'vscode-extension', 'src', 'queue', 'buffered-event-queue.js')
).href;

test('BufferedEventQueue flushes and persists', async () => {
  const { BufferedEventQueue } = await import(queuePath);
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'saul-queue-test-'));
  let posted = 0;
  const queue = new BufferedEventQueue({
    apiClient: {
      postHeartbeats: async () => {
        posted += 1;
      }
    },
    storageDir: tmpDir,
    apiBase: 'http://127.0.0.1:3123',
    pairingKey: 'test',
    enabled: true,
    maxBatchSize: 2,
    maxBufferSize: 10,
    logger: { warn: () => {} }
  });

  await queue.init();
  queue.enqueue({ id: '1' });
  queue.enqueue({ id: '2' });
  await queue.flush();

  assert.equal(posted, 1);
  const persisted = JSON.parse(readFileSync(path.join(tmpDir, 'vscode-heartbeat-queue.json'), 'utf8'));
  assert.deepEqual(persisted.events, []);

  rmSync(tmpDir, { recursive: true, force: true });
});

test('BufferedEventQueue skips flush when disabled', async () => {
  const { BufferedEventQueue } = await import(queuePath);
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'saul-queue-test-'));
  let posted = 0;
  const queue = new BufferedEventQueue({
    apiClient: {
      postHeartbeats: async () => {
        posted += 1;
      }
    },
    storageDir: tmpDir,
    apiBase: 'http://127.0.0.1:3123',
    pairingKey: 'test',
    enabled: false,
    maxBatchSize: 1,
    maxBufferSize: 10,
    logger: { warn: () => {} }
  });

  await queue.init();
  queue.enqueue({ id: '1' });
  await queue.flush();

  assert.equal(posted, 0);

  rmSync(tmpDir, { recursive: true, force: true });
});
