export const PALETTE = [
  'hsl(199, 89%, 60%)', // Sky / Cyan (Lead Architect)
  'hsl(271, 91%, 65%)', // Purple (Product Manager)
  'hsl(330, 81%, 60%)', // Rose / Pink (Scrum Master)
  'hsl(158, 64%, 52%)', // Emerald / Mint (Code Reviewer)
  'hsl(12, 88%, 59%)',  // Coral / Red (Security Engineer)
  'hsl(38, 92%, 50%)',  // Amber / Gold (DevOps & Cloud)
  'hsl(175, 75%, 45%)', // Teal (UI/UX Pro Max)
  'hsl(250, 85%, 65%)', // Indigo / Violet (Windows RPA)
  'hsl(215, 90%, 60%)', // Electric Blue (SDD Orchestrator)
  'hsl(45, 93%, 58%)',  // Sun Yellow (SDD Explore)
  'hsl(290, 80%, 65%)', // Orchid (SDD Spec)
  'hsl(24, 95%, 55%)',  // Blaze Orange (SDD Apply TDD)
  'hsl(142, 70%, 45%)', // Bright Green (SDD Verify)
  'hsl(340, 85%, 65%)'  // Crimson (Gentleman Guardian GGA)
];

export const AGENT_REGISTRY = [
  // --- Bóveda de Arquitectura (Gobernanza & Estrategia) ---
  {
    id: 'lead-architect',
    name: 'Lead Architect',
    role: 'Multi-Agent Orchestrator & Hexagonal Design',
    category: 'Vault Architecture',
    suite: 'Bóveda',
    icon: '🏛️'
  },
  {
    id: 'product-manager',
    name: 'Product Manager',
    role: 'Business Discovery & PRD Formulation',
    category: 'Discovery',
    suite: 'Bóveda',
    icon: '📋'
  },
  {
    id: 'scrum-master',
    name: 'Scrum Master',
    role: 'Epics, User Stories & Backlog Refinement',
    category: 'Delivery',
    suite: 'Bóveda',
    icon: '⏱️'
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    role: 'Clean Architecture Invariants & PR Gates',
    category: 'Quality',
    suite: 'Bóveda',
    icon: '🔍'
  },
  {
    id: 'security-engineer',
    name: 'Security Engineer',
    role: 'OWASP Top 10, Zero Trust & Hardening',
    category: 'Quality',
    suite: 'Bóveda',
    icon: '🛡️'
  },
  {
    id: 'devops-cloud',
    name: 'DevOps & Cloud',
    role: 'Deterministic CI/CD, Docker & GitOps',
    category: 'Delivery',
    suite: 'Bóveda',
    icon: '🚀'
  },
  {
    id: 'ui-ux-pro',
    name: 'UI/UX Pro Max',
    role: 'Design Tokens, A11y & Visual Systems',
    category: 'Frontend',
    suite: 'Bóveda',
    icon: '🎨'
  },
  {
    id: 'rpa-windows',
    name: 'Windows RPA',
    role: 'PowerShell Automation & Desktop Tasks',
    category: 'Automation',
    suite: 'Bóveda',
    icon: '🤖'
  },

  // --- Suite SDD Gentleman Programming (Táctica & Ejecución) ---
  {
    id: 'sdd-orchestrator',
    name: 'SDD Orchestrator',
    role: 'Spec-Driven Router & Flow Controller',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    icon: '🧭'
  },
  {
    id: 'sdd-explore',
    name: 'SDD Explore',
    role: 'Codebase Investigator & Pattern Discovery',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    icon: '🔎'
  },
  {
    id: 'sdd-spec',
    name: 'SDD Spec',
    role: 'Formal Specifications & BDD Scenarios',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    icon: '📝'
  },
  {
    id: 'sdd-apply',
    name: 'SDD Apply (TDD)',
    role: 'Strict Red-Green-Refactor Code Implementer',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    icon: '⚡'
  },
  {
    id: 'sdd-verify',
    name: 'SDD Verify',
    role: 'Scenario Compliance & Test Verification Gate',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    icon: '✅'
  },
  {
    id: 'gga-review',
    name: 'Guardian Angel (GGA)',
    role: 'Git Pre-Commit Standards & Code Culture Guard',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    icon: '👼'
  }
];

/**
 * Returns a unique color for a given agent.
 * @param {string} agentId
 * @returns {string} HSL color string
 */
export function getAgentColor(agentId) {
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

export function renderAgentDropdownHtml(activeAgentId = 'lead-architect', dynamicAgents = []) {
  const mergedMap = new Map();
  // 1. Base canonical specialists
  for (const a of AGENT_REGISTRY) {
    mergedMap.set(a.id, a);
  }
  // 2. Dynamically discovered markdown agents
  if (Array.isArray(dynamicAgents)) {
    for (const a of dynamicAgents) {
      if (a && a.id && !mergedMap.has(a.id)) {
        mergedMap.set(a.id, a);
      }
    }
  }

  const allAgents = Array.from(mergedMap.values());
  const vaultAgents = allAgents.filter(a => a.suite === 'Bóveda');
  const sddAgents = allAgents.filter(a => a.suite === 'Gentleman' || a.suite === 'Gentleman SDD');
  const customAgents = allAgents.filter(a => a.suite !== 'Bóveda' && a.suite !== 'Gentleman' && a.suite !== 'Gentleman SDD');

  const renderGroup = (title, icon, agents) => {
    if (!agents.length) return '';
    return `
      <div class="agent-section-header">
        <span>${icon}</span>
        <span>${title}</span>
      </div>
      ${agents.map(agent => {
        const isSelected = agent.id === activeAgentId;
        const color = getAgentColor(agent.id);
        const safeName = (agent.name || '').replace(/'/g, "\\'");
        return `
          <div 
            class="antigravity-agent-item ${isSelected ? 'selected' : ''}" 
            data-agent-id="${agent.id}"
            data-agent-name="${safeName}"
            data-agent-color="${color}"
            data-agent-icon="${agent.icon || '🤖'}"
            onclick="window.__selectAntigravityAgent('${agent.id}', '${safeName}', '${color}')"
          >
            <span class="agent-color-dot" style="background: ${color}; box-shadow: 0 0 8px ${color}66;"></span>
            <span class="agent-item-icon">${agent.icon || '🤖'}</span>
            <div class="agent-item-details">
              <div class="agent-item-name-row">
                <span class="agent-item-name">${agent.name}</span>
                <span class="agent-item-category" style="color: ${color};">${agent.category || 'Specialist'}</span>
              </div>
              <div class="agent-item-role">${agent.role || ''}</div>
            </div>
            <span class="agent-check" style="color: ${color};">${isSelected ? '✓' : ''}</span>
          </div>
        `;
      }).join('')}
    `;
  };

  return `
    <div class="antigravity-agent-dropdown">
      <div class="agent-dropdown-header">
        <div class="agent-dropdown-title">
          <span>🕶️</span>
          <span>Especialistas & Suite SDD</span>
        </div>
        <span class="agent-dropdown-count">${allAgents.length} Disponibles</span>
      </div>
      <div class="agent-list-scroll">
        ${renderGroup('Bóveda de Arquitectura (Gobernanza)', '🏛️', vaultAgents)}
        ${renderGroup('Suite SDD Gentleman Programming (Táctica)', '⚡', sddAgents)}
        ${renderGroup('Especialistas Descubiertos (.md)', '📁', customAgents)}
      </div>
    </div>
  `.trim();
}
