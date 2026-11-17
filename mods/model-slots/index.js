// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Victor Manuel Martinez Munoz

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntigravityMod } from '../../framework/sdk/AntigravityMod.js';
import { renderModelSlotsMenubarHtml } from './components/ModelSlotsHtml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Mod providing dual menubar selectors for Planner and Builder model slots.
 */
export class ModelSlotsMod extends AntigravityMod {
  constructor() {
    super({
      id: 'model-slots',
      name: 'Planner & Builder Model Slots',
      version: '1.0.0',
      slot: 'menubar-actions',
      priority: 90
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
   * Renders the top menubar buttons for Planner and Builder slots.
   * @param {Object} [context]
   * @returns {{ html: string, css: string }}
   */
  render(context = {}) {
    const slots = context.slots || context.modelSlots;
    return {
      html: renderModelSlotsMenubarHtml(slots),
      css: this.cachedCss
    };
  }
}
