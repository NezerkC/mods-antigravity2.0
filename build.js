import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Builds and bundles the Antigravity UI Mod into ~/.gemini/config/mods/update_ui_badge.mjs
 */
async function build() {
  console.log('Building Antigravity 2.0 Context Tachometer Mod...');

  const metricsCode = fs.readFileSync(path.resolve('src/metrics.js'), 'utf-8')
    .replace(/^import\s+.*?;?\s*$/gm, '')
    .replace(/^export\s+/gm, '');

  const injectorCode = fs.readFileSync(path.resolve('src/injector.js'), 'utf-8')
    .replace(/^import\s+.*?;?\s*$/gm, '')
    .replace(/^export\s+/gm, '');

  const bundle = `// Generated automatically by build.js - Antigravity 2.0 Context Tachometer Mod
import fs from 'fs';
import path from 'path';
import os from 'os';

${metricsCode}

${injectorCode}

injectContextUI();
`;

  // Write local dist
  fs.mkdirSync('dist', { recursive: true });
  const distPath = path.resolve('dist/update_ui_badge.mjs');
  fs.writeFileSync(distPath, bundle, 'utf-8');
  console.log('Saved to dist:', distPath);

  // Deploy to global Antigravity mods directory
  const targetDir = path.join(os.homedir(), '.gemini', 'config', 'mods');
  fs.mkdirSync(targetDir, { recursive: true });
  const deployPath = path.join(targetDir, 'update_ui_badge.mjs');
  fs.writeFileSync(deployPath, bundle, 'utf-8');
  console.log('Deployed successfully to:', deployPath);
}

build().catch(err => {
  console.error('Build error:', err);
  process.exit(1);
});
