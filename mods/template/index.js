import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntigravityMod } from '../../framework/sdk/AntigravityMod.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MyCustomMod extends AntigravityMod {
  constructor() {
    super({
      id: 'my-custom-mod',
      name: 'My Custom Mod',
      version: '1.0.0',
      slot: 'header-actions',
      priority: 10
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
   * Optional initialization logic called when registered.
   * @param {Object} [context]
   */
  async onInit(context) {
    // Custom setup or event listeners
  }

  /**
   * Primary render method returning HTML and scoped CSS.
   * @param {Object} context
   * @returns {{ html: string, css: string }}
   */
  render(context = {}) {
    return {
      html: `
        <div class="my-custom-badge" title="My Custom Mod">
          <span>✨</span>
          <span>My Mod</span>
        </div>
      `.trim(),
      css: this.cachedCss
    };
  }

  /**
   * Optional update handler called on state transitions.
   * @param {Object} context
   */
  onUpdate(context) {}

  /**
   * Optional cleanup handler.
   */
  onDestroy() {}
}
