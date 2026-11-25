import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

test('generate_mods_catalog - executes cleanly and produces comprehensive MODS_CATALOG.md', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts', 'generate_mods_catalog.mjs');
  const catalogPath = path.join(ROOT_DIR, 'MODS_CATALOG.md');

  assert.ok(fs.existsSync(scriptPath), 'Script scripts/generate_mods_catalog.mjs must exist');

  // Execute catalog generator
  const stdout = execSync(`node "${scriptPath}"`, { cwd: ROOT_DIR, encoding: 'utf-8' });
  assert.match(stdout, /Successfully generated/i);

  assert.ok(fs.existsSync(catalogPath), 'MODS_CATALOG.md must exist in root');
  const content = fs.readFileSync(catalogPath, 'utf-8');

  // 1. Structure & Headers
  assert.match(content, /^# Antigravity 2\.0 Mods & Framework Architectural Catalog/m);
  assert.match(content, /## Table of Contents/);
  assert.match(content, /## 1\. Active Mods & UI Slot Topology/);
  assert.match(content, /## 2\. Framework UI Slot Registry/);
  assert.match(content, /## 3\. Framework Core Runtime & SDK/);
  assert.match(content, /## 4\. Framework Services & Public API Reference/);
  assert.match(content, /## 5\. Test Suite Mapping & Coverage/);
  assert.match(content, /## 6\. Single-Line Repository File Responsibility Map/);

  // 2. All 6 Mods present
  assert.match(content, /`agent-selector`/);
  assert.match(content, /`context-tachometer`/);
  assert.match(content, /`git-graph`/);
  assert.match(content, /`mods-manager`/);
  assert.match(content, /`my-custom-mod`/);
  assert.match(content, /`voice-assistant`/);

  // 3. UI Slots present
  assert.match(content, /`header-actions`/);
  assert.match(content, /`aux-pane-tab`/);
  assert.match(content, /`chat-input-actions`/);
  assert.match(content, /`menubar-actions`/);

  // 4. Core modules & Services public methods
  assert.match(content, /`CdpPortResolver`/);
  assert.match(content, /`TelemetryService`/);
  assert.match(content, /`GitService`/);
  assert.match(content, /`WindowsDaemonService`/);
  assert.match(content, /`resolveSubagentModel\(\)`/);

  // 5. File Responsibility Map
  assert.match(content, /`framework\/core\/SlotManager\.js`:/);
  assert.match(content, /`scripts\/generate_mods_catalog\.mjs`:/);
});
