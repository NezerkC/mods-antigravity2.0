export const AGENT_REGISTRY = [
  {
    id: 'lead-architect',
    name: 'Lead Architect',
    role: 'Multi-Agent Orchestrator & Hexagonal Design',
    category: 'Architecture',
    icon: '🏛️',
    badgeColor: '#38bdf8'
  },
  {
    id: 'product-manager',
    name: 'Product Manager',
    role: 'Business Discovery & PRD Formulation',
    category: 'Discovery',
    icon: '📋',
    badgeColor: '#a855f7'
  },
  {
    id: 'scrum-master',
    name: 'Scrum Master',
    role: 'Epics, User Stories & Backlog Refinement',
    category: 'Delivery',
    icon: '⏱️',
    badgeColor: '#ec4899'
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    role: 'Clean Architecture Invariants & PR Gates',
    category: 'Quality',
    icon: '🔍',
    badgeColor: '#10b981'
  },
  {
    id: 'security-engineer',
    name: 'Security Engineer',
    role: 'OWASP Top 10, Zero Trust & Hardening',
    category: 'Quality',
    icon: '🛡️',
    badgeColor: '#ef4444'
  },
  {
    id: 'devops-cloud',
    name: 'DevOps & Cloud',
    role: 'Deterministic CI/CD, Docker & GitOps',
    category: 'Delivery',
    icon: '🚀',
    badgeColor: '#f59e0b'
  },
  {
    id: 'ui-ux-pro',
    name: 'UI/UX Pro Max',
    role: 'Design Tokens, A11y & Visual Systems',
    category: 'Frontend',
    icon: '🎨',
    badgeColor: '#06b6d4'
  },
  {
    id: 'rpa-windows',
    name: 'Windows RPA',
    role: 'PowerShell Automation & Desktop Tasks',
    category: 'Automation',
    icon: '🤖',
    badgeColor: '#8b5cf6'
  }
];

export function renderAgentDropdownHtml(activeAgentId = 'lead-architect') {
  const itemsHtml = AGENT_REGISTRY.map(agent => {
    const isSelected = agent.id === activeAgentId;
    return `
      <div 
        class="antigravity-agent-item ${isSelected ? 'selected' : ''}" 
        data-agent-id="${agent.id}"
        data-agent-name="${agent.name}"
        data-agent-icon="${agent.icon}"
        onclick="window.__selectAntigravityAgent('${agent.id}', '${agent.name}')"
      >
        <span class="agent-item-icon">${agent.icon}</span>
        <div class="agent-item-details">
          <div class="agent-item-name-row">
            <span class="agent-item-name">${agent.name}</span>
            <span class="agent-item-category">${agent.category}</span>
          </div>
          <div class="agent-item-role">${agent.role}</div>
        </div>
        <span class="agent-check">${isSelected ? '✓' : ''}</span>
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
