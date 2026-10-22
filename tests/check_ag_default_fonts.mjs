import fs from 'fs';
import path from 'path';
import os from 'os';

async function checkAntigravityFonts() {
  const logDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Antigravity', 'logs');
  const logFiles = fs.readdirSync(logDir).filter(f => f.endsWith('.log')).map(f => ({ name: f, time: fs.statSync(path.join(logDir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
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
      id: 80,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          const bodyStyle = window.getComputedStyle(document.body);
          const modelBtn = document.querySelector('button[data-testid="model-selector-trigger"]');
          const codeEl = document.querySelector('code, pre');
          const rootStyle = window.getComputedStyle(document.documentElement);

          const cssVars = {};
          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules) {
                if (rule.selectorText === ':root') {
                  for (let i = 0; i < rule.style.length; i++) {
                    const name = rule.style[i];
                    if (name.includes('font')) {
                      cssVars[name] = rule.style.getPropertyValue(name).trim();
                    }
                  }
                }
              }
            } catch (e) {}
          }

          return {
            bodyFont: bodyStyle.fontFamily,
            modelBtnFont: modelBtn ? window.getComputedStyle(modelBtn).fontFamily : null,
            codeFont: codeEl ? window.getComputedStyle(codeEl).fontFamily : null,
            cssVars
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
checkAntigravityFonts();
