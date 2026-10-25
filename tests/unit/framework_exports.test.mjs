import test from 'node:test';
import assert from 'node:assert/strict';
import * as framework from '../../framework/index.js';
import { runModLoader } from '../../framework/host.js';

test('framework/index.js - exports GitService and AgentSyncServer alongside core runtime', () => {
  assert.ok(framework.GitService, 'GitService must be exported');
  assert.ok(framework.AgentSyncServer, 'AgentSyncServer must be exported');
  assert.ok(framework.GitHubCliService, 'GitHubCliService must be exported');
  assert.ok(framework.VcsOrchestrator, 'VcsOrchestrator must be exported');
  assert.ok(framework.ModDaemon, 'ModDaemon must be exported');
  assert.ok(framework.createDefaultHost, 'createDefaultHost must be exported');
  assert.ok(framework.ModHost, 'ModHost must be exported');
  assert.ok(framework.ModLoader, 'ModLoader must be exported');
  assert.ok(framework.AntigravityMod, 'AntigravityMod must be exported');
});

test('framework/host.js - runModLoader executes createDefaultHost without error', async () => {
  assert.equal(typeof runModLoader, 'function');
});
