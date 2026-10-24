import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntigravityMod } from '../../framework/sdk/AntigravityMod.js';
import { renderGitGraphTabButton, renderGitGraphPanelHtml } from './components/GitGraphPanelHtml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Mod providing live topological Git branch & commit visualization in the Auxiliary Pane.
 */
export class GitGraphMod extends AntigravityMod {
  constructor() {
    super({
      id: 'git-graph',
      name: 'Git & GitHub Topological Graph',
      version: '2.0.0',
      slot: 'aux-pane-tab',
      priority: 60
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
   * Renders the auxiliary pane tab button and panel template markup.
   * @param {Object} [context]
   * @returns {{ html: string, css: string }}
   */
  render(context = {}) {
    const tabButtonHtml = renderGitGraphTabButton();
    const panelHtml = renderGitGraphPanelHtml(context);

    const html = `
      ${tabButtonHtml}
      <template id="antigravity-git-panel-template">
        ${panelHtml}
      </template>
    `.trim();

    return {
      html,
      css: this.cachedCss
    };
  }
}
