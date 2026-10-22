import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Builds and bundles Antigravity Mod Framework and all active mods
 * into standalone, deployable distribution files.
 */
function cleanModuleCode(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf-8')
    .replace(/^import\s+.*?;?\s*$/gm, '')
    .replace(/^export\s+(default\s+)?/gm, '');
}

async function build() {
  console.log('⚡ Building Antigravity Mod Framework...');

  // 1. Read Core & SDK sources
  const cdpPortResolver = cleanModuleCode('src/core/CdpPortResolver.js');
  const cdpWebSocketClient = cleanModuleCode('src/core/CdpWebSocketClient.js');
  const slotManager = cleanModuleCode('src/core/SlotManager.js');
  const styleIsolator = cleanModuleCode('src/sdk/StyleIsolator.js');
  const antigravityMod = cleanModuleCode('src/sdk/AntigravityMod.js');
  const modLoader = cleanModuleCode('src/core/ModLoader.js');
  const telemetryService = cleanModuleCode('src/services/TelemetryService.js');
  const modHost = cleanModuleCode('src/core/ModHost.js');

  // 2. Read Context Tachometer Mod sources
  const gaugeSvg = cleanModuleCode('mods/context-tachometer/components/GaugeSvg.js');
  const popoverHtml = cleanModuleCode('mods/context-tachometer/components/PopoverHtml.js');
  const tachometerCss = fs.readFileSync(path.resolve('mods/context-tachometer/styles.css'), 'utf-8');

  // Inline CSS for standalone bundle
  const tachometerIndex = cleanModuleCode('mods/context-tachometer/index.js')
    .replace(/const __filename = .*?;/, '')
    .replace(/const __dirname = .*?;/, '')
    .replace(/this\.cachedCss = '';[\s\S]*?\}\s*catch[^{]*\{[^}]*\}/, `this.cachedCss = ${JSON.stringify(tachometerCss)};`);

  // 3. Assemble Standalone Bundle
  const bundle = `// Antigravity Mod Framework Runtime Host (Bundle)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// ======================== Core & SDK ========================
${cdpPortResolver}

${cdpWebSocketClient}

${slotManager}

${styleIsolator}

${antigravityMod}

${modLoader}

${telemetryService}

${modHost}

// ==================== Context Tachometer Mod ====================
${gaugeSvg}

${popoverHtml}

${tachometerIndex}

// ======================= Entrypoint Execution =======================
async function main() {
  try {
    const host = new ModHost();
    host.registerMod(new ContextTachometerMod());
    await host.dispatch();
  } catch (err) {
    // Fail silently in background hook context
  }
}

main();
`;

  // 4. Write local distribution
  fs.mkdirSync('dist', { recursive: true });
  const loaderDist = path.resolve('dist/antigravity_mod_loader.mjs');
  const legacyDist = path.resolve('dist/update_ui_badge.mjs');

  fs.writeFileSync(loaderDist, bundle, 'utf-8');
  fs.writeFileSync(legacyDist, bundle, 'utf-8');
  console.log('✅ Generated dist artifacts:');
  console.log('   - ', loaderDist);
  console.log('   - ', legacyDist);

  // 5. Deploy to global ~/.gemini/config/mods/
  const targetDir = path.join(os.homedir(), '.gemini', 'config', 'mods');
  fs.mkdirSync(targetDir, { recursive: true });

  const targetLoader = path.join(targetDir, 'antigravity_mod_loader.mjs');
  const targetLegacy = path.join(targetDir, 'update_ui_badge.mjs');

  fs.writeFileSync(targetLoader, bundle, 'utf-8');
  fs.writeFileSync(targetLegacy, bundle, 'utf-8');
  console.log('🚀 Deployed successfully to ~/.gemini/config/mods/:');
  console.log('   - ', targetLoader);
  console.log('   - ', targetLegacy);
}

build().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
