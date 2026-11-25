/**
 * Generalized Semantic HTML5 "Boxes-inside-Boxes" Architecture for the Voice Mode HUD.
 *
 * Hierarchy:
 *   Box 0: [data-voice-hud-box="viewport-anchor"] (<aside role="region">) — Top-centered viewport anchor
 *   Box 1: [data-voice-hud-box="frame"]           (<section>)            — Outer layout column separating card & tray
 *   Box 2: [data-voice-hud-box="surface"]         (<article>)            — Onyx 4-sided glass card surface
 *   Box 3: [data-voice-hud-box="header"]          (<header>)             — Primary HUD bar containing:
 *            - Box 3A: [data-voice-hud-box="identity"]                   — Live waveform / orb + chat link + timer
 *            - Box 3B: [role="toolbar"][focusgroup="toolbar wrap"]
 *                        -> [data-voice-hud-box="controls-well"]         — Recessed well (mic, speaker, dictation speed, collapse/compose)
 *                        -> [role="separator"]
 *                        -> [data-voice-hud-box="actions"]               — One-shot End call action (never aria-pressed)
 *            - Box 3C: [data-voice-hud-box="drawer"]                     — Collapsible transcript / quick composer
 *   Box 4: [data-voice-hud-box="tray"]            (<div>)                — Downward-opening alerts (mic disconnected, errors, drag hint)
 */

export const VOICE_HUD_BOX_ROLES = Object.freeze({
  VIEWPORT_ANCHOR: 'viewport-anchor',
  FRAME: 'frame',
  SURFACE: 'surface',
  HEADER: 'header',
  IDENTITY: 'identity',
  TOOLBAR: 'toolbar',
  CONTROLS_WELL: 'controls-well',
  ACTIONS: 'actions',
  DRAWER: 'drawer',
  TRAY: 'tray',
  ALERT: 'alert'
});

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setAttrIfMissing(el, name, value) {
  if (!el || typeof el.setAttribute !== 'function') return;
  const existing = typeof el.getAttribute === 'function' ? el.getAttribute(name) : null;
  if (!existing) {
    el.setAttribute(name, value);
  }
}

/**
 * Generates semantic HTML5 boxes-inside-boxes markup for the top-centered Voice Mode HUD.
 * @param {Object} [options]
 * @param {string} [options.label='Voice mode HUD']
 * @param {string} [options.statusText='Listening']
 * @param {string} [options.timerText='00:00']
 * @param {boolean} [options.micMuted=false]
 * @param {boolean} [options.agentMuted=false]
 * @param {number|string} [options.speed='1x']
 * @param {boolean} [options.collapsed=true]
 * @param {string} [options.micWarning='']
 * @param {string} [options.errorMessage='']
 * @param {string} [options.transcriptHtml='']
 * @returns {string}
 */
export function renderVoiceHudBoxHtml(options = {}) {
  const {
    label = 'Voice mode HUD',
    statusText = 'Listening',
    timerText = '00:00',
    micMuted = false,
    agentMuted = false,
    speed = '1x',
    collapsed = true,
    micWarning = '',
    errorMessage = '',
    transcriptHtml = ''
  } = options;

  const speedLabel = typeof speed === 'number' ? `${speed}x` : String(speed || '1x');
  const speedNumeric = parseFloat(speedLabel) || 1;
  const hasAlert = Boolean(micWarning || errorMessage);

  return `
    <aside
      class="antigravity-voice-toast-docked agy-voice-hud${collapsed ? ' is-minimized' : ''}"
      role="region"
      aria-label="${escapeHtml(label)}"
      data-antigravity-voice-docked="true"
      data-voice-hud-box="${VOICE_HUD_BOX_ROLES.VIEWPORT_ANCHOR}"
      data-voice-hud-variant="hud"
      data-minimized="${collapsed ? 'true' : 'false'}"
    >
      <section class="agy-voice-hud-frame" data-voice-hud-box="${VOICE_HUD_BOX_ROLES.FRAME}">
        <article class="agy-voice-hud-surface" data-voice-hud-box="${VOICE_HUD_BOX_ROLES.SURFACE}">
          <header class="agy-voice-hud-header" data-voice-hud-box="${VOICE_HUD_BOX_ROLES.HEADER}">
            <div class="agy-voice-hud-identity" data-voice-hud-box="${VOICE_HUD_BOX_ROLES.IDENTITY}">
              <span class="agy-voice-hud-orb" aria-hidden="true"></span>
              <span class="agy-voice-hud-status">${escapeHtml(statusText)}</span>
              <time class="agy-voice-hud-timer">${escapeHtml(timerText)}</time>
            </div>
            <div
              class="agy-voice-hud-toolbar"
              role="toolbar"
              focusgroup="toolbar wrap"
              aria-label="Voice mode controls"
              data-voice-hud-box="${VOICE_HUD_BOX_ROLES.TOOLBAR}"
            >
              <div
                class="agy-voice-hud-controls-well"
                role="group"
                aria-label="Microphone, speaker, and dictation speed"
                data-voice-hud-box="${VOICE_HUD_BOX_ROLES.CONTROLS_WELL}"
              >
                <button
                  type="button"
                  data-testid="voice-mute-button"
                  aria-label="${micMuted ? 'Unmute mic' : 'Mute mic'}"
                  aria-pressed="${micMuted ? 'true' : 'false'}"
                >Mic</button>
                <button
                  type="button"
                  data-testid="voice-call-agent-mute"
                  aria-label="${agentMuted ? 'Unmute agent audio' : 'Mute agent audio'}"
                  aria-pressed="${agentMuted ? 'true' : 'false'}"
                >Audio</button>
                <button
                  type="button"
                  data-testid="voice-call-speed"
                  aria-label="Voice speed, ${escapeHtml(speedLabel)}"
                  aria-haspopup="dialog"
                  aria-expanded="false"
                >${escapeHtml(speedLabel)}</button>
                <button
                  type="button"
                  data-testid="voice-call-collapse"
                  aria-label="${collapsed ? 'Expand voice drawer' : 'Collapse voice drawer'}"
                  aria-expanded="${collapsed ? 'false' : 'true'}"
                >Toggle</button>
              </div>
              <span role="separator" aria-orientation="vertical" class="agy-voice-hud-separator"></span>
              <div
                class="agy-voice-hud-actions"
                role="group"
                aria-label="Voice session actions"
                data-voice-hud-box="${VOICE_HUD_BOX_ROLES.ACTIONS}"
              >
                <button
                  type="button"
                  data-testid="voice-call-end"
                  aria-label="End Voice mode"
                >End</button>
              </div>
            </div>
          </header>
          <section
            class="agy-voice-hud-drawer"
            data-testid="live-docked-replies"
            data-voice-hud-box="${VOICE_HUD_BOX_ROLES.DRAWER}"
            data-voice-hud-placement="below"
            aria-hidden="${collapsed ? 'true' : 'false'}"
          >
            <div class="agy-voice-hud-drawer-inner">
              ${transcriptHtml}
              <div class="agy-voice-hud-speed-summary" data-testid="voice-speed-panel" role="group" aria-label="Voice speed">
                <label class="agy-voice-hud-speed-label" for="agy-voice-speed-slider">Voice speed</label>
                <input
                  id="agy-voice-speed-slider"
                  type="range"
                  data-testid="voice-speed-slider"
                  aria-label="Voice speed"
                  aria-valuetext="${escapeHtml(speedLabel)}"
                  min="0.5"
                  max="2"
                  step="0.25"
                  value="${escapeHtml(speedNumeric)}"
                />
                <span data-testid="voice-speed-readout">${escapeHtml(speedLabel)}</span>
              </div>
            </div>
          </section>
        </article>
        <div
          class="agy-voice-hud-tray"
          data-voice-hud-box="${VOICE_HUD_BOX_ROLES.TRAY}"
          data-voice-hud-placement="below"
          ${hasAlert ? '' : 'data-empty="true"'}
        >
          ${micWarning ? `<div role="status" data-testid="voice-mic-warning" data-voice-hud-box="${VOICE_HUD_BOX_ROLES.ALERT}" data-voice-hud-placement="below">${escapeHtml(micWarning)}</div>` : ''}
          ${errorMessage ? `<div role="status" data-testid="voice-error-tip" data-voice-hud-box="${VOICE_HUD_BOX_ROLES.ALERT}" data-voice-hud-placement="below">${escapeHtml(errorMessage)}</div>` : ''}
        </div>
      </section>
    </aside>
  `.trim();
}

/**
 * Non-destructively annotates an active native Voice Mode container (live-docked, voice-teleprompter-slot,
 * or floating voice-dock) into the HTML5 boxes-inside-boxes HUD hierarchy without cloning or detaching nodes.
 * @param {Element|null} rootBar
 * @returns {Element|null}
 */
export function annotateVoiceHudBoxes(rootBar) {
  if (!rootBar || typeof rootBar.setAttribute !== 'function') return null;

  const testId = typeof rootBar.getAttribute === 'function' ? (rootBar.getAttribute('data-testid') || '') : '';
  const queryOne = (sel) => (typeof rootBar.querySelector === 'function' ? rootBar.querySelector(sel) : null);

  let variant = 'generic';
  if (testId === 'voice-teleprompter-slot' || queryOne('[data-testid="live-docked"]')) {
    variant = 'teleprompter';
  } else if (testId === 'voice-dock') {
    variant = 'dock';
  } else if (testId === 'voice-pill') {
    variant = 'pill';
  }

  rootBar.setAttribute('data-voice-hud-box', VOICE_HUD_BOX_ROLES.VIEWPORT_ANCHOR);
  rootBar.setAttribute('data-voice-hud-variant', variant);
  setAttrIfMissing(rootBar, 'role', 'region');
  setAttrIfMissing(rootBar, 'aria-label', 'Voice mode HUD');

  const surface = queryOne('[data-testid="live-docked"]') || (testId === 'live-docked' ? rootBar : null);
  if (surface && surface !== rootBar) {
    surface.setAttribute('data-voice-hud-box', VOICE_HUD_BOX_ROLES.SURFACE);
  }

  const controls = queryOne('[data-testid="voice-call-controls"]');
  if (controls) {
    controls.setAttribute('data-voice-hud-box', VOICE_HUD_BOX_ROLES.HEADER);
  }

  const drawer = queryOne('[data-testid="live-docked-replies"], [data-testid="voice-dock-composer"]');
  if (drawer) {
    drawer.setAttribute('data-voice-hud-box', VOICE_HUD_BOX_ROLES.DRAWER);
    drawer.setAttribute('data-voice-hud-placement', 'below');
  }

  if (typeof rootBar.querySelectorAll === 'function') {
    const alerts = rootBar.querySelectorAll('[data-testid="voice-mic-warning"], [data-testid="voice-mic-switched"], [data-testid="voice-error-tip"]');
    for (const alertEl of alerts) {
      if (alertEl && typeof alertEl.setAttribute === 'function') {
        alertEl.setAttribute('data-voice-hud-box', VOICE_HUD_BOX_ROLES.ALERT);
        alertEl.setAttribute('data-voice-hud-placement', 'below');
      }
    }
  }

  return rootBar;
}
