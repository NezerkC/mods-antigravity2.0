// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Victor Manuel Martinez Munoz

/**
 * Client for interacting with the Electron Chrome DevTools Protocol (CDP) WebSocket bridge.
 */
export class CdpWebSocketClient {
  /**
   * @param {Object} [options]
   * @param {number} [options.port=53908] CDP HTTP/WebSocket port.
   * @param {string} [options.host='127.0.0.1'] Hostname.
   * @param {number} [options.timeoutMs=4000] Socket connection timeout.
   */
  constructor(options = {}) {
    this.port = options.port ?? 53908;
    this.host = options.host || '127.0.0.1';
    this.timeoutMs = options.timeoutMs ?? 4000;
    this.sequenceId = 1;
  }

  /**
   * Builds the CDP JSON target listing endpoint.
   * @returns {string}
   */
  getTargetListUrl() {
    return `http://${this.host}:${this.port}/json`;
  }

  /**
   * Checks whether a CDP target represents a non-UI page such as a splash screen,
   * DevTools window, or blank document.
   * @param {{ url?: string, title?: string }} target
   * @returns {boolean}
   */
  static isNonUiPageTarget(target) {
    const url = typeof target?.url === 'string' ? target.url.trim().toLowerCase() : '';
    const title = typeof target?.title === 'string' ? target.title.trim().toLowerCase() : '';

    if (url) {
      if (
        url.startsWith('data:') ||
        url.startsWith('devtools:') ||
        url.startsWith('about:blank') ||
        url.startsWith('about:srcdoc') ||
        url.startsWith('chrome://') ||
        url.startsWith('chrome-devtools://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://')
      ) {
        return true;
      }
    } else if (
      title.startsWith('data:') ||
      title === 'about:blank' ||
      title.startsWith('devtools://')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Checks whether a CDP page target URL matches the primary Antigravity app window.
   * @param {{ url?: string }} target
   * @returns {boolean}
   */
  static isPreferredAppTarget(target) {
    const url = typeof target?.url === 'string' ? target.url.trim().toLowerCase() : '';
    if (!url) return false;
    return (
      url.startsWith('https://127.0.0.1') ||
      url.startsWith('http://127.0.0.1') ||
      url.startsWith('https://localhost') ||
      url.startsWith('http://localhost') ||
      url.startsWith('vscode-file:')
    );
  }

  /**
   * Finds the primary browser page target among the reported CDP targets.
   * Skips `data:`, `devtools:`, `about:blank`, and other non-UI targets,
   * preferring the real Antigravity app window with a clean fallback to any valid UI page.
   * @param {Array<{ type: string, url?: string, title?: string, webSocketDebuggerUrl?: string }>} targets
   * @returns {{ type: string, url?: string, title?: string, webSocketDebuggerUrl?: string } | undefined}
   */
  static findPageTarget(targets) {
    if (!Array.isArray(targets)) return undefined;

    const uiPages = targets.filter(
      (t) =>
        t &&
        t.type === 'page' &&
        typeof t.webSocketDebuggerUrl === 'string' &&
        t.webSocketDebuggerUrl.trim().length > 0 &&
        !CdpWebSocketClient.isNonUiPageTarget(t)
    );

    if (!uiPages.length) return undefined;

    return uiPages.find((t) => CdpWebSocketClient.isPreferredAppTarget(t)) || uiPages[0];
  }

  /**
   * Creates a JSON-RPC 2.0 command payload for Runtime.evaluate.
   * @param {string} expression JavaScript expression to evaluate.
   * @param {number} [id] Optional message ID.
   * @returns {Object}
   */
  createEvaluatePayload(expression, id) {
    return {
      id: id ?? this.sequenceId++,
      method: 'Runtime.evaluate',
      params: {
        expression,
        returnByValue: true,
        awaitPromise: true
      }
    };
  }

  /**
   * Dispatches a JavaScript expression to be evaluated inside the Electron page context.
   * @param {string} expression
   * @returns {Promise<any>}
   */
  async evaluate(expression) {
    const listUrl = this.getTargetListUrl();
    const res = await fetch(listUrl, { signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) {
      throw new Error(`Failed to query CDP targets: HTTP ${res.status}`);
    }

    const targets = await res.json();
    const page = CdpWebSocketClient.findPageTarget(targets);
    if (!page || !page.webSocketDebuggerUrl) {
      throw new Error('No active Electron page target found via CDP.');
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`CDP evaluation timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      ws.onopen = () => {
        const payload = this.createEvaluatePayload(expression);
        ws.send(JSON.stringify(payload));
      };

      ws.onmessage = (event) => {
        clearTimeout(timer);
        try {
          const data = JSON.parse(event.data);
          ws.close();
          if (data.error) {
            reject(new Error(data.error.message || 'CDP execution error'));
          } else {
            resolve(data.result?.result || data.result);
          }
        } catch (err) {
          ws.close();
          reject(err);
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timer);
        ws.close();
        reject(err);
      };
    });
  }
}
