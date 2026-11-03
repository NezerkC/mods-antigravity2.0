import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceAssistantMod, TextSanitizer, ActionNarratorService } from '../../mods/voice-assistant/index.js';
import { renderVoiceButtonHtml } from '../../mods/voice-assistant/components/VoiceButtonHtml.js';

test('VoiceAssistantMod - loads correct manifest metadata', () => {
  const mod = new VoiceAssistantMod();
  assert.equal(mod.id, 'voice-assistant');
  assert.equal(mod.name, 'Voice Assistant');
  assert.equal(mod.slot, 'chat-input-actions');
  assert.equal(mod.priority, 40);
});

test('VoiceAssistantMod - renders voice button and scoped styles', () => {
  const mod = new VoiceAssistantMod();
  const output = mod.render({ voiceState: 'idle' });

  assert.ok(output.html);
  assert.ok(output.html.includes('antigravity-voice-assistant-btn'));
  assert.ok(output.html.includes('data-mod-action="toggle-voice"'));
  assert.ok(output.html.includes('aria-label="Asistente de Voz (TTS)"'));
  assert.ok(output.css.includes('.antigravity-voice-assistant-btn'));
});

test('renderVoiceButtonHtml - handles speaking and muted states correctly', () => {
  const speakingHtml = renderVoiceButtonHtml({ state: 'speaking', enabled: true });
  assert.ok(speakingHtml.includes('state-speaking'));
  assert.ok(speakingHtml.includes('data-voice-state="speaking"'));

  const mutedHtml = renderVoiceButtonHtml({ state: 'idle', enabled: false });
  assert.ok(mutedHtml.includes('state-muted'));
  assert.ok(mutedHtml.includes('mute-slash'));
});

test('TextSanitizer - cleans code blocks, markdown links, images and URLs', () => {
  const raw = `
    Hola, aquí está el código:
    \`\`\`javascript
    const x = 10;
    console.log(x);
    \`\`\`
    Puedes revisar la [documentación](https://example.com/docs) y la imagen ![logo](https://example.com/logo.png).
    Visita https://antigravity.dev para más detalles.
  `;

  const clean = TextSanitizer.sanitizeForSpeech(raw);

  assert.ok(!clean.includes('const x = 10;'));
  assert.ok(clean.includes('[bloque de código omitido]'));
  assert.ok(clean.includes('documentación'));
  assert.ok(!clean.includes('https://example.com/docs'));
  assert.ok(!clean.includes('https://example.com/logo.png'));
  assert.ok(!clean.includes('https://antigravity.dev'));
});

test('ActionNarratorService - translates thought and progress steps into Spanish', () => {
  assert.equal(ActionNarratorService.translateAction('Thought for 14s'), 'Pensando...');
  assert.equal(ActionNarratorService.translateAction('Explored files, ran commands'), 'Explorando archivos y ejecutando comandos...');
  assert.equal(ActionNarratorService.translateAction('Ran check git status and remotes'), 'Verificando estado de Git...');
  assert.equal(ActionNarratorService.translateAction('Ran list project files'), 'Listando archivos del proyecto...');
  assert.equal(ActionNarratorService.translateAction('Ran commands'), 'Ejecutando comandos...');
});

test('ActionNarratorService - translates file operations into Spanish', () => {
  assert.equal(ActionNarratorService.translateAction('Read file package.json'), 'Leyendo archivo package.json...');
  assert.equal(ActionNarratorService.translateAction('Edit file framework/core/SlotManager.js'), 'Modificando archivo SlotManager.js...');
  assert.equal(ActionNarratorService.translateAction('Write file mods/voice-assistant/manifest.json'), 'Creando archivo manifest.json...');
});

test('ActionNarratorService - translates subagent dispatch and return events', () => {
  // Dispatch with role
  const dispatchPhrase = ActionNarratorService.translateAction('invoke_subagent', {
    type: 'subagent_dispatch',
    role: 'Codebase Researcher'
  });
  assert.equal(dispatchPhrase, 'Delegando tarea a subagente Codebase Researcher');

  // Return event
  const returnPhrase = ActionNarratorService.translateAction('', {
    type: 'subagent_return'
  });
  assert.equal(returnPhrase, 'Recepcionando respuestas de subagentes');
});
