// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Victor Manuel Martinez Munoz

/**
 * Base models grouped with their supported effort levels for hierarchical flyout selection.
 * Acts as the static fallback before live discovery from Antigravity's native model selector context.
 */
export const BASE_MODELS = [
  {
    name: 'Gemini 4 Neon',
    family: 'Neon',
    color: '#a3e635',
    efforts: [
      { id: 'gemini-4-neon-low', label: 'Low', shortName: 'Neon Low' },
      { id: 'gemini-4-neon-medium', label: 'Medium', shortName: 'Neon Med' },
      { id: 'gemini-4-neon-high', label: 'High', shortName: 'Neon High' },
      { id: 'gemini-4-neon-xhigh', label: 'XHigh', shortName: 'Neon XHigh' }
    ]
  },
  {
    name: 'Gemini 4 Argon',
    family: 'Argon',
    color: '#38bdf8',
    efforts: [
      { id: 'gemini-4-argon-low', label: 'Low', shortName: 'Argon Low' },
      { id: 'gemini-4-argon-medium', label: 'Medium', shortName: 'Argon Med' },
      { id: 'gemini-4-argon-high', label: 'High', shortName: 'Argon High' }
    ]
  },
  {
    name: 'Gemini 4 Hydrogen',
    family: 'Hydrogen',
    color: '#34d399',
    efforts: [
      { id: 'gemini-4-hydrogen-low', label: 'Low', shortName: 'Hydrogen Low' },
      { id: 'gemini-4-hydrogen-medium', label: 'Medium', shortName: 'Hydrogen Med' },
      { id: 'gemini-4-hydrogen-high', label: 'High', shortName: 'Hydrogen High' },
      { id: 'gemini-4-hydrogen-xhigh', label: 'XHigh', shortName: 'Hydrogen XHigh' }
    ]
  },
  {
    name: 'Gemini 3.8 Flash',
    family: 'Gemini 3.8',
    color: '#fbbf24',
    efforts: [
      { id: 'gemini-3.8-flash-low', label: 'Low', shortName: 'Flash 3.8 Low' },
      { id: 'gemini-3.8-flash-medium', label: 'Medium', shortName: 'Flash 3.8 Med' },
      { id: 'gemini-3.8-flash-high', label: 'High', shortName: 'Flash 3.8 High' }
    ]
  },
  {
    name: 'Claude Opus 5.5',
    family: 'Claude',
    color: '#c084fc',
    efforts: [
      { id: 'claude-opus-5-5-low', label: 'Low', shortName: 'Opus 5.5 Low' },
      { id: 'claude-opus-5-5-medium', label: 'Medium', shortName: 'Opus 5.5 Med' },
      { id: 'claude-opus-5-5-high', label: 'High', shortName: 'Opus 5.5 High' }
    ]
  },
  {
    name: 'Claude Sonnet 5.5',
    family: 'Claude',
    color: '#a78bfa',
    efforts: [
      { id: 'claude-sonnet-5-5-low', label: 'Low', shortName: 'Sonnet 5.5 Low' },
      { id: 'claude-sonnet-5-5-medium', label: 'Medium', shortName: 'Sonnet 5.5 Med' },
      { id: 'claude-sonnet-5-5-high', label: 'High', shortName: 'Sonnet 5.5 High' }
    ]
  },
  {
    name: 'GPT-OSS 120B',
    family: 'OpenAI OSS',
    color: '#f472b6',
    efforts: [
      { id: 'gpt-oss-120b-medium', label: 'Medium', shortName: 'GPT-OSS 120B' }
    ]
  },
  {
    name: 'Orchestrator (Neon)',
    family: 'Neon',
    color: '#a3e635',
    efforts: [
      { id: 'gemini-pro-orchestrator-neon', label: 'Standard', shortName: 'Orch. Neon' }
    ]
  },
  {
    name: 'Orchestrator (Argon)',
    family: 'Argon',
    color: '#38bdf8',
    efforts: [
      { id: 'gemini-pro-orchestrator-g1-pro', label: 'Standard', shortName: 'Orchestrator' }
    ]
  }
];

/**
 * Full symmetrical catalog of supported models for Planner and Builder slots.
 */
export const MODEL_CATALOG = [
  {
    id: 'gemini-4-neon-xhigh',
    name: 'Gemini 4 Neon (XHigh)',
    shortName: 'Neon XHigh',
    family: 'Neon',
    color: '#a3e635'
  },
  {
    id: 'gemini-4-neon-high',
    name: 'Gemini 4 Neon (High)',
    shortName: 'Neon High',
    family: 'Neon',
    color: '#a3e635'
  },
  {
    id: 'gemini-4-neon-medium',
    name: 'Gemini 4 Neon (Medium)',
    shortName: 'Neon Med',
    family: 'Neon',
    color: '#a3e635'
  },
  {
    id: 'gemini-4-neon-low',
    name: 'Gemini 4 Neon (Low)',
    shortName: 'Neon Low',
    family: 'Neon',
    color: '#a3e635'
  },
  {
    id: 'gemini-4-argon-high',
    name: 'Gemini 4 Argon (High)',
    shortName: 'Argon High',
    family: 'Argon',
    color: '#38bdf8'
  },
  {
    id: 'gemini-4-argon-medium',
    name: 'Gemini 4 Argon (Medium)',
    shortName: 'Argon Med',
    family: 'Argon',
    color: '#38bdf8'
  },
  {
    id: 'gemini-4-argon-low',
    name: 'Gemini 4 Argon (Low)',
    shortName: 'Argon Low',
    family: 'Argon',
    color: '#38bdf8'
  },
  {
    id: 'gemini-4-hydrogen-xhigh',
    name: 'Gemini 4 Hydrogen (XHigh)',
    shortName: 'Hydrogen XHigh',
    family: 'Hydrogen',
    color: '#34d399'
  },
  {
    id: 'gemini-4-hydrogen-high',
    name: 'Gemini 4 Hydrogen (High)',
    shortName: 'Hydrogen High',
    family: 'Hydrogen',
    color: '#34d399'
  },
  {
    id: 'gemini-4-hydrogen-medium',
    name: 'Gemini 4 Hydrogen (Medium)',
    shortName: 'Hydrogen Med',
    family: 'Hydrogen',
    color: '#34d399'
  },
  {
    id: 'gemini-4-hydrogen-low',
    name: 'Gemini 4 Hydrogen (Low)',
    shortName: 'Hydrogen Low',
    family: 'Hydrogen',
    color: '#34d399'
  },
  {
    id: 'gemini-3.8-flash-high',
    name: 'Gemini 3.8 Flash (High)',
    shortName: 'Flash 3.8 High',
    family: 'Gemini 3.8',
    color: '#fbbf24'
  },
  {
    id: 'gemini-3.8-flash-medium',
    name: 'Gemini 3.8 Flash (Medium)',
    shortName: 'Flash 3.8 Med',
    family: 'Gemini 3.8',
    color: '#fbbf24'
  },
  {
    id: 'gemini-3.8-flash-low',
    name: 'Gemini 3.8 Flash (Low)',
    shortName: 'Flash 3.8 Low',
    family: 'Gemini 3.8',
    color: '#fbbf24'
  },
  {
    id: 'claude-opus-5-5-high',
    name: 'Claude Opus 5.5 (High)',
    shortName: 'Opus 5.5 High',
    family: 'Claude',
    color: '#c084fc'
  },
  {
    id: 'claude-opus-5-5-medium',
    name: 'Claude Opus 5.5 (Medium)',
    shortName: 'Opus 5.5 Med',
    family: 'Claude',
    color: '#c084fc'
  },
  {
    id: 'claude-opus-5-5-low',
    name: 'Claude Opus 5.5 (Low)',
    shortName: 'Opus 5.5 Low',
    family: 'Claude',
    color: '#c084fc'
  },
  {
    id: 'claude-sonnet-5-5-high',
    name: 'Claude Sonnet 5.5 (High)',
    shortName: 'Sonnet 5.5 High',
    family: 'Claude',
    color: '#a78bfa'
  },
  {
    id: 'claude-sonnet-5-5-medium',
    name: 'Claude Sonnet 5.5 (Medium)',
    shortName: 'Sonnet 5.5 Med',
    family: 'Claude',
    color: '#a78bfa'
  },
  {
    id: 'claude-sonnet-5-5-low',
    name: 'Claude Sonnet 5.5 (Low)',
    shortName: 'Sonnet 5.5 Low',
    family: 'Claude',
    color: '#a78bfa'
  },
  {
    id: 'gpt-oss-120b-medium',
    name: 'GPT-OSS 120B (Medium)',
    shortName: 'GPT-OSS 120B',
    family: 'OpenAI OSS',
    color: '#f472b6'
  },
  {
    id: 'gemini-pro-orchestrator-neon',
    name: 'Orchestrator (Neon)',
    shortName: 'Orch. Neon',
    family: 'Neon',
    color: '#a3e635'
  },
  {
    id: 'gemini-pro-orchestrator-g1-pro',
    name: 'Orchestrator (Argon)',
    shortName: 'Orchestrator',
    family: 'Argon',
    color: '#38bdf8'
  }
];

/**
 * Normalizes live Antigravity native model selector data (modelOptions, effortIndex, groups)
 * into canonical BASE_MODELS, MODEL_CATALOG, and disabledModels collections.
 * Self-contained so it can be serialized and injected directly into the Electron renderer.
 * @param {Array<Object>} rawOptions
 * @param {Map|Object|null} [effortIndex]
 * @param {Array<Object>} [groups]
 * @returns {{ baseModels: Array<Object>, modelCatalog: Array<Object>, disabledModels: Array<Object>, totalBaseModels: number, totalModels: number }}
 */
export function normalizeNativeModelCatalog(rawOptions = [], effortIndex = null, groups = []) {
  const effortOrder = {
    minimal: 0,
    low: 1,
    medium: 2,
    high: 3,
    xhigh: 4,
    max: 5,
    standard: 6
  };
  const effortDisplay = {
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'XHigh',
    max: 'Max',
    standard: 'Standard'
  };
  const effortShort = {
    minimal: 'Min',
    low: 'Low',
    medium: 'Med',
    high: 'High',
    xhigh: 'XHigh',
    max: 'Max',
    standard: ''
  };
  const fallbackPalette = ['#22d3ee', '#fb923c', '#f43f5e', '#818cf8', '#2dd4bf', '#e879f9'];

  const resolveStyle = (baseName) => {
    const lower = String(baseName || '').toLowerCase();
    if (lower.includes('neon')) return { family: 'Neon', color: '#a3e635' };
    if (lower.includes('argon')) return { family: 'Argon', color: '#38bdf8' };
    if (lower.includes('hydrogen')) return { family: 'Hydrogen', color: '#34d399' };
    if (lower.includes('carbon')) return { family: 'Carbon', color: '#94a3b8' };
    if (lower.includes('flash')) return { family: 'Gemini 3.8', color: '#fbbf24' };
    if (lower.includes('opus')) return { family: 'Claude', color: '#c084fc' };
    if (lower.includes('sonnet')) return { family: 'Claude', color: '#a78bfa' };
    if (lower.includes('claude')) return { family: 'Claude', color: '#c084fc' };
    if (lower.includes('gpt-oss') || lower.includes('openai')) return { family: 'OpenAI OSS', color: '#f472b6' };
    let hash = 0;
    for (let i = 0; i < lower.length; i++) {
      hash = ((hash << 5) - hash + lower.charCodeAt(i)) | 0;
    }
    const color = fallbackPalette[Math.abs(hash) % fallbackPalette.length];
    return { family: String(baseName || 'Custom').split(/\s+/)[0] || 'Custom', color };
  };

  const makeShortBase = (baseName, modelId) => {
    const name = String(baseName || '').trim();
    if (modelId === 'gemini-pro-orchestrator-g1-pro') return 'Orchestrator';
    const orchMatch = name.match(/^Orchestrator\s*\(([^)]+)\)$/i);
    if (orchMatch) return `Orch. ${orchMatch[1].trim()}`;
    if (/^Gemini\s+4\s+/i.test(name)) return name.replace(/^Gemini\s+4\s+/i, '').trim();
    if (/^Gemini\s+([\d.]+)\s+Flash$/i.test(name)) {
      const m = name.match(/^Gemini\s+([\d.]+)\s+Flash$/i);
      return `Flash ${m[1]}`;
    }
    if (/^Claude\s+/i.test(name)) return name.replace(/^Claude\s+/i, '').trim();
    return name;
  };

  const parseLabelAndEffort = (rawLabel, rawEffortHint) => {
    const label = String(rawLabel || '').trim();
    const hint = rawEffortHint ? String(rawEffortHint).trim().toLowerCase() : '';
    const knownEfforts = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    const parenMatch = label.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (parenMatch) {
      const candidateBase = parenMatch[1].trim();
      const candidateEffort = parenMatch[2].trim();
      const lowerEff = candidateEffort.toLowerCase();
      if (knownEfforts.includes(lowerEff) || (hint && lowerEff === hint)) {
        return {
          baseName: candidateBase,
          effortKey: lowerEff,
          effortLabel: effortDisplay[lowerEff] || candidateEffort
        };
      }
    }
    if (hint && knownEfforts.includes(hint)) {
      return {
        baseName: label,
        effortKey: hint,
        effortLabel: effortDisplay[hint] || hint
      };
    }
    return {
      baseName: label,
      effortKey: 'standard',
      effortLabel: 'Standard'
    };
  };

  const combinedRaw = [];
  const seenIds = new Set();
  const pushOption = (opt) => {
    if (!opt || typeof opt !== 'object') return;
    const id = String(opt.modelId || opt.id || '').trim();
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);
    combinedRaw.push(opt);
  };

  if (Array.isArray(rawOptions)) {
    for (const opt of rawOptions) pushOption(opt);
  }
  if (Array.isArray(groups)) {
    for (const grp of groups) {
      if (grp && Array.isArray(grp.options)) {
        for (const opt of grp.options) pushOption(opt);
      }
    }
  }

  const disabledModels = [];
  const baseMap = new Map();
  const baseOrder = [];

  const ensureBase = (baseName, description, tagTitle) => {
    if (!baseMap.has(baseName)) {
      const style = resolveStyle(baseName);
      baseMap.set(baseName, {
        name: baseName,
        family: style.family,
        color: style.color,
        tagTitle: tagTitle || '',
        description: description || '',
        efforts: []
      });
      baseOrder.push(baseName);
    } else {
      const entry = baseMap.get(baseName);
      if (!entry.description && description) entry.description = description;
      if (!entry.tagTitle && tagTitle) entry.tagTitle = tagTitle;
    }
    return baseMap.get(baseName);
  };

  // Preserve group display order for base models first
  if (Array.isArray(groups)) {
    for (const grp of groups) {
      if (!grp || !Array.isArray(grp.options)) continue;
      for (const opt of grp.options) {
        if (!opt || opt.disabled) continue;
        const parsed = parseLabelAndEffort(opt.label || opt.name, opt.effort || opt.effortLabel);
        if (parsed.baseName) {
          ensureBase(parsed.baseName, opt.tagDescription || '', opt.tagTitle || '');
        }
      }
    }
  }

  // Build lookup of effort hints from Antigravity's native effortIndex if provided
  const effortHintById = new Map();
  if (effortIndex && typeof effortIndex === 'object') {
    const entries = effortIndex instanceof Map
      ? Array.from(effortIndex.entries())
      : Object.entries(effortIndex);
    for (const [baseKey, list] of entries) {
      if (list instanceof Map) {
        for (const [effKey, item] of list.entries()) {
          if (item && (item.modelId || item.id)) {
            effortHintById.set(String(item.modelId || item.id), { baseName: baseKey, effort: effKey });
          }
        }
      } else if (Array.isArray(list)) {
        for (const item of list) {
          if (item && (item.modelId || item.id)) {
            effortHintById.set(String(item.modelId || item.id), {
              baseName: baseKey,
              effort: item.effort || item.effortLabel || ''
            });
          }
        }
      }
    }
  }

  for (const opt of combinedRaw) {
    const id = String(opt.modelId || opt.id || '').trim();
    const rawLabel = String(opt.label || opt.name || id).trim();
    if (opt.disabled) {
      disabledModels.push({
        id,
        name: rawLabel,
        tagTitle: String(opt.tagTitle || 'Unavailable'),
        description: String(opt.tagDescription || '')
      });
      continue;
    }

    const hint = effortHintById.get(id);
    const parsed = parseLabelAndEffort(rawLabel, hint ? hint.effort : (opt.effort || opt.effortLabel));
    const hintBase = (hint && hint.baseName) ? String(hint.baseName).trim() : '';
    const isSlugHint = /^[a-z0-9._-]+$/.test(hintBase) && !/\s/.test(hintBase);
    const baseName = (!isSlugHint && hintBase) ? hintBase : (parsed.baseName || hintBase);
    const baseEntry = ensureBase(baseName, opt.tagDescription || '', opt.tagTitle || '');

    if (!baseEntry.efforts.some(e => e.id === id)) {
      const shortBase = makeShortBase(baseName, id);
      const effShort = effortShort[parsed.effortKey] !== undefined ? effortShort[parsed.effortKey] : parsed.effortLabel;
      const isSingleStandalone = parsed.effortKey === 'standard' || /^GPT-OSS/i.test(baseName);
      const shortName = isSingleStandalone ? shortBase : `${shortBase} ${effShort}`.trim();

      baseEntry.efforts.push({
        id,
        label: parsed.effortLabel,
        shortName,
        effortKey: parsed.effortKey,
        nativeLabel: rawLabel,
        value: typeof opt.value === 'number' ? opt.value : undefined
      });
    }
  }

  const baseModels = [];
  const modelCatalog = [];

  for (const baseName of baseOrder) {
    const entry = baseMap.get(baseName);
    if (!entry || entry.efforts.length === 0) continue;

    entry.efforts.sort((a, b) => {
      const oa = effortOrder[a.effortKey] ?? 99;
      const ob = effortOrder[b.effortKey] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.label.localeCompare(b.label);
    });

    const cleanEfforts = entry.efforts.map(e => ({
      id: e.id,
      label: e.label,
      shortName: e.shortName
    }));

    baseModels.push({
      name: entry.name,
      family: entry.family,
      color: entry.color,
      ...(entry.tagTitle ? { tagTitle: entry.tagTitle } : {}),
      ...(entry.description ? { description: entry.description } : {}),
      efforts: cleanEfforts
    });

    // Populate flat catalog with highest effort first for consistent default lookup
    for (let i = entry.efforts.length - 1; i >= 0; i--) {
      const e = entry.efforts[i];
      const fullName = e.nativeLabel || (e.effortKey === 'standard' ? entry.name : `${entry.name} (${e.label})`);
      modelCatalog.push({
        id: e.id,
        name: fullName,
        shortName: e.shortName,
        family: entry.family,
        color: entry.color
      });
    }
  }

  return {
    baseModels,
    modelCatalog,
    disabledModels,
    totalBaseModels: baseModels.length,
    totalModels: modelCatalog.length
  };
}

/**
 * Default assignments for Planner and Builder slots.
 */
export const DEFAULT_MODEL_SLOTS = {
  planner: 'gemini-4-argon-high',
  builder: 'gemini-4-hydrogen-high'
};

/**
 * Finds a model in the catalog by its id, or falls back to the first catalog entry.
 * @param {string} modelId
 * @param {Array<Object>} [catalog=MODEL_CATALOG]
 * @returns {Object}
 */
export function getModelById(modelId, catalog) {
  if (catalog && Array.isArray(catalog)) {
    if (catalog[0] && catalog[0].efforts) {
      for (const bm of catalog) {
        const found = bm.efforts.find(e => e.id === modelId);
        if (found) {
          return {
            id: found.id,
            name: `${bm.name} (${found.label})`,
            shortName: found.shortName,
            family: bm.family,
            color: bm.color
          };
        }
      }
    } else {
      const match = catalog.find(m => m.id === modelId);
      if (match) return match;
    }
  }

  const list = (typeof window !== 'undefined' && window.__MODEL_CATALOG) || (typeof MODEL_CATALOG !== 'undefined' ? MODEL_CATALOG : []);
  const fromCatalog = list.find(m => m.id === modelId);
  if (fromCatalog) return fromCatalog;

  for (const bm of BASE_MODELS) {
    const found = bm.efforts.find(e => e.id === modelId);
    if (found) {
      return {
        id: found.id,
        name: `${bm.name} (${found.label})`,
        shortName: found.shortName,
        family: bm.family,
        color: bm.color
      };
    }
  }

  return list[0];
}

/**
 * Renders the dual menubar buttons for Planner and Builder slots
 * along with the Planner-to-Chat synchronization button.
 * @param {Object} [slots=DEFAULT_MODEL_SLOTS]
 * @param {Array<Object>} [catalog]
 * @returns {string}
 */
export function renderModelSlotsMenubarHtml(slots = DEFAULT_MODEL_SLOTS, catalog) {
  const currentSlots = slots || DEFAULT_MODEL_SLOTS;
  const plannerId = currentSlots.planner || DEFAULT_MODEL_SLOTS.planner;
  const builderId = currentSlots.builder || DEFAULT_MODEL_SLOTS.builder;
  const planner = getModelById(plannerId, catalog);
  const builder = getModelById(builderId, catalog);
  const isSynced = currentSlots.lockNative !== false && !currentSlots.plannerSyncBroken;
  const syncTitle = isSynced
    ? `Chat synced with Planner (${planner.name}) - Click to re-sync`
    : `Sync broken - Click to sync chat back to Planner (${planner.name})`;

  return `
    <div class="antigravity-model-slots-group" id="antigravity-model-slots-group">
      <button 
        type="button"
        id="antigravity-model-slot-planner" 
        class="antigravity-model-slot-btn${isSynced ? '' : ' is-desynced'}" 
        data-slot-role="planner" 
        data-model-id="${planner.id}" 
        title="Planner Model: ${planner.name}"
      >
        <span class="model-slot-dot" style="background-color: ${planner.color}; box-shadow: 0 0 6px ${planner.color}88;"></span>
        <span class="model-slot-role">Plan:</span>
        <span class="model-slot-value">${planner.shortName}</span>
        <span class="model-slot-caret">▼</span>
      </button>
      <button
        type="button"
        id="antigravity-planner-sync-btn"
        class="antigravity-planner-sync-btn ${isSynced ? 'is-synced' : 'is-desynced'}"
        data-sync-state="${isSynced ? 'synced' : 'desynced'}"
        aria-pressed="${isSynced ? 'true' : 'false'}"
        aria-label="Sync chat model with Planner"
        title="${syncTitle}"
      >
        <svg aria-hidden="true" class="planner-sync-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
      </button>
      <button 
        type="button"
        id="antigravity-model-slot-builder" 
        class="antigravity-model-slot-btn" 
        data-slot-role="builder" 
        data-model-id="${builder.id}" 
        title="Builder Model: ${builder.name}"
      >
        <span class="model-slot-dot" style="background-color: ${builder.color}; box-shadow: 0 0 6px ${builder.color}88;"></span>
        <span class="model-slot-role">Build:</span>
        <span class="model-slot-value">${builder.shortName}</span>
        <span class="model-slot-caret">▼</span>
      </button>
    </div>
  `.trim();
}

/**
 * Packages base models into compact provider/family packs for collapsible accordion rendering.
 * Self-contained so it can be serialized into the Electron renderer.
 * @param {Array<Object>} baseModels
 * @returns {Array<{ id: string, label: string, color: string, models: Array<Object> }>}
 */
export function groupBaseModelsIntoPacks(baseModels = []) {
  const list = Array.isArray(baseModels) ? baseModels : [];
  const packMap = new Map();
  const packOrder = [];

  const classifyPack = (bm) => {
    const name = String(bm?.name || '');
    const lower = name.toLowerCase();
    const fam = String(bm?.family || '').toLowerCase();
    if (lower.startsWith('orchestrator')) {
      return { id: 'orchestrators', label: 'Orchestrators', color: '#38bdf8' };
    }
    if (lower.startsWith('gemini') || fam === 'neon' || fam === 'carbon' || fam === 'argon' || fam === 'hydrogen' || fam.includes('gemini')) {
      return { id: 'gemini', label: 'Gemini', color: '#a3e635' };
    }
    if (lower.startsWith('claude') || fam === 'claude') {
      return { id: 'claude', label: 'Claude', color: '#c084fc' };
    }
    if (lower.includes('gpt-oss') || fam.includes('openai')) {
      return { id: 'openai-oss', label: 'OpenAI OSS', color: '#f472b6' };
    }
    const label = bm?.family || name.split(/\s+/)[0] || 'Other';
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'other';
    return { id, label, color: bm?.color || '#38bdf8' };
  };

  const formatCompactName = (bm, packId) => {
    const name = String(bm?.name || '').trim();
    if (packId === 'gemini') {
      return name.replace(/^Gemini\s+/i, '').trim() || name;
    }
    if (packId === 'orchestrators') {
      const m = name.match(/^Orchestrator\s*\(([^)]+)\)$/i);
      return m ? m[1].trim() : name;
    }
    if (packId === 'claude') {
      return name.replace(/^Claude\s+/i, '').trim() || name;
    }
    return name;
  };

  for (const bm of list) {
    if (!bm || !Array.isArray(bm.efforts) || bm.efforts.length === 0) continue;
    const meta = classifyPack(bm);
    if (!packMap.has(meta.id)) {
      packMap.set(meta.id, {
        id: meta.id,
        label: meta.label,
        color: meta.color,
        models: []
      });
      packOrder.push(meta.id);
    }
    packMap.get(meta.id).models.push({
      ...bm,
      compactName: formatCompactName(bm, meta.id)
    });
  }

  return packOrder.map(id => packMap.get(id));
}

/**
 * Renders packaged hierarchical dropdown markup with collapsible family packs and flyout effort submenus.
 * @param {'planner'|'builder'} role
 * @param {string} selectedModelId
 * @param {Array<Object>} [catalog=BASE_MODELS]
 * @param {Object} [options]
 * @param {boolean} [options.lockNative=true]
 * @returns {string} Clean HTML without any emojis
 */
export function renderModelSlotDropdownHtml(role, selectedModelId, catalog, options = {}) {
  const baseModels = (catalog && Array.isArray(catalog) && catalog[0] && catalog[0].efforts)
    ? catalog
    : ((typeof window !== 'undefined' && window.__BASE_MODELS) || BASE_MODELS);
  const isPlanner = role === 'planner';
  const headerTitle = isPlanner ? 'Select Planner Model' : 'Select Builder Model';
  const roleLabel = isPlanner ? 'PLANNER' : 'BUILDER';
  const roleDesc = isPlanner ? 'Architecture, planning & chat sync' : 'Fast code edits & subagents';
  const lockNative = options.lockNative !== false;

  const packFn = typeof groupBaseModelsIntoPacks === 'function'
    ? groupBaseModelsIntoPacks
    : (typeof window !== 'undefined' && typeof window.__groupBaseModelsIntoPacks === 'function'
      ? window.__groupBaseModelsIntoPacks
      : null);

  const packs = packFn
    ? packFn(baseModels)
    : [{ id: 'all', label: 'Models', color: '#38bdf8', models: baseModels.map(m => ({ ...m, compactName: m.name })) }];

  const packsHtml = packs.map((pack, idx) => {
    let activeModelInPack = null;
    for (const bm of pack.models) {
      const found = bm.efforts.find(e => e.id === selectedModelId);
      if (found) {
        activeModelInPack = { bm, eff: found };
        break;
      }
    }
    const isExpanded = Boolean(activeModelInPack) || (idx === 0 && !packs.some(p => p.models.some(m => m.efforts.some(e => e.id === selectedModelId))));

    const rowsHtml = pack.models.map(bm => {
      const activeEffort = bm.efforts.find(e => e.id === selectedModelId);
      const isModelActive = Boolean(activeEffort);
      const singleEffortId = bm.efforts.length === 1 ? bm.efforts[0].id : '';
      const displayName = bm.compactName || bm.name;

      const effortOptionsHtml = bm.efforts.map(eff => {
        const isEffortActive = eff.id === selectedModelId;
        return `
          <button 
            type="button" 
            class="model-effort-option${isEffortActive ? ' active' : ''}" 
            data-slot-role="${role}" 
            data-model-id="${eff.id}" 
            title="${bm.name} - ${eff.label}"
          >
            <span class="model-effort-name">${eff.label}</span>
            <span class="model-effort-check">${isEffortActive ? '✓' : ''}</span>
          </button>
        `.trim();
      }).join('\n');

      return `
        <div 
          class="model-slot-row${isModelActive ? ' active' : ''}" 
          data-slot-role="${role}"
          ${singleEffortId ? `data-model-id="${singleEffortId}"` : ''}
          data-base-model="${bm.name}"
        >
          <div class="model-slot-row-left">
            <span class="model-slot-row-dot" style="background-color: ${bm.color}; box-shadow: 0 0 6px ${bm.color}66;"></span>
            <span class="model-slot-row-name">${displayName}</span>
          </div>
          <div class="model-slot-row-right">
            ${activeEffort ? `<span class="model-slot-active-badge">${activeEffort.label}</span>` : ''}
            <span class="model-slot-chevron">&#8250;</span>
          </div>
          <div class="model-slot-submenu">
            ${effortOptionsHtml}
          </div>
        </div>
      `.trim();
    }).join('\n');

    return `
      <div class="model-pack${isExpanded ? ' expanded' : ''}${activeModelInPack ? ' has-active' : ''}" data-pack-id="${pack.id}">
        <button type="button" class="model-pack-header" data-pack-id="${pack.id}" aria-expanded="${isExpanded ? 'true' : 'false'}">
          <span class="model-pack-header-left">
            <span class="model-pack-dot" style="background-color: ${pack.color};"></span>
            <span class="model-pack-title">${pack.label}</span>
            <span class="model-pack-count">${pack.models.length}</span>
          </span>
          <span class="model-pack-header-right">
            ${activeModelInPack ? `<span class="model-pack-active-pill">${activeModelInPack.eff.shortName}</span>` : ''}
            <span class="model-pack-caret">&#9656;</span>
          </span>
        </button>
        <div class="model-pack-body">
          ${rowsHtml}
        </div>
      </div>
    `.trim();
  }).join('\n');

  const lockToggleHtml = isPlanner
    ? `
      <button
        type="button"
        id="antigravity-model-lock-toggle"
        class="model-slot-lock-toggle${lockNative ? ' locked' : ' desynced'}"
        data-lock-toggle="true"
        data-locked="${lockNative ? 'true' : 'false'}"
        aria-pressed="${lockNative ? 'true' : 'false'}"
        title="${lockNative ? 'Chat synced with Planner slot. Change model in chat anytime to override.' : 'Sync broken by manual chat selection. Click to sync back to Planner slot.'}"
      >
        <span class="model-lock-dot"></span>
        <span class="model-lock-label">${lockNative ? 'Chat Synced' : 'Sync Planner'}</span>
      </button>
    `.trim()
    : '';

  return `
    <div class="model-slot-dropdown-header">
      <div class="model-slot-dropdown-title-row">
        <span class="model-slot-dropdown-title">${headerTitle}</span>
        <span class="model-slot-dropdown-role-badge ${role}">${roleLabel}</span>
      </div>
      <div class="model-slot-dropdown-meta-row">
        <span class="model-slot-dropdown-sub">${roleDesc}</span>
        ${lockToggleHtml}
      </div>
    </div>
    <div class="model-slot-options-list">
      ${packsHtml}
    </div>
  `.trim();
}

/**
 * Renders the model badge pill for subagent footers.
 * @param {string} modelId
 * @param {Array<Object>} [catalog=MODEL_CATALOG]
 * @returns {string} Clean HTML without any emojis
 */
export function renderSubagentModelPill(modelId, catalog) {
  const getFn = typeof getModelById === 'function'
    ? getModelById
    : (typeof window !== 'undefined' && typeof window.__getModelById === 'function' ? window.__getModelById : null);
  const model = (getFn ? getFn(modelId, catalog) : null) || { id: modelId, name: modelId, shortName: modelId, color: '#34d399' };
  return `
    <span 
      id="antigravity-subagent-model-pill" 
      class="antigravity-subagent-model-pill" 
      data-model-id="${model.id}" 
      title="Subagent Builder Model: ${model.name}" 
      style="border-color: ${model.color}55; background: ${model.color}18; color: ${model.color};"
    >
      <span class="subagent-model-dot" style="background: ${model.color}; box-shadow: 0 0 5px ${model.color};"></span>
      <span class="subagent-model-label">${model.shortName}</span>
    </span>
  `.trim();
}

