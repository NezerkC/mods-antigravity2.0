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
    mergedMap.set(a.id, a);
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

  // Render Default (Vanilla) card
  const isDefaultSelected = activeAgentId === 'default';
  const defaultColor = getAgentColor('default');
  const defaultCardHtml = `
    <div 
      class="antigravity-agent-item agent-card primary-hero-card default-mode-card ${isDefaultSelected ? 'selected' : ''}" 
      data-agent-id="default"
      data-agent-name="Sin Agente"
      data-agent-color="${defaultColor}"
      style="--agent-theme-color: ${defaultColor};"
      onclick="window.__selectAntigravityAgent('default', 'Sin Agente', '${defaultColor}')"
      title="Asistente Antigravity Estándar sin rol especializado"
    >
      <div class="primary-hero-left">
        <div class="primary-icon-box" style="color: ${defaultColor}; background: ${defaultColor}1a; border-color: ${defaultColor}33;">
          ${renderAgentSvg('default', 15, 2)}
        </div>
        <div class="primary-info">
          <div class="primary-title-row">
            <span class="primary-title">Sin Agente</span>
            <span class="primary-tag" style="background: ${defaultColor}20; color: ${defaultColor};">DEFAULT</span>
          </div>
          <div class="primary-sub">Modo estándar general</div>
        </div>
      </div>
      <span class="agent-check" style="color: ${defaultColor};">${isDefaultSelected ? '✓' : ''}</span>
    </div>
  `;

  // Render a Cúspide Hero card (Planner or Builder)
  const renderCuspideCard = (agent) => {
    const isSelected = agent.id === activeAgentId;
    const color = getAgentColor(agent.id);
    const safeName = (agent.name || '').replace(/'/g, "\\'");
    const svgIcon = renderAgentSvg(agent.id, 15, 2, 'cuspide-svg-icon');

    return `
      <div 
        class="antigravity-agent-item agent-card primary-hero-card cuspide-card ${isSelected ? 'selected' : ''}" 
        data-agent-id="${agent.id}"
        data-agent-name="${safeName}"
        data-agent-color="${color}"
        style="--agent-theme-color: ${color};"
        onclick="window.__selectAntigravityAgent('${agent.id}', '${safeName}', '${color}')"
        title="${agent.name} - ${agent.role}"
      >
        <div class="primary-hero-left">
          <div class="primary-icon-box" style="color: ${color}; background: ${color}1a; border-color: ${color}44;">
            ${svgIcon}
          </div>
          <div class="primary-info">
            <div class="primary-title-row">
              <span class="primary-title">${agent.name}</span>
              <span class="primary-tag" style="background: ${color}26; color: ${color}; border-color: ${color}55;">
                ${agent.levelLabel.trim()}
              </span>
            </div>
            <div class="primary-sub">${agent.levelDesc}</div>
          </div>
        </div>
        <span class="agent-check" style="color: ${color};">${isSelected ? '✓' : ''}</span>
      </div>
    `;
  };

  // Render compact grid item for Micro or Nano
  const renderCompactItem = (agent) => {
    const isSelected = agent.id === activeAgentId;
    const color = getAgentColor(agent.id);
    const safeName = (agent.name || '').replace(/'/g, "\\'");
    const svgIcon = renderAgentSvg(agent.id, 13, 2, 'compact-svg-icon');

    return `
      <div 
        class="antigravity-agent-item agent-card compact-agent-card ${isSelected ? 'selected' : ''}" 
        data-agent-id="${agent.id}"
        data-agent-name="${safeName}"
        data-agent-color="${color}"
        style="--agent-theme-color: ${color};"
        onclick="window.__selectAntigravityAgent('${agent.id}', '${safeName}', '${color}')"
        title="${agent.name} - ${agent.role}"
      >
        <div class="compact-icon-box" style="color: ${color}; background: ${color}18; border-color: ${color}33;">
          ${svgIcon}
        </div>
        <div class="compact-details">
          <div class="compact-name-row">
            <span class="compact-name">${agent.name}</span>
            <span class="agent-check" style="color: ${color};">${isSelected ? '✓' : ''}</span>
          </div>
          <div class="compact-sub">${agent.levelDesc || agent.role}</div>
        </div>
      </div>
    `;
  };

  return `
    <div class="antigravity-agent-dropdown">
      <!-- 1. HEADER CARD -->
      <div class="agent-card agent-header-card">
        <div class="agent-dropdown-title">
          <span class="agent-header-icon-box">
            ${renderAgentSvg('lead-architect', 14, 2)}
          </span>
          <div class="agent-header-text">
            <span class="agent-header-main">Agentes Activos</span>
            <span class="agent-header-sub">Selección Rápida</span>
          </div>
        </div>
        <span class="agent-dropdown-count">Control Tower</span>
      </div>

      <!-- 2. SECCIÓN PRINCIPAL: 3 CARDS DIRECTAS -->
      <div class="agent-primary-section">
        ${defaultCardHtml}
        ${cuspideAgents.map(renderCuspideCard).join('')}
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
              ${microAgents.map(renderCompactItem).join('')}
            </div>
          </div>

          <div class="agent-tab-content" data-tab-content="nano">
            <div class="compact-grid">
              ${nanoAgents.map(renderCompactItem).join('')}
            </div>
          </div>

          ${customAgents.length > 0 ? `
            <div class="agent-tab-content" data-tab-content="custom">
              <div class="compact-grid">
                ${customAgents.map(renderCompactItem).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- 5. FOOTER CARD -->
      <div class="agent-card agent-footer-card">
        <span class="footer-dot"></span>
        <span class="footer-text">Modo seleccionado activo en tiempo real</span>
      </div>
    </div>
  `.trim();
}
