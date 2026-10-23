import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntigravityMod } from '../../src/sdk/AntigravityMod.js';
import { renderGaugeSvg } from './components/GaugeSvg.js';
import { renderPopoverHtml } from './components/PopoverHtml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ContextTachometerMod extends AntigravityMod {
  constructor() {
    super({
      id: 'context-tachometer',
      name: 'Context Window Tachometer',
      version: '2.0.0',
      slot: 'header-actions',
      priority: 50
    });

    this.cachedCss = '';
    try {
      const cssPath = path.join(__dirname, 'styles.css');
      if (fs.existsSync(cssPath)) {
        this.cachedCss = fs.readFileSync(cssPath, 'utf-8');
      }
    } catch {
      // In bundled mode CSS can be inlined
    }
  }

  /**
   * Renders the analog speedometer badge with context percentage and interactive popover.
   * @param {Object} context
   * @returns {{ html: string, css: string }}
   */
  render(context = {}) {
    const telemetry = context.telemetry || {
      estTokens: 0,
      pct: '0.0',
      displayTokens: '0',
      sizeKb: 0,
      steps: 0,
      breakdown: {
        user: { tokens: 0, pct: 0 },
        model: { tokens: 0, pct: 0 },
        thinking: { tokens: 0, pct: 0 },
        tools: { tokens: 0, pct: 0 },
        mcp: { tokens: 0, pct: 0 },
        other: { tokens: 0, pct: 0 }
      }
    };

    const pctNum = parseFloat(telemetry.pct) || 0;
    const gaugeSvg = renderGaugeSvg(pctNum, 17);
    const popoverHtml = renderPopoverHtml(telemetry);

    const html = `
      <div id="antigravity-tachometer-badge" class="antigravity-tachometer-badge" title="Context: ${telemetry.displayTokens} tokens (${telemetry.pct}%)" tabindex="0">
        ${gaugeSvg}
        <span class="tachometer-tokens" style="font-weight: 500; letter-spacing: -0.01em; pointer-events: none;">${telemetry.displayTokens}</span>
        <span class="tachometer-pct" style="color: #a1a1aa; font-size: 10px; pointer-events: none;">(${telemetry.pct}%)</span>
        <template class="antigravity-popover-template">
          ${popoverHtml}
        </template>
      </div>
    `.trim();

    return {
      html,
      css: this.cachedCss
    };
  }
}
