import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextTachometerMod } from '../../mods/context-tachometer/index.js';
import { getGaugeMetrics } from '../../mods/context-tachometer/components/GaugeSvg.js';

test('ContextTachometerMod - loads correct manifest metadata', () => {
  const mod = new ContextTachometerMod();
  assert.equal(mod.manifest.id, 'context-tachometer');
  assert.equal(mod.manifest.slot, 'header-actions');
  assert.equal(mod.manifest.priority, 50);
});

test('ContextTachometerMod - renders SVG gauge and popover markup with provided telemetry', () => {
  const mod = new ContextTachometerMod();
  const context = {
    telemetry: {
      estTokens: 42000,
      pct: '4.2',
      displayTokens: '42.0k',
      sizeKb: 150,
      steps: 80,
      breakdown: {
        user: { tokens: 5000, pct: 12 },
        model: { tokens: 10000, pct: 24 },
        thinking: { tokens: 15000, pct: 36 },
        tools: { tokens: 10000, pct: 24 },
        mcp: { tokens: 2000, pct: 5 },
        other: { tokens: 0, pct: 0 }
      }
    }
  };

  const rendered = mod.render(context);
  assert.ok(rendered.html);
  assert.ok(rendered.css);
  assert.ok(rendered.html.includes('antigravity-tachometer-badge'));
  assert.ok(rendered.html.includes('4.2%'));
  assert.ok(rendered.html.includes('42.0k'));
  assert.ok(rendered.html.includes('<svg'));
  assert.ok(rendered.html.includes('antigravity-waffle-grid'));
  assert.equal((rendered.html.match(/class="antigravity-waffle-cell"/g) || []).length, 100);
  assert.ok(rendered.html.includes('Gemini Unificado'));
  assert.ok(rendered.html.includes('Argon Semanal'));
  assert.ok(rendered.html.includes('Claude / GPT-OSS'));
});

test('ContextTachometerMod - styles include responsive collapse and compact rules', () => {
  const mod = new ContextTachometerMod();
  const rendered = mod.render({});
  assert.ok(rendered.css.includes('.compact'));
  assert.ok(rendered.css.includes('@media'));
  assert.ok(rendered.css.includes('display: none') || rendered.css.includes('display:none'));
  assert.ok(rendered.css.includes('.antigravity-tachometer-popover-portal .tach-model-details'));
  assert.ok(rendered.css.includes(':focus-visible'));
});

test('ContextTachometerMod - renders expandable subagents grouped inside Consumo por Modelo with XSS escaping', () => {
  const mod = new ContextTachometerMod();
  const context = {
    telemetry: {
      estTokens: 54000,
      pct: '5.4',
      displayTokens: '54.0k',
      sizeKb: 210,
      steps: 45,
      subagents: [
        {
          conversationId: 'sub-1',
          role: 'Deep Investigator <script>alert(1)</script>',
          typeName: 'DeepInvestigator',
          modelName: 'Gemini 4 Argon (High)',
          requestedModel: 'inherit',
          isInherited: true,
          tokens: 30000,
          displayTokens: '30.0k',
          status: 'done',
          depth: 0
        },
        {
          conversationId: 'sub-2',
          role: 'UI Builder',
          typeName: 'self',
          modelName: 'Gemini 3.8 Flash',
          requestedModel: 'flash',
          isInherited: false,
          tokens: 15000,
          displayTokens: '15.0k',
          status: 'running',
          depth: 0
        }
      ],
      modelQuota: {
        hasDualLimit: false,
        family: 'argon',
        modelName: 'Gemini 4 Argon (High)',
        singleLabel: 'Cuota Semanal Restante',
        weeklyRemaining: 84,
        weeklyUsed: 16,
        weeklyReset: '6d 12h'
      },
      chatModels: [
        {
          modelName: 'Gemini 4 Argon (High)',
          hasDualLimit: false,
          tokens: 65000,
          displayTokens: '65.0k',
          chatWeeklyPct: 13,
          subagentCount: 1,
          subagents: [
            {
              conversationId: 'sub-1',
              role: 'Deep Investigator <script>alert(1)</script>',
              typeName: 'DeepInvestigator',
              modelName: 'Gemini 4 Argon (High)',
              requestedModel: 'inherit',
              isInherited: true,
              tokens: 30000,
              displayTokens: '30.0k',
              status: 'done',
              depth: 0
            }
          ]
        },
        {
          modelName: 'Gemini 3.8 Flash',
          hasDualLimit: true,
          tokens: 15000,
          displayTokens: '15.0k',
          chatRollingPct: 5,
          chatWeeklyPct: 1,
          subagentCount: 1,
          subagents: [
            {
              conversationId: 'sub-2',
              role: 'UI Builder',
              typeName: 'self',
              modelName: 'Gemini 3.8 Flash',
              requestedModel: 'flash',
              isInherited: false,
              tokens: 15000,
              displayTokens: '15.0k',
              status: 'running',
              depth: 0
            }
          ]
        }
      ],
      breakdown: {
        user: { tokens: 5000, pct: 9 },
        model: { tokens: 12000, pct: 22 },
        thinking: { tokens: 20000, pct: 37 },
        tools: { tokens: 15000, pct: 28 },
        mcp: { tokens: 2000, pct: 4 }
      }
    }
  };

  const rendered = mod.render(context);
  assert.ok(rendered.html.includes('Consumo por Modelo en este Chat'));
  assert.ok(rendered.html.includes('2 subagentes'));
  assert.ok(rendered.html.includes('<details class="tach-model-details" data-model-key="Gemini 4 Argon (High)">'));
  assert.ok(rendered.html.includes('<summary class="tach-model-summary">'));
  assert.ok(rendered.html.includes('1 sub'));
  assert.ok(rendered.html.includes('inherit'));
  assert.ok(rendered.html.includes('flash'));
  assert.ok(rendered.html.includes('UI Builder'));
  assert.ok(!rendered.html.includes('<script>alert(1)</script>'));
  assert.ok(rendered.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('getGaugeMetrics - computes clamped angle and threshold palette accurately', () => {
  const low = getGaugeMetrics(10);
  assert.equal(low.clampedPct, 10);
  assert.equal(low.needleColor, '#22c55e');
  assert.equal(low.angle, -96);

  const med = getGaugeMetrics(50);
  assert.equal(med.needleColor, '#eab308');
  assert.equal(med.angle, 0);

  const high = getGaugeMetrics(75);
  assert.equal(high.needleColor, '#f97316');

  const crit = getGaugeMetrics(130);
  assert.equal(crit.clampedPct, 100);
  assert.equal(crit.needleColor, '#ef4444');
  assert.equal(crit.angle, 120);
});
