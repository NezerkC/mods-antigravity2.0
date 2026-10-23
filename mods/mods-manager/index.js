import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntigravityMod } from '../../framework/sdk/AntigravityMod.js';
import { renderModsManagerButton } from './components/ModsManagerHtml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * First-party Mod providing a top menubar control center to enable/disable
 * individual mods and toggle background daemon auto-injection persistence.
 */
export class ModsManagerMod extends AntigravityMod {
  constructor() {
    super({
      id: 'mods-manager',
      name: 'Mods Manager & Persistence Control',
      version: '1.0.0',
      slot: 'menubar-actions',
      priority: 100
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
   * Renders the top menubar button and styles for the Mods Manager.
   * @param {Object} [context]
   * @returns {{ html: string, css: string }}
   */
  render(context = {}) {
    return {
      html: renderModsManagerButton(),
      css: this.cachedCss
    };
  }
}
