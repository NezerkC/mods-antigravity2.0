import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntigravityMod } from '../../framework/sdk/AntigravityMod.js';
import { TextSanitizer } from './services/TextSanitizer.js';
import { ActionNarratorService } from './services/ActionNarratorService.js';
import { XttsLocalAdapter } from './services/XttsLocalAdapter.js';
import { VoicePromptConditioner, VOICE_MODES } from './services/VoicePromptConditioner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_GLOBAL_SLOTS = new Set(['menubar-actions', 'floating-dock']);

export { TextSanitizer, ActionNarratorService, XttsLocalAdapter, VoicePromptConditioner, VOICE_MODES };

export class VoiceAssistantMod extends AntigravityMod {
  constructor(options = {}) {
    const isGlobalMode = options.globalMode === true;
    const requestedGlobalSlot = options.globalSlot && ALLOWED_GLOBAL_SLOTS.has(options.globalSlot)
      ? options.globalSlot
      : 'menubar-actions';
    const resolvedSlot = isGlobalMode
      ? requestedGlobalSlot
      : (options.globalMode === undefined && options.globalSlot && ALLOWED_GLOBAL_SLOTS.has(options.globalSlot)
        ? options.globalSlot
        : 'chat-input-actions');

    super({
      id: 'voice-assistant',
      name: 'Voice Assistant',
      version: '1.0.0',
      slot: resolvedSlot,
      priority: 40
    });

    this.globalMode = isGlobalMode || resolvedSlot !== 'chat-input-actions';
    this.globalSlot = resolvedSlot;
    this.narratorService = options.narratorService || ActionNarratorService;
    this.sanitizer = options.sanitizer || TextSanitizer;
    this.ttsAdapter = options.ttsAdapter || new XttsLocalAdapter(options.ttsOptions || {});
    this.promptConditioner = options.promptConditioner || new VoicePromptConditioner(options.conditionerOptions || {});

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
   * Returns scoped Voice Mode HUD stylesheets without mounting a chat-input speaker button.
   * @param {Object} [context={}]
   * @returns {{ html: string, css: string }}
   */
  render(context = {}) {
    return {
      html: '',
      css: this.cachedCss
    };
  }

  /**
   * Conditions agent selection, mode, and multi-chat routing from a voice transcript or `<talker_agent_context>`.
   * @param {string|Object} transcriptOrContext
   * @param {Object} [options={}]
   * @returns {Object}
   */
  conditionVoicePrompt(transcriptOrContext, options = {}) {
    return this.promptConditioner.condition(transcriptOrContext, options);
  }

  /**
   * Synthesizes text using the configured TTS adapter.
   * @param {string} text
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async synthesize(text, options = {}) {
    if (!this.ttsAdapter || typeof this.ttsAdapter.synthesize !== 'function') {
      return { success: false, reason: 'no_adapter' };
    }
    return this.ttsAdapter.synthesize(text, options);
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
