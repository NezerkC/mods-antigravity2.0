/**
 * Generates HTML markup for the top menubar "Mods" button.
 * @returns {string}
 */
export function renderModsManagerButton() {
  return `
    <button class="antigravity-mods-manager-btn" id="antigravity-mods-manager-trigger" title="Gestión de Mods y Persistencia">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
      </svg>
      <span>Mods</span>
    </button>
  `.trim();
}

/**
 * Generates HTML markup for the floating Mods Management portal panel.
 * Card Architecture: Every text block enclosed in card components.
 * @returns {string}
 */
export function renderModsManagerPanelHtml() {
  return `
    <!-- Header Card -->
    <div class="mods-manager-header mods-manager-header-card">
      <div class="mods-manager-title-wrap">
        <div class="mods-manager-header-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
        </div>
        <div class="mods-manager-title-col">
          <div class="mods-manager-title-row">
            <h3 class="mods-manager-title">Antigravity Mods</h3>
            <span class="mods-manager-badge">v2.0</span>
          </div>
          <div class="mods-manager-subtitle">Gestor y Persistencia de Módulos UI</div>
        </div>
      </div>
      <button class="mods-manager-close-btn" id="antigravity-mods-manager-close" title="Cerrar">✕</button>
    </div>

    <!-- Mod Cards List -->
    <div class="mods-manager-cards-list">
      <!-- Mod Card: Context Tachometer -->
      <div class="mod-card">
        <div class="mod-info">
          <div class="mod-icon-box tach-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <div class="mod-text">
            <div class="mod-title">Tacómetro de Contexto</div>
            <div class="mod-desc">Visualizador de tokens, pasos y tamaño de ventana en el chatbox.</div>
          </div>
        </div>
        <label class="mod-switch">
          <input type="checkbox" id="mod-toggle-context-tachometer" data-mod="context-tachometer" checked>
          <span class="mod-slider"></span>
        </label>
      </div>

      <!-- Mod Card: Agent Selector -->
      <div class="mod-card">
        <div class="mod-info">
          <div class="mod-icon-box agent-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div class="mod-text">
            <div class="mod-title">Selector de Agentes</div>
            <div class="mod-desc">Especialistas de Architecture Vault y SDD Suite en un clic.</div>
          </div>
        </div>
        <label class="mod-switch">
          <input type="checkbox" id="mod-toggle-agent-selector" data-mod="agent-selector" checked>
          <span class="mod-slider"></span>
        </label>
      </div>

      <!-- Mod Card: Minimize Chatbox Mods -->
      <div class="mod-card compact-chatbox-card">
        <div class="mod-info">
          <div class="mod-icon-box compact-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 14 10 14 10 20"></polyline>
              <polyline points="20 10 14 10 14 4"></polyline>
              <line x1="14" y1="10" x2="21" y2="3"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </div>
          <div class="mod-text">
            <div class="mod-title">
              <span>Minimizar en Chatbox</span>
              <span class="mod-status-pill" id="compact-chatbox-status-pill">Normal</span>
            </div>
            <div class="mod-desc">Contrae el tacómetro y selector a iconos compactos para no molestar la vista.</div>
          </div>
        </div>
        <label class="mod-switch">
          <input type="checkbox" id="mod-toggle-compact-chatbox" data-action="toggle-compact-chatbox">
          <span class="mod-slider"></span>
        </label>
      </div>

      <!-- Mod Card: Git Graph -->
      <div class="mod-card">
        <div class="mod-info">
          <div class="mod-icon-box git-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="18" r="3"></circle>
              <circle cx="6" cy="6" r="3"></circle>
              <path d="M18 15V9a9 9 0 0 0-9-9"></path>
              <path d="M6 9v12"></path>
            </svg>
          </div>
          <div class="mod-text">
            <div class="mod-title">Git Graph Visualizer</div>
            <div class="mod-desc">Visualizador de ramas, commits e historial de git en el panel auxiliar.</div>
          </div>
        </div>
        <label class="mod-switch">
          <input type="checkbox" id="mod-toggle-git-graph" data-mod="git-graph" checked>
          <span class="mod-slider"></span>
        </label>
      </div>

      <!-- Mod Card: Background Persistence (Daemon Kill-Switch) -->
      <div class="mod-card daemon-card">
        <div class="mod-info">
          <div class="mod-icon-box daemon-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <div class="mod-text">
            <div class="mod-title">
              <span>Auto-Inyección en Background</span>
              <span class="mod-status-pill active" id="daemon-status-pill">Activo</span>
            </div>
            <div class="mod-desc">Persistencia continua vía CDP. Apágalo para suspender toda inyección.</div>
          </div>
        </div>
        <label class="mod-switch">
          <input type="checkbox" id="mod-toggle-daemon" data-action="toggle-daemon" checked>
          <span class="mod-slider"></span>
        </label>
      </div>
    </div>

    <!-- Footer Status Card -->
    <div class="mods-manager-footer-card">
      <div class="mods-manager-footer-icon">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>
      <div class="mods-manager-footer-text">
        Host CDP Conectado • Sincronización en tiempo real
      </div>
    </div>
  `.trim();
}
