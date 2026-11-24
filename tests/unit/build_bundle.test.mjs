import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const buildScriptPath = path.join(repoRoot, 'build.js');
const loaderDistPath = path.join(repoRoot, 'dist', 'antigravity_mod_loader.mjs');
const legacyDistPath = path.join(repoRoot, 'dist', 'update_ui_badge.mjs');

test('build.js - reads and orders VoicePromptConditioner before VoiceAssistantMod', () => {
  const buildSource = fs.readFileSync(buildScriptPath, 'utf-8');

  assert.match(
    buildSource,
    /cleanModuleCode\(['"]mods\/voice-assistant\/services\/VoicePromptConditioner\.js['"]\)/,
    'build.js must load VoicePromptConditioner.js via cleanModuleCode'
  );

  const conditionerPos = buildSource.indexOf('${voicePromptConditioner}');
  const indexPos = buildSource.indexOf('${voiceAssistantIndex}');

  assert.ok(conditionerPos !== -1, 'build.js must interpolate ${voicePromptConditioner}');
  assert.ok(indexPos !== -1, 'build.js must interpolate ${voiceAssistantIndex}');
  assert.ok(conditionerPos < indexPos, 'VoicePromptConditioner must appear before voiceAssistantIndex');
});

test('dist bundles - contain VOICE_MODES and VoicePromptConditioner before VoiceAssistantMod and pass node --check', () => {
  assert.ok(fs.existsSync(loaderDistPath), 'dist/antigravity_mod_loader.mjs must exist');
  assert.ok(fs.existsSync(legacyDistPath), 'dist/update_ui_badge.mjs must exist');

  const loaderCode = fs.readFileSync(loaderDistPath, 'utf-8');
  const legacyCode = fs.readFileSync(legacyDistPath, 'utf-8');
  assert.equal(loaderCode, legacyCode, 'dist/antigravity_mod_loader.mjs and dist/update_ui_badge.mjs should match');

  const voiceModesPos = loaderCode.indexOf('const VOICE_MODES =');
  const conditionerClassPos = loaderCode.indexOf('class VoicePromptConditioner');
  const voiceAssistantClassPos = loaderCode.indexOf('class VoiceAssistantMod');

  assert.ok(voiceModesPos !== -1, 'Bundle must define VOICE_MODES');
  assert.ok(conditionerClassPos !== -1, 'Bundle must define VoicePromptConditioner');
  assert.ok(voiceAssistantClassPos !== -1, 'Bundle must define VoiceAssistantMod');
  assert.ok(voiceModesPos < voiceAssistantClassPos, 'VOICE_MODES must be defined before VoiceAssistantMod');
  assert.ok(conditionerClassPos < voiceAssistantClassPos, 'VoicePromptConditioner must be defined before VoiceAssistantMod');

  execFileSync(process.execPath, ['--check', loaderDistPath], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', legacyDistPath], { stdio: 'pipe' });
});

test('dist/antigravity_mod_loader.mjs - evaluates top-level module without ReferenceError for VoicePromptConditioner', async () => {
  const loaderCode = fs.readFileSync(loaderDistPath, 'utf-8');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-bundle-test-'));
  const tempBundlePath = path.join(tempDir, 'antigravity_mod_loader_probe.mjs');

  try {
    const testEntryCode = loaderCode.replace(
      /\nmain\(\);\s*$/,
      '\nexport { VoiceAssistantMod, VoicePromptConditioner, VOICE_MODES };\n'
    );
    assert.notEqual(testEntryCode, loaderCode, 'Expected bundle to end with main() entrypoint call');

    fs.writeFileSync(tempBundlePath, testEntryCode, 'utf-8');

    const modNamespace = await import(pathToFileURL(tempBundlePath).href);
    assert.equal(typeof modNamespace.VoicePromptConditioner, 'function');
    assert.equal(modNamespace.VOICE_MODES.PLAN, 'PLAN');
    assert.equal(modNamespace.VOICE_MODES.BUILD, 'BUILD');

    const voiceMod = new modNamespace.VoiceAssistantMod();
    const conditioned = voiceMod.conditionVoicePrompt('Diseña la arquitectura del módulo de pagos');
    assert.equal(conditioned.mode, 'PLAN');
    assert.ok(conditioned.agent?.id);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
