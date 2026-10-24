import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const releaseDir = path.resolve('dist/release');
fs.mkdirSync(releaseDir, { recursive: true });

console.log('📦 Packaging release v2.0.0 assets...');

// 1. Package individual mods
const mods = ['context-tachometer', 'agent-selector', 'mods-manager', 'git-graph'];
for (const mod of mods) {
  const modDir = path.resolve(`mods/${mod}`);
  const zipPath = path.join(releaseDir, `mod-${mod}-v2.0.0.zip`);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${modDir}\\*' -DestinationPath '${zipPath}' -Force"`);
  console.log(`✅ Packaged mod: ${zipPath}`);
}

// 2. Package complete bundle (loaders + manifests + bat)
const bundleZip = path.join(releaseDir, 'antigravity-mods-v2.0.0-full.zip');
if (fs.existsSync(bundleZip)) fs.unlinkSync(bundleZip);

const stagingDir = path.resolve('dist/staging_v2');
if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true });
fs.mkdirSync(stagingDir, { recursive: true });

fs.copyFileSync('dist/antigravity_mod_loader.mjs', path.join(stagingDir, 'antigravity_mod_loader.mjs'));
fs.copyFileSync('dist/update_ui_badge.mjs', path.join(stagingDir, 'update_ui_badge.mjs'));
fs.copyFileSync('start-daemon.bat', path.join(stagingDir, 'start-daemon.bat'));
fs.copyFileSync('README.md', path.join(stagingDir, 'README.md'));
fs.cpSync('mods', path.join(stagingDir, 'mods'), { recursive: true });

execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${bundleZip}' -Force"`);
fs.rmSync(stagingDir, { recursive: true });
console.log(`✅ Packaged full bundle: ${bundleZip}`);

console.log('🚀 All release assets packaged successfully in dist/release/');
