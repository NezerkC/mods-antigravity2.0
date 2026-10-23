import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntigravityMod } from '../../src/sdk/AntigravityMod.js';
import { renderAgentIconSvg } from './components/AgentIconSvg.js';
import { renderAgentDropdownHtml, getAgentColor } from './components/AgentDropdownHtml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentSelectorMod extends AntigravityMod {
  constructor() {
    super({
      id: 'agent-selector',
      name: 'Agent Role Selector',
      version: '1.0.0',
      slot: 'header-actions',
      priority: 45
    });

    this.cachedCss = '';
    try {
      const cssPath = path.join(__dirname, 'styles.css');
      if (fs.existsSync(cssPath)) {
        this.cachedCss = fs.readFileSync(cssPath, 'utf-8');
      }
    } catch {}
  }

  /**
   * Renders the agent badge with the fedora/sunglasses icon and interactive selection dropdown.
   * @param {Object} context
   * @returns {{ html: string, css: string }}
   */
  render(context = {}) {
    const iconSvg = renderAgentIconSvg(16);
    const initialAgentId = 'lead-architect';
    const initialAgentName = 'Lead Architect';
    const initialColor = getAgentColor(initialAgentId);
    const dropdownHtml = renderAgentDropdownHtml(initialAgentId);

    const html = `
      <div 
        id="antigravity-agent-badge" 
        class="antigravity-agent-badge" 
        title="Active Specialist: ${initialAgentName}" 
        style="border-color: ${initialColor}55; box-shadow: 0 0 8px ${initialColor}22;"
        tabindex="0"
        onclick="window.__toggleAgentDropdown(event, this)"
      >
        <span 
          id="antigravity-active-agent-dot" 
          class="agent-badge-dot" 
          style="background: ${initialColor}; box-shadow: 0 0 6px ${initialColor};"
        ></span>
        ${iconSvg}
        <span id="antigravity-active-agent-name" class="agent-label">${initialAgentName}</span>
        <span class="agent-caret">▼</span>
        <div class="antigravity-agent-dropdown-wrapper" onclick="event.stopPropagation()">
          ${dropdownHtml}
        </div>
      </div>
    `.trim();

    return {
      html,
      css: this.cachedCss
    };
  }
}
