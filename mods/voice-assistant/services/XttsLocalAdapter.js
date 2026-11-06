/**
 * Adapter for local XTTS (Coqui TTS / XTTS v2) engine with graceful fallback
 * to the browser Web Speech API (speechSynthesis).
 */
export class XttsLocalAdapter {
  /**
   * @param {Object} [options]
   * @param {string} [options.baseUrl] Local XTTS server URL (defaults to 'http://127.0.0.1:8020')
   * @param {string} [options.voice] Voice identifier or reference audio file
   * @param {string} [options.language] Target language code (defaults to 'es')
   * @param {Function} [options.fetchFn] Custom fetch implementation
   * @param {Object} [options.speechSynthesis] Custom SpeechSynthesis implementation
   */
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || 'http://127.0.0.1:8020').replace(/\/+$/, '');
    this.voice = options.voice || 'default';
    this.language = options.language || 'es';
    this.fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    this.speechSynthesis = options.speechSynthesis || (typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null);
  }

  /**
   * Probes the XTTS server health endpoint.
   * @param {number} [timeoutMs=1200]
   * @returns {Promise<boolean>}
   */
  async isAvailable(timeoutMs = 1200) {
    const fetchImpl = this.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchImpl) return false;

    let timeoutId = null;
    try {
      let signal;
      if (typeof AbortController !== 'undefined') {
        const controller = new AbortController();
        signal = controller.signal;
        timeoutId = setTimeout(() => {
          controller.abort();
        }, timeoutMs);
      }

      const res = await fetchImpl(`${this.baseUrl}/health`, {
        method: 'GET',
        signal
      });

      if (timeoutId) clearTimeout(timeoutId);
      return !!(res && (res.ok || res.status === 200));
    } catch {
      if (timeoutId) clearTimeout(timeoutId);
      return false;
    }
  }

  /**
   * Synthesizes speech from text. Tries local XTTS first, then falls back to SpeechSynthesis.
   * @param {string} text
   * @param {Object} [options]
   * @param {string} [options.voice]
   * @param {string} [options.language]
   * @param {string} [options.response_format]
   * @param {string} [options.format]
   * @returns {Promise<Object>}
   */
  async synthesize(text, options = {}) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return { success: false, reason: 'empty_text' };
    }

    const cleanText = text.trim();

    try {
      const available = await this.isAvailable();
      if (available) {
        const fetchImpl = this.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
        if (fetchImpl) {
          const format = options.response_format || options.format || 'wav';
          const payload = {
            input: cleanText,
            voice: options.voice || this.voice,
            language: options.language || this.language,
            response_format: format
          };

          const res = await fetchImpl(`${this.baseUrl}/v1/audio/speech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res && (res.ok || res.status === 200)) {
            let audioBuffer = null;
            if (typeof res.arrayBuffer === 'function') {
              audioBuffer = await res.arrayBuffer();
            } else if (typeof res.buffer === 'function') {
              audioBuffer = await res.buffer();
            }

            return {
              success: true,
              source: 'xtts',
              audioBuffer,
              format
            };
          }
        }
      }
    } catch {
      // Local server error, proceed to fallback
    }

    // Web Speech API fallback
    const synth = this.speechSynthesis || (typeof window !== 'undefined' ? window.speechSynthesis : null);
    if (synth && typeof synth.speak === 'function') {
      try {
        const UtteranceClass = (typeof SpeechSynthesisUtterance !== 'undefined')
          ? SpeechSynthesisUtterance
          : (typeof globalThis !== 'undefined' && globalThis.SpeechSynthesisUtterance ? globalThis.SpeechSynthesisUtterance : null);

        let utterance;
        if (UtteranceClass) {
          utterance = new UtteranceClass(cleanText);
          const lang = options.language || this.language;
          if (lang) utterance.lang = lang;
        } else {
          utterance = { text: cleanText, lang: options.language || this.language };
        }

        synth.speak(utterance);
        return { success: true, source: 'web_speech' };
      } catch {
        // Fallback failed
      }
    }

    return {
      success: false,
      source: 'none',
      reason: 'no_tts_engine_available'
    };
  }
}
