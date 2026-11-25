import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VoiceAssistantMod,
  VoicePromptConditioner,
  VOICE_MODES
} from '../../mods/voice-assistant/index.js';

test('VoicePromptConditioner.extractSpokenText - extracts latest user line from <talker_agent_context> block', () => {
  const contextBlock = `
<talker_agent_context>
talker_agent: "Hola Victor, ¿qué vamos a construir hoy?"
user: "Explora primero los archivos del módulo de pagos"
talker_agent: "Listo, encontré tres servicios principales."
user: "Diseña la arquitectura hexagonal para la pasarela de pagos"
</talker_agent_context>
  `;

  const extracted = VoicePromptConditioner.extractSpokenText(contextBlock);
  assert.equal(extracted, 'Diseña la arquitectura hexagonal para la pasarela de pagos');
});

test('VoicePromptConditioner.extractSpokenText - handles raw transcripts, object inputs, and empty talker blocks', () => {
  assert.equal(
    VoicePromptConditioner.extractSpokenText('Implementa el adaptador HTTP con TDD'),
    'Implementa el adaptador HTTP con TDD'
  );

  assert.equal(
    VoicePromptConditioner.extractSpokenText({ transcript: 'Corrige el bug en el login' }),
    'Corrige el bug en el login'
  );

  const onlyTalkerBlock = `
<talker_agent_context>
talker_agent: "Estoy escuchando..."
</talker_agent_context>
  `;
  assert.equal(VoicePromptConditioner.extractSpokenText(onlyTalkerBlock), '');
  assert.equal(VoicePromptConditioner.extractSpokenText(''), '');
  assert.equal(VoicePromptConditioner.extractSpokenText(null), '');
});

test('VoicePromptConditioner.classifyIntent - classifies PLAN, BUILD, DEBUG, and RESEARCH modes accurately', () => {
  // 1. PLAN
  const planRes = VoicePromptConditioner.classifyIntent(
    'Diseña la arquitectura y estructura el diagrama ADR para el microservicio de órdenes'
  );
  assert.equal(planRes.mode, VOICE_MODES.PLAN);
  assert.equal(planRes.effectiveMode, 'PLAN');
  assert.equal(planRes.agent.id, 'lead-architect');

  // 2. BUILD (general)
  const buildRes = VoicePromptConditioner.classifyIntent(
    'Implementa y crea el componente de barra de herramientas en el frontend'
  );
  assert.equal(buildRes.mode, VOICE_MODES.BUILD);
  assert.equal(buildRes.effectiveMode, 'BUILD');
  assert.equal(buildRes.agent.id, 'sdd-orchestrator');

  // 2b. BUILD with TDD -> sdd-apply
  const tddBuildRes = VoicePromptConditioner.classifyIntent(
    'Implementa el servicio de facturación aplicando TDD estricto'
  );
  assert.equal(tddBuildRes.mode, VOICE_MODES.BUILD);
  assert.equal(tddBuildRes.agent.id, 'sdd-apply');

  // 3. DEBUG
  const debugRes = VoicePromptConditioner.classifyIntent(
    'Corrige el error y depura el fallo que rompe los tests de sesión'
  );
  assert.equal(debugRes.mode, VOICE_MODES.DEBUG);
  assert.equal(debugRes.effectiveMode, 'BUILD');
  assert.equal(debugRes.agent.id, 'sdd-verify');

  // 4. RESEARCH
  const researchRes = VoicePromptConditioner.classifyIntent(
    'Investiga y explora dónde está implementado el cálculo de cuotas y cómo funciona'
  );
  assert.equal(researchRes.mode, VOICE_MODES.RESEARCH);
  assert.equal(researchRes.effectiveMode, 'PLAN');
  assert.equal(researchRes.agent.id, 'sdd-explore');
});

test('VoicePromptConditioner.evaluateGateman - detects Clean Architecture, Security, and Destructive guardrails', () => {
  const archRes = VoicePromptConditioner.classifyIntent(
    'Revisa las invariantes de Clean Architecture y el PR gate del módulo de dominio'
  );
  assert.equal(archRes.gateman.triggered, true);
  assert.equal(archRes.gateman.level, 'elevated');
  assert.ok(archRes.gateman.guardrails.includes('clean-architecture-invariants'));
  assert.equal(archRes.agent.id, 'code-reviewer');

  const secRes = VoicePromptConditioner.classifyIntent(
    'Audita vulnerabilidades OWASP y aplica hardening zero trust a los tokens expuestos'
  );
  assert.equal(secRes.gateman.triggered, true);
  assert.equal(secRes.gateman.level, 'strict');
  assert.equal(secRes.gateman.requiresApproval, true);
  assert.ok(secRes.gateman.guardrails.includes('security-zero-trust'));
  assert.equal(secRes.agent.id, 'security-engineer');

  const destructiveRes = VoicePromptConditioner.classifyIntent(
    'Activa gateman antes de ejecutar drop table o eliminar producción'
  );
  assert.equal(destructiveRes.gateman.triggered, true);
  assert.equal(destructiveRes.gateman.level, 'strict');
  assert.equal(destructiveRes.gateman.requiresApproval, true);
  assert.ok(destructiveRes.gateman.guardrails.includes('destructive-operation-guard'));
  assert.ok(destructiveRes.gateman.guardrails.includes('explicit-gateman-guard'));
});

test('VoicePromptConditioner.resolveTargetCascade - resolves global project/chat routing hints and falls back to active cascade', () => {
  const knownCascades = [
    { id: 'cascade-hermes-01', name: 'Hermes Server', project: 'hermes' },
    { id: 'cascade-billing-02', name: 'Billing API', project: 'pagos-api' }
  ];

  // Match by project name in prefix
  const routedProject = VoicePromptConditioner.condition(
    'En el proyecto hermes, diseña la arquitectura del orquestador',
    { cascades: knownCascades, activeCascadeId: 'cascade-billing-02' }
  );
  assert.equal(routedProject.routing.isGlobalRoute, true);
  assert.equal(routedProject.routing.matched, true);
  assert.equal(routedProject.routing.targetType, 'project');
  assert.equal(routedProject.routing.targetHint, 'hermes');
  assert.equal(routedProject.cascadeId, 'cascade-hermes-01');
  assert.equal(routedProject.mode, VOICE_MODES.PLAN);

  // Match by chat name inline
  const routedChat = VoicePromptConditioner.condition(
    'Corrige el bug del webhook en el chat pagos-api',
    { cascades: knownCascades, activeCascadeId: 'cascade-hermes-01' }
  );
  assert.equal(routedChat.routing.isGlobalRoute, true);
  assert.equal(routedChat.routing.matched, true);
  assert.equal(routedChat.routing.targetType, 'chat');
  assert.equal(routedChat.cascadeId, 'cascade-billing-02');
  assert.equal(routedChat.mode, VOICE_MODES.DEBUG);

  // Unmatched project hint falls back to activeCascadeId
  const fallbackRoute = VoicePromptConditioner.condition(
    'En el proyecto desconocido, explora los controladores',
    { cascades: knownCascades, activeCascadeId: 'cascade-hermes-01' }
  );
  assert.equal(fallbackRoute.routing.isGlobalRoute, true);
  assert.equal(fallbackRoute.routing.matched, false);
  assert.equal(fallbackRoute.routing.targetHint, 'desconocido');
  assert.equal(fallbackRoute.cascadeId, 'cascade-hermes-01');
  assert.equal(fallbackRoute.mode, VOICE_MODES.RESEARCH);
});

test('VoicePromptConditioner.attachToWindow - sets __conditionAgentFromVoice, updates badge + localStorage, and dispatches CustomEvent', () => {
  const storageStore = new Map();
  const mockLocalStorage = {
    getItem: (k) => (storageStore.has(k) ? storageStore.get(k) : null),
    setItem: (k, v) => storageStore.set(k, String(v))
  };

  const badgeAttrs = new Map();
  const labelNode = { textContent: 'Sin Agente' };
  const dotNode = { style: {} };

  const mockBadge = {
    style: {},
    setAttribute: (k, v) => badgeAttrs.set(k, String(v)),
    getAttribute: (k) => badgeAttrs.get(k) || null,
    closest: (sel) => (sel === '[data-cascade-id]' ? { getAttribute: () => 'cascade-voice-99' } : null),
    querySelector: (sel) => {
      if (sel.includes('antigravity-active-agent-name')) return labelNode;
      if (sel.includes('antigravity-active-agent-dot')) return dotNode;
      return null;
    }
  };

  const dispatchedEvents = [];
  const mockWindow = {
    localStorage: mockLocalStorage,
    document: {
      querySelectorAll: (sel) => {
        if (sel.includes('antigravity-agent-badge')) return [mockBadge];
        if (sel === '[data-cascade-id]') {
          return [{
            getAttribute: (attr) => (attr === 'data-cascade-id' ? 'cascade-voice-99' : 'joyful-chandrasekhar')
          }];
        }
        return [];
      },
      querySelector: (sel) => (sel === '[data-cascade-id]' ? { getAttribute: () => 'cascade-voice-99' } : mockBadge)
    },
    dispatchEvent: (evt) => {
      dispatchedEvents.push(evt);
      return true;
    }
  };

  VoicePromptConditioner.attachToWindow(mockWindow);
  assert.equal(typeof mockWindow.__conditionAgentFromVoice, 'function');

  const talkerPayload = `
<talker_agent_context>
talker_agent: "Te escucho"
user: "Implementa la validación con arquitectura hexagonal y TDD"
</talker_agent_context>
  `;

  const result = mockWindow.__conditionAgentFromVoice(talkerPayload);

  assert.equal(result.conditioned, true);
  assert.equal(result.mode, VOICE_MODES.BUILD);
  assert.equal(result.agent.id, 'sdd-apply');
  assert.equal(result.gatemanTriggered, true);
  assert.equal(result.cascadeId, 'cascade-voice-99');

  // Verify localStorage map update
  const savedMap = JSON.parse(mockLocalStorage.getItem('__antigravity_selected_agents_map'));
  assert.ok(savedMap['cascade-voice-99']);
  assert.equal(savedMap['cascade-voice-99'].id, 'sdd-apply');
  assert.equal(savedMap['cascade-voice-99'].mode, 'BUILD');
  assert.equal(savedMap['cascade-voice-99'].conditionedBy, 'voice');

  // Verify DOM badge update
  assert.equal(mockBadge.getAttribute('data-agent-id'), 'sdd-apply');
  assert.equal(mockBadge.getAttribute('data-voice-mode'), 'BUILD');
  assert.equal(mockBadge.getAttribute('data-gateman-active'), 'true');
  assert.equal(labelNode.textContent, 'SDD Apply (TDD)');

  // Verify dispatched event
  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, 'antigravity:voice-conditioned');
  assert.equal(dispatchedEvents[0].detail.agent.id, 'sdd-apply');
});

test('VoiceAssistantMod - supports globalMode and globalSlot while preserving backward-compatible default slot', () => {
  const defaultMod = new VoiceAssistantMod();
  assert.equal(defaultMod.slot, 'chat-input-actions');
  assert.equal(defaultMod.globalMode, false);

  const menubarGlobalMod = new VoiceAssistantMod({ globalMode: true });
  assert.equal(menubarGlobalMod.slot, 'menubar-actions');
  assert.equal(menubarGlobalMod.globalMode, true);

  const floatingDockGlobalMod = new VoiceAssistantMod({
    globalMode: true,
    globalSlot: 'floating-dock'
  });
  assert.equal(floatingDockGlobalMod.slot, 'floating-dock');
  assert.equal(floatingDockGlobalMod.globalMode, true);

  // Verify conditionVoicePrompt helper on VoiceAssistantMod
  const condResult = floatingDockGlobalMod.conditionVoicePrompt('Diseña el plan de migración');
  assert.equal(condResult.mode, VOICE_MODES.PLAN);
  assert.equal(condResult.agent.id, 'lead-architect');
});
