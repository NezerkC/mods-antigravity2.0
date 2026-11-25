import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { HandyTranscribeBridge } from './HandyTranscribeBridge.mjs';
import { LanguageServerRpcClient } from '../mcp/server.mjs';

/**
 * Generates the HTML dashboard markup for the AUX_PANE view.
 *
 * @param {Object} state
 * @returns {string}
 */
export function renderDashboardHtml(state = {}) {
  const { resources = {}, dryMode = false, history = [] } = state;
  const { available = false, missing = [], paths = {} } = resources;

  const statusBadge = available
    ? '<span style="color:#22c55e;font-weight:600;">● Engine Ready</span>'
    : `<span style="color:#f59e0b;font-weight:600;">○ Missing ${missing.join(', ')}</span>`;

  const historyRows = history.length > 0
    ? history
        .map(
          (h) => `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
        <td style="padding:8px 12px;font-family:monospace;font-size:12px;">${h.timestamp ? h.timestamp.split('T')[1].slice(0, 8) : ''}</td>
        <td style="padding:8px 12px;font-weight:600;">${h.action}</td>
        <td style="padding:8px 12px;color:#94a3b8;">${h.targetCascadeId || h.cwd || 'N/A'}</td>
        <td style="padding:8px 12px;color:#e2e8f0;">${h.prompt || ''}</td>
        <td style="padding:8px 12px;color:${h.dryRun ? '#f59e0b' : '#22c55e'};">${h.dryRun ? 'Dry Run' : 'Executed'}</td>
      </tr>`
        )
        .join('')
    : '<tr><td colspan="5" style="padding:16px;text-align:center;color:#64748b;">No voice actions recorded yet</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Antigravity Voice Hub</title>
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-card: #1e293b;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --border: rgba(255,255,255,0.1);
    }
    body {
      margin: 0;
      padding: 24px;
      background-color: var(--bg-primary);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    .title {
      font-size: 20px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .card h3 {
      margin: 0 0 12px 0;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }
    .path-text {
      font-family: monospace;
      font-size: 11px;
      color: #94a3b8;
      word-break: break-all;
      margin: 4px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      background: rgba(0,0,0,0.2);
      padding: 10px 12px;
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
    }
    .form-row {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    input[type="text"] {
      flex: 1;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: #090d16;
      color: #fff;
    }
    button {
      background: #0284c7;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <span>🎙️ Antigravity Voice Hub</span>
    </div>
    <div>${statusBadge}</div>
  </div>

  <div class="grid">
    <div class="card">
      <h3>Handy Local STT Engine</h3>
      <p style="margin: 4px 0;"><strong>Status:</strong> ${available ? 'All dependencies present' : 'Missing components'}</p>
      <div class="path-text">DLL: ${paths.transcribeDll || 'Not found'}</div>
      <div class="path-text">Model: ${paths.canaryModel || 'Not found'}</div>
      <div class="path-text">VAD: ${paths.sileroVad || 'Not found'}</div>
    </div>
    <div class="card">
      <h3>Global Dispatch Settings</h3>
      <p style="margin: 4px 0;"><strong>Execution Mode:</strong> ${dryMode ? '<span style="color:#f59e0b">Muted / Dry Run</span>' : '<span style="color:#22c55e">Active RPC Dispatch</span>'}</p>
      <p style="margin: 4px 0; color: #94a3b8; font-size: 12px;">Commands routed to other chats or system actions run without polluting the active conversation.</p>
    </div>
  </div>

  <div class="card" style="margin-bottom: 24px;">
    <h3>Test Voice Dispatch</h3>
    <form id="dispatch-form" onsubmit="handleDispatch(event)">
      <div class="form-row">
        <input type="text" id="transcript-input" placeholder="e.g. En el chat hollow_vector corre los tests con postgress" required />
        <button type="submit">Dispatch Voice Command</button>
      </div>
    </form>
    <div id="result-box" style="margin-top: 8px; font-family: monospace; font-size: 12px; display: none;"></div>
  </div>

  <div class="card">
    <h3>Recent Voice Actions</h3>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Action</th>
          <th>Target</th>
          <th>Spoken Prompt</th>
          <th>Mode</th>
        </tr>
      </thead>
      <tbody>
        ${historyRows}
      </tbody>
    </table>
  </div>

  <script>
    async function handleDispatch(e) {
      e.preventDefault();
      const input = document.getElementById('transcript-input');
      const box = document.getElementById('result-box');
      box.style.display = 'block';
      box.textContent = 'Dispatching...';
      try {
        const res = await fetch('/voice/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: input.value })
        });
        const data = await res.json();
        box.textContent = JSON.stringify(data, null, 2);
        box.style.color = '#22c55e';
      } catch (err) {
        box.textContent = 'Error: ' + err.message;
        box.style.color = '#ef4444';
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Creates the Voice Hub application instance and HTTP request handler.
 *
 * @param {Object} [options={}]
 * @returns {{
 *   handler: Function,
 *   server: http.Server,
 *   bridge: HandyTranscribeBridge,
 *   rpcClient: LanguageServerRpcClient,
 *   listen: Function,
 *   close: Function
 * }}
 */
export function createVoiceHubApp(options = {}) {
  const rpcClient = options.rpcClient || new LanguageServerRpcClient(options);
  const bridge = options.bridge || new HandyTranscribeBridge({ ...options, rpcClient });

  const handler = async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const method = req.method.toUpperCase();

    // CORS headers for local sidecar integration
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-codeium-csrf-token');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (method === 'GET' && url.pathname === '/health') {
        const resources = bridge.checkResources();
        const payload = {
          status: 'ok',
          uptime: process.uptime(),
          sttStatus: {
            available: resources.available,
            missing: resources.missing,
            paths: resources.paths
          },
          dryMode: bridge.dryMode,
          historyCount: bridge.actionHistory.length
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
      }

      if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const resources = bridge.checkResources();
        const html = renderDashboardHtml({
          resources,
          dryMode: bridge.dryMode,
          history: bridge.actionHistory
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (method === 'POST' && url.pathname === '/voice/dispatch') {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }

        let parsed = {};
        if (body.trim()) {
          try {
            parsed = JSON.parse(body);
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Invalid JSON body: ${err.message}` }));
            return;
          }
        }

        const transcript = parsed.transcript ?? parsed.text ?? parsed.prompt ?? '';
        const result = await bridge.dispatchTranscript(transcript, parsed);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
        return;
      }

      // Not Found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Route not found: ${method} ${url.pathname}` }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
    }
  };

  const server = http.createServer(handler);

  return {
    handler,
    server,
    bridge,
    rpcClient,
    listen: (...args) => server.listen(...args),
    close: (...args) => server.close(...args)
  };
}

// Direct execution entrypoint
const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedFile && currentFile === invokedFile) {
  const port = Number(process.env.PORT || 8765);
  const app = createVoiceHubApp();
  app.listen(port, '127.0.0.1', () => {
    console.log(`Antigravity Voice Hub listening on http://127.0.0.1:${port}`);
  });
}
