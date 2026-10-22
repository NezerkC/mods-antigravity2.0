export const PALETTE = [
  'hsl(199, 89%, 60%)', // Sky / Cyan
  'hsl(271, 91%, 65%)', // Purple
  'hsl(330, 81%, 60%)', // Rose / Pink
  'hsl(158, 64%, 52%)', // Emerald / Mint
  'hsl(38, 92%, 50%)',  // Amber / Gold
  'hsl(12, 88%, 59%)',  // Coral / Red
  'hsl(250, 85%, 65%)', // Indigo / Violet
  'hsl(175, 75%, 45%)'  // Teal
];

export const AGENT_REGISTRY = [
  {
    id: 'lead-architect',
    name: 'Lead Architect',
    role: 'Multi-Agent Orchestrator & Hexagonal Design',
    category: 'Architecture',
    icon: '🏛️'
  },
  {
    id: 'product-manager',
    name: 'Product Manager',
    role: 'Business Discovery & PRD Formulation',
    category: 'Discovery',
    icon: '📋'
  },
  {
    id: 'scrum-master',
    name: 'Scrum Master',
    role: 'Epics, User Stories & Backlog Refinement',
    category: 'Delivery',
    icon: '⏱️'
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    role: 'Clean Architecture Invariants & PR Gates',
    category: 'Quality',
    icon: '🔍'
  },
  {
    id: 'security-engineer',
    name: 'Security Engineer',
    role: 'OWASP Top 10, Zero Trust & Hardening',
    category: 'Quality',
    icon: '🛡️'
  },
  {
    id: 'devops-cloud',
    name: 'DevOps & Cloud',
    role: 'Deterministic CI/CD, Docker & GitOps',
    category: 'Delivery',
    icon: '🚀'
  },
  {
    id: 'ui-ux-pro',
    name: 'UI/UX Pro Max',
    role: 'Design Tokens, A11y & Visual Systems',
    category: 'Frontend',
    icon: '🎨'
  },
  {
    id: 'rpa-windows',
    name: 'Windows RPA',
    role: 'PowerShell Automation & Desktop Tasks',
    category: 'Automation',
    icon: '🤖'
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

export function renderAgentDropdownHtml(activeAgentId = 'lead-architect') {
  const itemsHtml = AGENT_REGISTRY.map(agent => {
    const isSelected = agent.id === activeAgentId;
    const color = getAgentColor(agent.id);

    return `
      <div 
        class="antigravity-agent-item ${isSelected ? 'selected' : ''}" 
        data-agent-id="${agent.id}"
        data-agent-name="${agent.name}"
        data-agent-color="${color}"
        data-agent-icon="${agent.icon}"
        onclick="window.__selectAntigravityAgent('${agent.id}', '${agent.name}', '${color}')"
      >
        <span class="agent-color-dot" style="background: ${color}; box-shadow: 0 0 8px ${color}66;"></span>
        <span class="agent-item-icon">${agent.icon}</span>
        <div class="agent-item-details">
          <div class="agent-item-name-row">
            <span class="agent-item-name">${agent.name}</span>
            <span class="agent-item-category" style="color: ${color};">${agent.category}</span>
          </div>
          <div class="agent-item-role">${agent.role}</div>
        </div>
        <span class="agent-check" style="color: ${color};">${isSelected ? '✓' : ''}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="antigravity-agent-dropdown">
      <div class="agent-dropdown-header">
        <div class="agent-dropdown-title">
          <span>🕶️</span>
          <span>Active Architecture Specialist</span>
        </div>
        <span class="agent-dropdown-count">${AGENT_REGISTRY.length} Available</span>
      </div>
      <div class="agent-list-scroll">
        ${itemsHtml}
      </div>
    </div>
  `.trim();
}
