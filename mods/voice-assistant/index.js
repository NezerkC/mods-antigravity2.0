import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntigravityMod } from '../../framework/sdk/AntigravityMod.js';
import { renderVoiceButtonHtml } from './components/VoiceButtonHtml.js';
import { TextSanitizer } from './services/TextSanitizer.js';
import { ActionNarratorService } from './services/ActionNarratorService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export { TextSanitizer, ActionNarratorService };

export class VoiceAssistantMod extends AntigravityMod {
  constructor(options = {}) {
    super({
      id: 'voice-assistant',
      name: 'Voice Assistant',
      version: '1.0.0',
      slot: 'chat-input-actions',
      priority: 40
    });

    this.narratorService = options.narratorService || ActionNarratorService;
    this.sanitizer = options.sanitizer || TextSanitizer;

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

  get id() {
    return this.manifest.id;
  }

  get name() {
    return this.manifest.name;
  }

  get slot() {
    return this.manifest.slot;
  }

  get priority() {
    return this.manifest.priority;
  }

  /**
   * Renders the voice assistant button markup and scoped stylesheet.
   * @param {Object} [context={}]
   * @returns {{ html: string, css: string }}
   */
  render(context = {}) {
    const state = context.voiceState || 'idle';
    const enabled = context.voiceEnabled !== false;

    return {
      html: renderVoiceButtonHtml({ state, enabled }),
      css: this.cachedCss
    };
  }

  /**
   * Optional update handler called on state transitions.
   * @param {Object} context
   */
  onUpdate(context = {}) {}

  /**
   * Cleanup handler.
   */
  onDestroy() {}
}
