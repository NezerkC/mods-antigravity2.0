// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Victor Manuel Martinez Munoz

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntigravityMod } from '../../framework/sdk/AntigravityMod.js';
import { renderPitWallMenubarButton } from './components/PitWallHtml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * First-party menubar mod providing all-time Pit Wall telemetry,
 * active stretches, consistency heatmap, and API cost analytics.
 */
export class PitWallMod extends AntigravityMod {
  constructor() {
    super({
      id: 'pit-wall',
      name: 'Pit Wall Telemetry & Cost Analytics',
      version: '1.0.0',
      slot: 'menubar-actions',
      priority: 85
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
   * Renders the compact Pit Wall button in the top menubar.
   * @param {Object} [context]
   * @returns {{ html: string, css: string }}
   */
  render(context = {}) {
    return {
      html: renderPitWallMenubarButton(context.pitWall || {}),
      css: this.cachedCss
    };
  }
}
