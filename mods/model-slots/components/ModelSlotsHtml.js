// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Victor Manuel Martinez Munoz

/**
 * Base models grouped with their supported effort levels for hierarchical flyout selection.
 */
export const BASE_MODELS = [
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
    id: 'gemini-pro-orchestrator-g1-pro',
    name: 'Orchestrator (Argon)',
    shortName: 'Orchestrator',
    family: 'Argon',
    color: '#38bdf8'
  }
];

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
 * Renders the dual menubar buttons for Planner and Builder slots.
 * @param {Object} [slots=DEFAULT_MODEL_SLOTS]
 * @returns {string}
 */
export function renderModelSlotsMenubarHtml(slots = DEFAULT_MODEL_SLOTS) {
  const currentSlots = slots || DEFAULT_MODEL_SLOTS;
  const plannerId = currentSlots.planner || DEFAULT_MODEL_SLOTS.planner;
  const builderId = currentSlots.builder || DEFAULT_MODEL_SLOTS.builder;
  const planner = getModelById(plannerId);
  const builder = getModelById(builderId);

  return `
    <div class="antigravity-model-slots-group" id="antigravity-model-slots-group">
      <button 
        id="antigravity-model-slot-planner" 
        class="antigravity-model-slot-btn" 
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
 * Renders hierarchical dropdown markup with base models and flyout effort submenus.
 * @param {'planner'|'builder'} role
 * @param {string} selectedModelId
 * @param {Array<Object>} [catalog=BASE_MODELS]
 * @returns {string} Clean HTML without any emojis
 */
export function renderModelSlotDropdownHtml(role, selectedModelId, catalog) {
  const baseModels = (catalog && Array.isArray(catalog) && catalog[0] && catalog[0].efforts)
    ? catalog
    : ((typeof window !== 'undefined' && window.__BASE_MODELS) || BASE_MODELS);
  const isPlanner = role === 'planner';
  const headerTitle = isPlanner ? 'Select Planner Model' : 'Select Builder Model';
  const roleLabel = isPlanner ? 'PLANNER' : 'BUILDER';
  const roleDesc = isPlanner ? 'Deep reasoning, architecture & plan creation' : 'Fast code generation, edits & execution';

  const rowsHtml = baseModels.map(bm => {
    const activeEffort = bm.efforts.find(e => e.id === selectedModelId);
    const isModelActive = Boolean(activeEffort);
    const singleEffortId = bm.efforts.length === 1 ? bm.efforts[0].id : '';

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
          <span class="model-slot-row-name">${bm.name}</span>
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
    <div class="model-slot-dropdown-header">
      <div class="model-slot-dropdown-title-row">
        <span class="model-slot-dropdown-title">${headerTitle}</span>
        <span class="model-slot-dropdown-role-badge ${role}">${roleLabel}</span>
      </div>
      <div class="model-slot-dropdown-sub">${roleDesc}</div>
    </div>
    <div class="model-slot-options-list">
      ${rowsHtml}
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

