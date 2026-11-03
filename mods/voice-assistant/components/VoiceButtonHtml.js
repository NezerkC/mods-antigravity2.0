/**
 * Renders the HTML markup for the Chatbox Voice Assistant action button.
 * Follows Antigravity's native chatbox action icon button design tokens.
 *
 * @param {Object} [options]
 * @param {'idle'|'speaking'|'muted'} [options.state='idle']
 * @param {boolean} [options.enabled=true]
 * @returns {string}
 */
export function renderVoiceButtonHtml(options = {}) {
  const state = options.state || 'idle';
  const isMuted = options.enabled === false;
  const stateClass = isMuted ? 'state-muted' : (state === 'speaking' ? 'state-speaking' : 'state-idle');

  // Speaker icon with dynamic soundwave paths
  const iconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-secondary-foreground voice-icon ${stateClass}">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path class="wave wave-1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      <path class="wave wave-2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
      ${isMuted ? '<line x1="23" y1="1" x2="1" y2="23" class="mute-slash"></line>' : ''}
    </svg>
  `.trim();

  return `
    <div id="antigravity-voice-assistant-wrapper" class="antigravity-voice-assistant-wrapper">
      <button
        type="button"
        id="antigravity-voice-assistant-btn"
        class="antigravity-voice-assistant-btn flex items-center rounded-full transition-colors cursor-pointer w-7 h-7 justify-center p-1.5 bg-transparent hover:bg-secondary ${stateClass}"
        aria-label="Asistente de Voz (TTS)"
        title="Asistente de Voz (TTS) - Click para activar o pausar narración"
        data-mod-action="toggle-voice"
        data-voice-state="${state}"
        tabindex="0"
      >
        ${iconSvg}
      </button>
    </div>
  `.trim();
}
