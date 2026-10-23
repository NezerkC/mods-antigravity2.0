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
 * @returns {string}
 */
export function renderModsManagerPanelHtml() {
  return `
    <div class="mods-manager-header">
      <div class="mods-manager-title-wrap">
        <h3 class="mods-manager-title">Antigravity Mods</h3>
        <span class="mods-manager-badge">v2.0</span>
      </div>
      <button class="mods-manager-close-btn" id="antigravity-mods-manager-close" title="Cerrar">✕</button>
    </div>

    <!-- Mod Card: Context Tachometer -->
    <div class="mod-card">
      <div class="mod-info">
        <div class="mod-icon-box">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
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
        <div class="mod-icon-box">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
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

    <!-- Mod Card: Background Persistence (Daemon Kill-Switch) -->
    <div class="mod-card daemon-card">
      <div class="mod-info">
        <div class="mod-icon-box" style="background: rgba(122, 162, 247, 0.15); color: #7aa2f7;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
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
  `.trim();
}
