import { renderAgentSvg } from './AgentIcons.js';

export const PALETTE = [
  'hsl(199, 89%, 60%)', // Sky / Cyan (Lead Architect - Planner)
  'hsl(271, 91%, 65%)', // Purple (Product Manager)
  'hsl(330, 81%, 60%)', // Rose / Pink (Scrum Master)
  'hsl(158, 64%, 52%)', // Emerald / Mint (Code Reviewer)
  'hsl(12, 88%, 59%)',  // Coral / Red (Security Engineer)
  'hsl(38, 92%, 50%)',  // Amber / Gold (DevOps & Cloud)
  'hsl(175, 75%, 45%)', // Teal (UI/UX Pro Max)
  'hsl(250, 85%, 65%)', // Indigo / Violet (Windows RPA)
  'hsl(215, 90%, 60%)', // Electric Blue (SDD Orchestrator - Builder)
  'hsl(45, 93%, 58%)',  // Sun Yellow (SDD Explore)
  'hsl(290, 80%, 65%)', // Orchid (SDD Spec)
  'hsl(24, 95%, 55%)',  // Blaze Orange (SDD Apply TDD)
  'hsl(142, 70%, 45%)', // Bright Green (SDD Verify)
  'hsl(340, 85%, 65%)'  // Crimson (Gentleman Guardian GGA)
];

export const DEFAULT_AGENT = {
  id: 'default',
  name: 'Sin Agente (Default)',
  level: 'default',
  levelLabel: 'DEFAULT',
  levelDesc: 'Asistente Antigravity Estándar',
  role: 'Modo general sin rol especializado',
  category: 'Standard',
  suite: 'Standard',
  iconName: 'default'
};

export const AUTO_AGENT = {
  id: 'auto',
  name: 'Auto (Plan / Build)',
  level: 'auto',
  levelLabel: 'AUTO',
  levelDesc: 'Clasificador Heurístico según Prompt',
  role: 'Enrutador dinámico entre Plan y Build con reglas de permisos',
  category: 'Smart Router',
  suite: 'Antigravity Core',
  iconName: 'auto'
};

export const AGENT_REGISTRY = [
  // =========================================================================
  // 1. CÚSPIDE (GOBERNANZA GLOBAL & DIRECCIÓN DE OBRA)
  // =========================================================================
  {
    id: 'lead-architect',
    name: 'Lead Architect',
    level: 'cuspide',
    levelLabel: 'PLANNER',
    levelDesc: 'Estratega (Plano Maestro)',
    role: 'Multi-Agent Orchestrator & Hexagonal Design',
    category: 'Vault Architecture',
    suite: 'Bóveda',
    iconName: 'layers'
  },
  {
    id: 'sdd-orchestrator',
    name: 'SDD Orchestrator',
    level: 'cuspide',
    levelLabel: 'BUILDER',
    levelDesc: 'Director de Obra (Flujo Táctico)',
    role: 'Spec-Driven Router & Flow Controller',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    iconName: 'compass'
  },

  // =========================================================================
  // 2. MICRO-ORQUESTADORES (LÍDERES DE DOMINIO & COORDINACIÓN)
  // =========================================================================
  {
    id: 'product-manager',
    name: 'Product Manager',
    level: 'micro',
    levelLabel: 'DISCOVERY',
    levelDesc: 'Requerimientos & PRD',
    role: 'Business Discovery & PRD Formulation',
    category: 'Discovery',
    suite: 'Bóveda',
    iconName: 'clipboard-list'
  },
  {
    id: 'scrum-master',
    name: 'Scrum Master',
    level: 'micro',
    levelLabel: 'DELIVERY',
    levelDesc: 'Epics & Backlog Sprints',
    role: 'Epics, User Stories & Backlog Refinement',
    category: 'Delivery',
    suite: 'Bóveda',
    iconName: 'timer'
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    level: 'micro',
    levelLabel: 'QUALITY',
    levelDesc: 'Invariantes & PR Gates',
    role: 'Clean Architecture Invariants & PR Gates',
    category: 'Quality',
    suite: 'Bóveda',
    iconName: 'git-pull-request'
  },
  {
    id: 'security-engineer',
    name: 'Security Engineer',
    level: 'micro',
    levelLabel: 'SECURITY',
    levelDesc: 'OWASP & Hardening Zero Trust',
    role: 'OWASP Top 10, Zero Trust & Hardening',
    category: 'Quality',
    suite: 'Bóveda',
    iconName: 'shield-check'
  },
  {
    id: 'devops-cloud',
    name: 'DevOps & Cloud',
    level: 'micro',
    levelLabel: 'INFRA',
    levelDesc: 'CI/CD, Docker & GitOps',
    role: 'Deterministic CI/CD, Docker & GitOps',
    category: 'Delivery',
    suite: 'Bóveda',
    iconName: 'server'
  },
  {
    id: 'ui-ux-pro',
    name: 'UI/UX Pro Max',
    level: 'micro',
    levelLabel: 'FRONTEND',
    levelDesc: 'Design Tokens & A11y',
    role: 'Design Tokens, A11y & Visual Systems',
    category: 'Frontend',
    suite: 'Bóveda',
    iconName: 'palette'
  },
  {
    id: 'rpa-windows',
    name: 'Windows RPA',
    level: 'micro',
    levelLabel: 'AUTOMATION',
    levelDesc: 'PowerShell & Desktop Tasks',
    role: 'PowerShell Automation & Desktop Tasks',
    category: 'Automation',
    suite: 'Bóveda',
    iconName: 'terminal'
  },

  // =========================================================================
  // 3. NANO-AGENTES (OPERATIVOS & EJECUCIÓN ATÓMICA SDD)
  // =========================================================================
  {
    id: 'sdd-explore',
    name: 'SDD Explore',
    level: 'nano',
    levelLabel: 'EXPLORE',
    levelDesc: 'Investigación de Código',
    role: 'Codebase Investigator & Pattern Discovery',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    iconName: 'search'
  },
  {
    id: 'sdd-spec',
    name: 'SDD Spec',
    level: 'nano',
    levelLabel: 'SPEC',
    levelDesc: 'Escenarios BDD Formales',
    role: 'Formal Specifications & BDD Scenarios',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    iconName: 'file-text'
  },
  {
    id: 'sdd-apply',
    name: 'SDD Apply (TDD)',
    level: 'nano',
    levelLabel: 'APPLY',
    levelDesc: 'Implementador Red-Green-Refactor',
    role: 'Strict Red-Green-Refactor Code Implementer',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    iconName: 'zap'
  },
  {
    id: 'sdd-verify',
    name: 'SDD Verify',
    level: 'nano',
    levelLabel: 'VERIFY',
    levelDesc: 'Gate de Pruebas & Compliance',
    role: 'Scenario Compliance & Test Verification Gate',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    iconName: 'check-circle'
  },
  {
    id: 'gga-review',
    name: 'Guardian Angel (GGA)',
    level: 'nano',
    levelLabel: 'GUARD',
    levelDesc: 'Pre-Commit & Cultura',
    role: 'Git Pre-Commit Standards & Code Culture Guard',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    iconName: 'shield-alert'
  }
];

/**
 * Returns a unique color for a given agent.
 * @param {string} agentId
 * @returns {string} HSL color string
 */
export function getAgentColor(agentId) {
  if (agentId === 'default') {
    return 'hsl(215, 16%, 65%)';
  }
  if (agentId === 'auto') {
    return 'hsl(265, 89%, 66%)';
  }
  const index = AGENT_REGISTRY.findIndex(a => a.id === agentId);
  if (index !== -1 && index < PALETTE.length) {
    return PALETTE[index];
  }
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash << 5) - hash + agentId.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash * 67) % 360;
  return `hsl(${hue}, 85%, 62%)`;
}

/**
 * Renders an inline pushpin SVG icon.
 * @param {boolean} isActive
 * @param {number} [size=15]
 * @returns {string}
 */
export function renderPinSvg(isActive, size = 15) {
  return `
    <svg class="agent-pin-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${isActive ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="17" x2="12" y2="22"></line>
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
    </svg>
  `.trim();
}

/**
 * Renders the hierarchical dropdown card markup using Progressive Disclosure
 * where EVERY text block is enclosed in an explicit card component for clear visual boundaries.
 * 
 * @param {string} activeAgentId
 * @param {Array} dynamicAgents
 * @returns {string} HTML markup
 */
export function renderAgentDropdownHtml(activeAgentId = 'default', dynamicAgents = []) {
  const mergedMap = new Map();
  for (const a of AGENT_REGISTRY) {
    let filePath = a.filePath || '';
    if (!filePath && Array.isArray(dynamicAgents)) {
      const match = dynamicAgents.find(d => 
        d.id === a.id || 
        d.id.includes(a.id.replace(/-/g, '_')) ||
        (d.name && d.name.toLowerCase().includes(a.name.toLowerCase())) ||
        (d.filePath && d.filePath.toLowerCase().includes(a.id.replace(/-/g, '_')))
      );
      if (match) filePath = match.filePath;
    }
    mergedMap.set(a.id, { ...a, filePath });
  }
  if (Array.isArray(dynamicAgents)) {
    for (const a of dynamicAgents) {
      if (a && a.id && !mergedMap.has(a.id)) {
        mergedMap.set(a.id, {
          ...a,
          level: 'custom',
          levelLabel: 'CUSTOM',
          levelDesc: 'Especialista Markdown',
          iconName: 'default-custom'
        });
      }
    }
  }

  const allAgents = Array.from(mergedMap.values());
  const cuspideAgents = allAgents.filter(a => a.level === 'cuspide');
  const microAgents = allAgents.filter(a => a.level === 'micro');
  const nanoAgents = allAgents.filter(a => a.level === 'nano');
  const customAgents = allAgents.filter(a => a.level === 'custom');

  // Render Auto (Plan / Build) Smart Router card
  const isAutoSelected = activeAgentId === 'auto';
  const autoColor = getAgentColor('auto');
  const autoCardHtml = `
    <div 
      class="antigravity-agent-item agent-card primary-hero-card auto-mode-card ${isAutoSelected ? 'selected' : ''}" 
      data-agent-id="auto"
      data-agent-name="Auto (Plan/Build)"
      data-agent-color="${autoColor}"
      data-agent-file=""
      style="--agent-theme-color: ${autoColor};"
      onclick="window.__selectAntigravityAgent('auto', 'Auto (Plan/Build)', '${autoColor}', '')"
      title="Enrutador Inteligente: Clasifica entre PLAN y BUILD según tu prompt con guardián de permisos"
    >
      <div class="agent-card-info">
        <div class="agent-icon-box" style="color: ${autoColor}; background: ${autoColor}1a; border-color: ${autoColor}44;">
          ${renderAgentSvg('auto', 16, 2)}
        </div>
        <div class="agent-text-wrap">
          <div class="agent-title-row">
            <span class="agent-title">Auto (Plan / Build)</span>
            <span class="agent-tag" style="background: ${autoColor}26; color: ${autoColor}; border-color: ${autoColor}55;">AUTO</span>
          </div>
          <div class="agent-subtitle">Clasificador heurístico + permisos</div>
        </div>
      </div>
      <button 
        type="button" 
        class="agent-pin-btn ${isAutoSelected ? 'active' : ''}" 
        title="${isAutoSelected ? 'Agente activo (Fijado)' : 'Fijar modo Auto'}"
        aria-label="Fijar modo Auto"
      >
        ${renderPinSvg(isAutoSelected, 15)}
      </button>
    </div>
  `.trim();

  // Render Default (Vanilla) card
  const isDefaultSelected = activeAgentId === 'default';
  const defaultColor = getAgentColor('default');
  const defaultCardHtml = `
    <div 
      class="antigravity-agent-item agent-card primary-hero-card default-mode-card ${isDefaultSelected ? 'selected' : ''}" 
      data-agent-id="default"
      data-agent-name="Sin Agente"
      data-agent-color="${defaultColor}"
      data-agent-file=""
      style="--agent-theme-color: ${defaultColor};"
      onclick="window.__selectAntigravityAgent('default', 'Sin Agente', '${defaultColor}', '')"
      title="Asistente Antigravity Estándar sin rol especializado"
    >
      <div class="agent-card-info">
        <div class="agent-icon-box" style="color: ${defaultColor}; background: ${defaultColor}1a; border-color: ${defaultColor}33;">
          ${renderAgentSvg('default', 16, 2)}
        </div>
        <div class="agent-text-wrap">
          <div class="agent-title-row">
            <span class="agent-title">Sin Agente</span>
            <span class="agent-tag" style="background: ${defaultColor}20; color: ${defaultColor}; border-color: ${defaultColor}44;">DEFAULT</span>
          </div>
          <div class="agent-subtitle">Modo estándar general</div>
        </div>
      </div>
      <button 
        type="button" 
        class="agent-pin-btn ${isDefaultSelected ? 'active' : ''}" 
        title="${isDefaultSelected ? 'Agente activo (Fijado)' : 'Fijar este modo'}"
        aria-label="Fijar modo Sin Agente"
      >
        ${renderPinSvg(isDefaultSelected, 15)}
      </button>
    </div>
  `.trim();

  // Render a Cúspide Hero card (Planner or Builder)
  const renderCuspideCard = (agent) => {
    const isSelected = agent.id === activeAgentId;
    const color = getAgentColor(agent.id);
    const safeName = escapeHtml(agent.name || '');
    const safeRole = escapeHtml(agent.role || '');
    const safeDesc = escapeHtml(agent.levelDesc || '');
    const safeLabel = escapeHtml((agent.levelLabel || '').trim());
    const safeFile = escapeHtml(agent.filePath || '');
    const jsName = (agent.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const svgIcon = renderAgentSvg(agent.id, 16, 2, 'cuspide-svg-icon');

    return `
      <div 
        class="antigravity-agent-item agent-card primary-hero-card cuspide-card ${isSelected ? 'selected' : ''}" 
        data-agent-id="${agent.id}"
        data-agent-name="${safeName}"
        data-agent-color="${color}"
        data-agent-file="${safeFile}"
        style="--agent-theme-color: ${color};"
        onclick="window.__selectAntigravityAgent(this.getAttribute('data-agent-id'), this.getAttribute('data-agent-name'), this.getAttribute('data-agent-color'), this.getAttribute('data-agent-file'))"
        title="${safeName} - ${safeRole}"
      >
        <div class="agent-card-info">
          <div class="agent-icon-box" style="color: ${color}; background: ${color}1a; border-color: ${color}44;">
            ${svgIcon}
          </div>
          <div class="agent-text-wrap">
            <div class="agent-title-row">
              <span class="agent-title">${safeName}</span>
              <span class="agent-tag" style="background: ${color}26; color: ${color}; border-color: ${color}55;">
                ${safeLabel}
              </span>
            </div>
            <div class="agent-subtitle">${safeDesc}</div>
          </div>
        </div>
        <button 
          type="button" 
          class="agent-pin-btn ${isSelected ? 'active' : ''}" 
          title="${isSelected ? 'Agente activo (Fijado)' : 'Fijar este agente'}"
          aria-label="Fijar agente ${safeName}"
        >
          ${renderPinSvg(isSelected, 15)}
        </button>
      </div>
    `.trim();
  };

  // Render compact grid item for Micro or Nano
  const renderCompactItem = (agent) => {
    const isSelected = agent.id === activeAgentId;
    const color = getAgentColor(agent.id);
    const safeName = escapeHtml(agent.name || '');
    const safeRole = escapeHtml(agent.role || '');
    const safeDesc = escapeHtml(agent.levelDesc || agent.role || '');
    const safeFile = escapeHtml(agent.filePath || '');
    const jsName = (agent.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const svgIcon = renderAgentSvg(agent.id, 14, 2, 'compact-svg-icon');

    return `
      <div 
        class="antigravity-agent-item agent-card compact-agent-card ${isSelected ? 'selected' : ''}" 
        data-agent-id="${agent.id}"
        data-agent-name="${safeName}"
        data-agent-color="${color}"
        data-agent-file="${safeFile}"
        style="--agent-theme-color: ${color};"
        onclick="window.__selectAntigravityAgent(this.getAttribute('data-agent-id'), this.getAttribute('data-agent-name'), this.getAttribute('data-agent-color'), this.getAttribute('data-agent-file'))"
        title="${safeName} - ${safeRole}"
      >
        <div class="compact-icon-box" style="color: ${color}; background: ${color}18; border-color: ${color}33;">
          ${svgIcon}
        </div>
        <div class="compact-details">
          <div class="compact-name-row">
            <span class="compact-name">${safeName}</span>
          </div>
          <div class="compact-sub">${safeDesc}</div>
        </div>
        <button 
          type="button" 
          class="agent-pin-btn compact-pin-btn ${isSelected ? 'active' : ''}" 
          title="${isSelected ? 'Agente activo (Fijado)' : 'Fijar este agente'}"
          aria-label="Fijar agente ${safeName}"
        >
          ${renderPinSvg(isSelected, 12)}
        </button>
      </div>
    `.trim();
  };

  return `
    <div class="antigravity-agent-dropdown">
      <!-- 1. HEADER CARD (Harmonized with Mods Manager) -->
      <div class="agent-card agent-header-card">
        <div class="agent-title-wrap">
          <div class="agent-header-icon">
            ${renderAgentSvg('lead-architect', 16, 2)}
          </div>
          <div class="agent-title-col">
            <div class="agent-title-row">
              <h3 class="agent-main-title">Selector de Agentes</h3>
              <span class="agent-header-badge">Control Tower</span>
            </div>
            <div class="agent-subtitle">Especialistas de Architecture Vault y SDD</div>
          </div>
        </div>
        <button class="agent-close-btn" id="antigravity-agent-close" title="Cerrar">✕</button>
      </div>

      <!-- 2. SECCIÓN PRINCIPAL: 3 CARDS DIRECTAS CON PIN -->
      <div class="agent-primary-section agent-cards-list">
        ${defaultCardHtml}
        ${autoCardHtml}
        ${cuspideAgents.map(renderCuspideCard).join('\n')}
      </div>

      <!-- 3. TOGGLE ACORDEÓN CARD BUTTON -->
      <div class="agent-card agent-toggle-card">
        <button 
          type="button" 
          class="agent-catalog-toggle-btn" 
          id="antigravity-agent-catalog-toggle"
          onclick="window.__toggleAgentCatalog()"
        >
          <span class="catalog-toggle-text">▾ Ver Especialistas (Micro & Nano)</span>
          <span class="catalog-toggle-count">${microAgents.length + nanoAgents.length}</span>
        </button>
      </div>

      <!-- 4. DRAWER CONTAINER CARD (COLAPSADO POR DEFECTO) -->
      <div class="agent-catalog-drawer collapsed" id="antigravity-agent-catalog-drawer">
        <div class="agent-card agent-drawer-card">
          <!-- SEGMENTED LEVEL TABS -->
          <div class="agent-level-tabs">
            <button 
              type="button"
              class="agent-tab-btn active" 
              data-tab="micro" 
              onclick="window.__switchAgentTab('micro')"
            >
              <span class="tab-icon">${renderAgentSvg('product-manager', 12, 2)}</span>
              <span>Micro (${microAgents.length})</span>
            </button>
            <button 
              type="button"
              class="agent-tab-btn" 
              data-tab="nano" 
              onclick="window.__switchAgentTab('nano')"
            >
              <span class="tab-icon">${renderAgentSvg('sdd-apply', 12, 2)}</span>
              <span>Nano (${nanoAgents.length})</span>
            </button>
            ${customAgents.length > 0 ? `
              <button 
                type="button"
                class="agent-tab-btn" 
                data-tab="custom" 
                onclick="window.__switchAgentTab('custom')"
              >
                <span class="tab-icon">${renderAgentSvg('default-custom', 12, 2)}</span>
                <span>Custom (${customAgents.length})</span>
              </button>
            ` : ''}
          </div>

          <!-- TAB CONTENT PANELS -->
          <div class="agent-tab-content active" data-tab-content="micro">
            <div class="compact-grid">
              ${microAgents.map(renderCompactItem).join('\n')}
            </div>
          </div>

          <div class="agent-tab-content" data-tab-content="nano">
            <div class="compact-grid">
              ${nanoAgents.map(renderCompactItem).join('\n')}
            </div>
          </div>

          ${customAgents.length > 0 ? `
            <div class="agent-tab-content" data-tab-content="custom">
              <div class="compact-grid">
                ${customAgents.map(renderCompactItem).join('\n')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- 5. FOOTER CARD -->
      <div class="agent-card agent-footer-card">
        <div class="agent-footer-icon">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div class="agent-footer-text">
          Modo seleccionado activo en tiempo real
        </div>
      </div>
    </div>
  `.trim();
}


export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
