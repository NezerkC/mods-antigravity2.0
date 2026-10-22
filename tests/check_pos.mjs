import fs from 'fs';
import path from 'path';
import os from 'os';

async function checkPos() {
  const logDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Antigravity', 'logs');
  const logFiles = fs.readdirSync(logDir).filter(f => f.endsWith('.log')).map(f => ({ name: f, time: fs.statSync(path.join(logDir, f)).mtimeMs })).sort((a, b) => b.time - a.time);
  let cdpPort = 53908;
  if (logFiles.length) {
    const content = fs.readFileSync(path.join(logDir, logFiles[0].name), 'utf-8');
    const match = content.match(/ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser/);
    if (match) cdpPort = Number(match[1]);
  }
  const res = await fetch(`http://127.0.0.1:${cdpPort}/json`);
  const pages = await res.json();
  const page = pages.find(p => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onopen = () => {
    ws.send(JSON.stringify({
      id: 11,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          const b = document.querySelector(".antigravity-context-badge");
          return {
            windowH: window.innerHeight,
            windowW: window.innerWidth,
            rect: b ? {
              top: b.getBoundingClientRect().top,
              bottom: b.getBoundingClientRect().bottom,
              left: b.getBoundingClientRect().left,
              right: b.getBoundingClientRect().right,
              height: b.getBoundingClientRect().height
            } : null
          };
        })()`,
        returnByValue: true
      }
    }));
  };
  ws.onmessage = (msg) => {
    console.log(JSON.parse(msg.data).result.result.value);
    ws.close();
  };
}
checkPos();
