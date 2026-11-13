import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VoiceAssistantMod,
  TextSanitizer,
  ActionNarratorService,
  XttsLocalAdapter
} from '../../mods/voice-assistant/index.js';

test('VoiceAssistantMod - loads correct manifest metadata', () => {
  const mod = new VoiceAssistantMod();
  assert.equal(mod.id, 'voice-assistant');
  assert.equal(mod.name, 'Voice Assistant');
  assert.equal(mod.slot, 'chat-input-actions');
  assert.equal(mod.priority, 40);
});

test('VoiceAssistantMod - renders Top HUD styles without mounting a speaker button', () => {
  const mod = new VoiceAssistantMod();
  const output = mod.render({ voiceState: 'idle' });

  assert.equal(output.html, '');
  assert.ok(!output.html.includes('antigravity-voice-assistant-btn'));
  assert.ok(!output.css.includes('.antigravity-voice-assistant-btn'));
  assert.ok(output.css.includes('.antigravity-voice-toast-docked'));
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

test('XttsLocalAdapter - manifest and export check', () => {
  assert.equal(typeof XttsLocalAdapter, 'function');
  const adapter = new XttsLocalAdapter({
    baseUrl: 'http://localhost:8020/',
    voice: 'custom-voice',
    language: 'es'
  });
  assert.equal(adapter.baseUrl, 'http://localhost:8020');
  assert.equal(adapter.voice, 'custom-voice');
  assert.equal(adapter.language, 'es');

  // Verify VoiceAssistantMod instantiates default adapter or accepts custom
  const modDefault = new VoiceAssistantMod();
  assert.ok(modDefault.ttsAdapter instanceof XttsLocalAdapter);

  const customAdapter = new XttsLocalAdapter();
  const modCustom = new VoiceAssistantMod({ ttsAdapter: customAdapter });
  assert.equal(modCustom.ttsAdapter, customAdapter);
});

test('XttsLocalAdapter - isAvailable() returns true when fetch returns ok, false on error', async () => {
  // Case 1: Healthy
  const mockFetchOk = async (url) => {
    assert.ok(url.includes('/health'));
    return { ok: true, status: 200 };
  };
  const adapterOk = new XttsLocalAdapter({ fetchFn: mockFetchOk });
  const isOk = await adapterOk.isAvailable();
  assert.equal(isOk, true);

  // Case 2: Unhealthy status
  const mockFetch503 = async () => ({ ok: false, status: 503 });
  const adapter503 = new XttsLocalAdapter({ fetchFn: mockFetch503 });
  const is503 = await adapter503.isAvailable();
  assert.equal(is503, false);

  // Case 3: Network rejection / timeout
  const mockFetchReject = async () => {
    throw new Error('Connection refused');
  };
  const adapterReject = new XttsLocalAdapter({ fetchFn: mockFetchReject });
  const isReject = await adapterReject.isAvailable();
  assert.equal(isReject, false);
});

test('XttsLocalAdapter - synthesize() uses XTTS when available', async () => {
  let postedPayload = null;
  const mockBuffer = new Uint8Array([1, 2, 3, 4]).buffer;

  const mockFetch = async (url, options) => {
    if (url.includes('/health')) {
      return { ok: true, status: 200 };
    }
    if (url.includes('/v1/audio/speech')) {
      assert.equal(options.method, 'POST');
      postedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => mockBuffer
      };
    }
    return { ok: false, status: 404 };
  };

  const adapter = new XttsLocalAdapter({
    baseUrl: 'http://127.0.0.1:8020',
    voice: 'female-1',
    language: 'es',
    fetchFn: mockFetch
  });

  const result = await adapter.synthesize('Hola mundo desde Antigravity', {
    response_format: 'wav'
  });

  assert.equal(result.success, true);
  assert.equal(result.source, 'xtts');
  assert.equal(result.format, 'wav');
  assert.equal(result.audioBuffer, mockBuffer);
  assert.deepEqual(postedPayload, {
    input: 'Hola mundo desde Antigravity',
    voice: 'female-1',
    language: 'es',
    response_format: 'wav'
  });
});

test('XttsLocalAdapter - synthesize() falls back to speech synthesis mock when XTTS is unavailable', async () => {
  // Case 1: XTTS unavailable, fallback to Web Speech
  let spokenUtterance = null;
  const mockSynth = {
    speak: (utt) => {
      spokenUtterance = utt;
    }
  };

  const adapterFallback = new XttsLocalAdapter({
    fetchFn: async () => {
      throw new Error('XTTS offline');
    },
    speechSynthesis: mockSynth
  });

  const resFallback = await adapterFallback.synthesize('Prueba de fallback a Web Speech');
  assert.equal(resFallback.success, true);
  assert.equal(resFallback.source, 'web_speech');
  assert.ok(spokenUtterance);

  // Case 2: Neither available
  const adapterNone = new XttsLocalAdapter({
    fetchFn: async () => {
      throw new Error('XTTS offline');
    },
    speechSynthesis: null
  });

  const resNone = await adapterNone.synthesize('Sin motor de voz');
  assert.equal(resNone.success, false);
  assert.equal(resNone.source, 'none');
  assert.equal(resNone.reason, 'no_tts_engine_available');
});

test('XttsLocalAdapter - synthesize() returns empty_text error when text is empty', async () => {
  const adapter = new XttsLocalAdapter();

  const resEmpty = await adapter.synthesize('');
  assert.deepEqual(resEmpty, { success: false, reason: 'empty_text' });

  const resWhitespace = await adapter.synthesize('   \n  \t  ');
  assert.deepEqual(resWhitespace, { success: false, reason: 'empty_text' });

  const resNull = await adapter.synthesize(null);
  assert.deepEqual(resNull, { success: false, reason: 'empty_text' });

  const resUndefined = await adapter.synthesize(undefined);
  assert.deepEqual(resUndefined, { success: false, reason: 'empty_text' });
});
