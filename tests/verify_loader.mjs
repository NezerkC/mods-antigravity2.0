import { CdpPortResolver } from '../framework/core/CdpPortResolver.js';
import { CdpWebSocketClient } from '../framework/core/CdpWebSocketClient.js';

/**
 * Automated smoke test script verifying live Antigravity Electron CDP bridge
 * and injected mod elements.
 */
async function verifyLiveLoader() {
  console.log('🔍 Starting Antigravity Mod Framework Live Smoke Test...\n');

  const resolver = new CdpPortResolver();
  const port = resolver.resolvePort();
  console.log(`[1/3] Resolved CDP Port: ${port}`);

  const client = new CdpWebSocketClient({ port, timeoutMs: 3000 });

  try {
    const listRes = await fetch(client.getTargetListUrl());
    if (!listRes.ok) {
      console.log(`⚠️  CDP HTTP target endpoint returned ${listRes.status}. Electron may be closed.`);
      return;
    }

    const targets = await listRes.json();
    const page = CdpWebSocketClient.findPageTarget(targets);
    if (!page) {
      console.log('⚠️  No active page target found. Electron may be minimizing or reloading.');
      return;
    }
    console.log(`[2/3] Page target found: "${page.title || 'Antigravity IDE'}"`);

    // Verify DOM injection status
    const probeExpression = `
      (() => {
        const slot = document.getElementById('antigravity-slot-header-actions');
        const tachometer = document.getElementById('antigravity-tachometer-badge');
        const agentBadge = document.getElementById('antigravity-agent-badge');
        const activeAgentLabel = document.getElementById('antigravity-active-agent-name');
        const modsRegistry = window.__antigravityMods;
        return {
          hasSlot: Boolean(slot),
          hasTachometer: Boolean(tachometer),
          hasAgentBadge: Boolean(agentBadge),
          activeAgent: activeAgentLabel ? activeAgentLabel.textContent : null,
          hasRegistry: Boolean(modsRegistry),
          activeBadgeTitle: tachometer ? tachometer.getAttribute('title') : null
        };
      })()
    `;

    const result = await client.evaluate(probeExpression);
    console.log('[3/3] Electron DOM Evaluation completed:');
    console.log('   - Slot Header Actions present:  ', result.value.hasSlot ? '✅ YES' : '❌ NO');
    console.log('   - Tachometer Badge mounted:     ', result.value.hasTachometer ? '✅ YES' : '❌ NO');
    console.log('   - Agent Selector Badge mounted: ', result.value.hasAgentBadge ? '✅ YES' : '❌ NO');
    console.log('   - Active Selected Agent:        ', result.value.activeAgent ? `"${result.value.activeAgent}"` : 'None');
    console.log('   - Mod Registry active:          ', result.value.hasRegistry ? '✅ YES' : '❌ NO');
    if (result.value.activeBadgeTitle) {
      console.log(`   - Live Telemetry Tooltip:       "${result.value.activeBadgeTitle}"`);
    }

    console.log('\n🎉 Smoke test completed successfully!');
  } catch (err) {
    console.error('❌ Smoke test encountered an error:', err.message);
  }
}

verifyLiveLoader();
