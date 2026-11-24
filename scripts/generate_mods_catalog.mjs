#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SlotManager } from '../framework/core/SlotManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Cleans a JSDoc block and extracts description, @param and @returns tags.
 * @param {string} comment
 * @returns {{ description: string, params: Array<{ type: string, name: string, desc: string }>, returns: string }}
 */
function cleanJsDoc(comment) {
  if (!comment) return { description: '', params: [], returns: '' };
  const cleaned = comment.trim().replace(/^\/\*\*|\*\/$/g, '').trim();
  const lines = cleaned
    .split('\n')
    .map(l => l.replace(/^\s*\*\s?/, '').trim());

  const descLines = [];
  const params = [];
  let returns = '';

  for (const line of lines) {
    if (line.startsWith('@param')) {
      const match = line.match(/@param\s+(?:\{([^}]+)\}\s+)?(?:\[?([a-zA-Z0-9_$.]+)(?:=[^\]]+)?\]?)\s*(.*)/);
      if (match) {
        params.push({ type: match[1] || 'any', name: match[2], desc: match[3] || '' });
      }
    } else if (line.startsWith('@returns') || line.startsWith('@return')) {
      const match = line.match(/@returns?\s+(?:\{([^}]+)\}\s*)?(.*)/);
      if (match) {
        returns = (match[1] ? `{${match[1]}} ` : '') + (match[2] || '');
      }
    } else if (!line.startsWith('@') && line.length > 0) {
      descLines.push(line);
    }
  }

  return {
    description: descLines.join(' ').trim(),
    params,
    returns: returns.trim()
  };
}

/**
 * Parses JavaScript source code to extract classes, public methods, and exported functions.
 * Does not require external AST parser dependencies.
 * @param {string} filePath
 * @returns {{ classes: Array<Object>, exportedFunctions: Array<Object>, topDoc: string }}
 */
function parseJsFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const classes = [];

  // Top-level JSDoc
  const topDocMatch = content.match(/^\/\*\*([^*]|\*(?!\/))*\*\//);
  const topDoc = topDocMatch ? cleanJsDoc(topDocMatch[0]).description : '';

  // Class declaration with strictly adjacent JSDoc
  const classRegex = /(?:(\/\*\*([^*]|\*(?!\/))*\*\/)\s*)?(?:export\s+)?class\s+([A-Za-z0-9_]+)(?:\s+extends\s+([A-Za-z0-9_]+))?\s*\{/g;
  let classMatch;
  while ((classMatch = classRegex.exec(content)) !== null) {
    const classJsDoc = cleanJsDoc(classMatch[1]);
    const className = classMatch[3];
    const extendsName = classMatch[4] || null;
    const classStartIndex = classMatch.index + classMatch[0].length;

    let braceCount = 1;
    let i = classStartIndex;
    while (i < content.length && braceCount > 0) {
      if (content[i] === '{') braceCount++;
      else if (content[i] === '}') braceCount--;
      i++;
    }
    const classBody = content.slice(classStartIndex, i - 1);

    // Class methods with strictly adjacent JSDoc (indented by 2 spaces)
    const methodRegex = /(?:(\/\*\*([^*]|\*(?!\/))*\*\/)\s*)?^[ \t]{2}(static\s+)?(async\s+)?([a-zA-Z0-9_$]+)\s*\(([\s\S]*?)\)\s*\{/gm;
    let methodMatch;
    const methods = [];
    while ((methodMatch = methodRegex.exec(classBody)) !== null) {
      const jsDocRaw = methodMatch[1];
      const isStatic = Boolean(methodMatch[3]);
      const isAsync = Boolean(methodMatch[4]);
      const methodName = methodMatch[5];
      const rawParams = methodMatch[6].replace(/\s+/g, ' ').trim();

      if (['if', 'for', 'while', 'switch', 'catch', 'get', 'set'].includes(methodName)) continue;
      if (methodName.startsWith('_') || methodName.startsWith('#')) continue;

      const jsDoc = cleanJsDoc(jsDocRaw);
      methods.push({
        name: methodName,
        params: rawParams,
        isStatic,
        isAsync,
        description: jsDoc.description || 'Public class method.',
        returns: jsDoc.returns || 'void'
      });
    }

    classes.push({
      className,
      extendsName,
      description: classJsDoc.description || topDoc || 'Core framework module.',
      methods
    });
  }

  // Standalone exported functions with strictly adjacent JSDoc
  const funcRegex = /(?:(\/\*\*([^*]|\*(?!\/))*\*\/)\s*)?^export\s+(async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([\s\S]*?)\)\s*\{/gm;
  let funcMatch;
  const exportedFunctions = [];
  while ((funcMatch = funcRegex.exec(content)) !== null) {
    const jsDoc = cleanJsDoc(funcMatch[1]);
    exportedFunctions.push({
      name: funcMatch[4],
      isAsync: Boolean(funcMatch[3]),
      params: funcMatch[5].replace(/\s+/g, ' ').trim(),
      description: jsDoc.description || 'Exported utility function.',
      returns: jsDoc.returns || 'void'
    });
  }

  return { classes, exportedFunctions, topDoc };
}

/**
 * Scans all mods in the `mods/` directory.
 * @param {SlotManager} slotManager
 * @returns {Array<Object>}
 */
function scanMods(slotManager) {
  const modsDir = path.join(ROOT_DIR, 'mods');
  if (!fs.existsSync(modsDir)) return [];

  const modDirs = fs.readdirSync(modsDir)
    .filter(d => fs.statSync(path.join(modsDir, d)).isDirectory())
    .sort();

  const mods = [];

  for (const dirName of modDirs) {
    const modPath = path.join(modsDir, dirName);
    const manifestPath = path.join(modPath, 'manifest.json');
    let manifest = { id: dirName, name: dirName, version: '1.0.0', slot: 'header-actions', priority: 50 };

    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch (err) {
        console.warn(`Warning: Could not parse manifest in ${dirName}:`, err.message);
      }
    }

    // Styles
    const cssPath = path.join(modPath, 'styles.css');
    const hasCss = fs.existsSync(cssPath);
    const cssSizeBytes = hasCss ? fs.statSync(cssPath).size : 0;

    // Components
    const compDir = path.join(modPath, 'components');
    const components = fs.existsSync(compDir)
      ? fs.readdirSync(compDir).filter(f => f.endsWith('.js') || f.endsWith('.mjs')).sort()
      : [];

    // Mod-local services
    const servDir = path.join(modPath, 'services');
    const localServices = fs.existsSync(servDir)
      ? fs.readdirSync(servDir).filter(f => f.endsWith('.js') || f.endsWith('.mjs')).sort()
      : [];

    // Slot information
    const slotDef = slotManager.slots.get(manifest.slot);
    const domSelector = slotDef ? slotDef.selector : 'body';
    const domStrategy = slotDef ? slotDef.strategy : 'append';

    // Index.js parse
    const indexPath = path.join(modPath, 'index.js');
    let mainClass = null;
    if (fs.existsSync(indexPath)) {
      const parsedIndex = parseJsFile(indexPath);
      if (parsedIndex.classes.length > 0) {
        mainClass = parsedIndex.classes[0];
      }
    }

    mods.push({
      id: manifest.id || dirName,
      dirName,
      name: manifest.name || dirName,
      version: manifest.version || '1.0.0',
      description: manifest.description || 'Desktop UI Mod for Antigravity.',
      slot: manifest.slot,
      priority: manifest.priority ?? 50,
      author: manifest.author || null,
      domSelector,
      domStrategy,
      hasCss,
      cssSizeBytes,
      components,
      localServices,
      mainClass
    });
  }

  return mods;
}

/**
 * Scans framework directories (core, services, sdk).
 * @param {string} subDir
 * @returns {Array<Object>}
 */
function scanFrameworkDir(subDir) {
  const targetDir = path.join(ROOT_DIR, 'framework', subDir);
  if (!fs.existsSync(targetDir)) return [];

  const files = fs.readdirSync(targetDir)
    .filter(f => f.endsWith('.js') || f.endsWith('.mjs'))
    .sort();

  const modules = [];

  for (const file of files) {
    const filePath = path.join(targetDir, file);
    const relPath = `framework/${subDir}/${file}`;
    const parsed = parseJsFile(filePath);

    modules.push({
      file,
      relPath,
      topDoc: parsed.topDoc,
      classes: parsed.classes,
      exportedFunctions: parsed.exportedFunctions
    });
  }

  return modules;
}

/**
 * Scans test suites (unit and functional).
 * @returns {{ unit: Array<Object>, functional: Array<Object>, totalTests: number }}
 */
function scanTests() {
  function scanDir(dirName, suiteType) {
    const targetDir = path.join(ROOT_DIR, 'tests', dirName);
    if (!fs.existsSync(targetDir)) return [];

    const files = fs.readdirSync(targetDir)
      .filter(f => f.endsWith('.test.mjs'))
      .sort();

    const results = [];

    for (const file of files) {
      const fullPath = path.join(targetDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');

      // Match test('...') or it('...')
      const testMatches = [...content.matchAll(/(?:test|it)\s*\(\s*['"`]([\s\S]*?)['"`]/g)];
      const testCount = testMatches.length;

      // Extract target imports
      const importMatches = [...content.matchAll(/import\s+(?:\{[^}]*\}|\* as \w+|\w+)\s+from\s+['"]([^'"]+)['"]/g)];
      const targets = [];
      for (const imp of importMatches) {
        const impPath = imp[1];
        if (impPath.includes('framework/') || impPath.includes('mods/') || impPath.includes('tools/') || impPath.includes('plugins/')) {
          const resolved = path.normalize(path.join(targetDir, impPath)).replace(/\\/g, '/');
          const match = resolved.match(/(framework\/.*|mods\/.*|tools\/.*|plugins\/.*)/);
          if (match && !targets.includes(match[1])) {
            targets.push(match[1]);
          }
        }
      }

      results.push({
        file,
        relPath: `tests/${dirName}/${file}`,
        suiteType,
        testCount,
        targets,
        sampleTest: testMatches[0] ? testMatches[0][1].replace(/\r?\n/g, ' ').slice(0, 75) : ''
      });
    }

    return results;
  }

  const unit = scanDir('unit', 'Unit');
  const functional = scanDir('functional', 'Functional');
  const totalTests = [...unit, ...functional].reduce((acc, t) => acc + t.testCount, 0);

  return { unit, functional, totalTests };
}

/**
 * Curated repository-wide single-line file responsibility registry.
 * Provides a dense, accurate architectural summary of all project files.
 */
const CURATED_FILE_RESPONSIBILITIES = {
  // Root Governance & Configs
  '.agents/rules/git-workflow.md': 'Governance rules for short-lived branches, atomic commits, and merge verification.',
  '.github/pull_request_template.md': 'Standard Pull Request description template enforcing Conventional Commits and testing evidence.',
  '.github/scripts/seed_backlog.cjs': 'Automated script to seed and sync architecture tasks into GitHub Projects backlog.',
  '.github/workflows/auto-progress-tracker.yml': 'GitHub Actions workflow updating project task cards and backlog status on git push.',
  '.github/workflows/ci.yml': 'Continuous Integration workflow executing test suites and verifying bundle builds.',
  '.github/workflows/seed-project-backlog.yml': 'Dispatched GitHub Action workflow to populate GitHub Projects board with milestones.',
  '.gitignore': 'Git ignore rules for node_modules, build artifacts, temporary logs, and local caches.',
  'antigravity_screenshot.png': 'Visual reference screenshot of Antigravity 2.0 with active mods and telemetry badge.',
  'build.js': 'Rollup-style build and bundler script packaging framework runtime and mods into dist bundles.',
  'GEMINI.md': 'Repository instruction contract enforcing atomic commits, branch workflows, and zero AI attribution.',
  'package.json': 'Node.js package manifest defining dependencies, daemon scripts, tests, and build commands.',
  'PLAN.md': 'Comprehensive engineering roadmap, architectural invariants, and backlog task tracking.',
  'progreso.ps1': 'Interactive PowerShell assistant checking local git status, pending issues, and branch health.',
  'README.md': 'Project overview, architectural architecture diagram, installation guide, and usage documentation.',
  'start-daemon.bat': 'One-click Windows batch launcher initializing background ModDaemon process.',

  // Documentation
  'docs/GIT_WORKFLOW.md': 'Developer guidelines for branching strategy, atomic conventional commits, and CI validation.',
  'docs/MOD_AUTHORING_GUIDE.md': 'Developer tutorial on creating custom Antigravity UI mods using AntigravityMod base class.',
  'docs/PLAN_TAILSCALE_REMOTE_MESH.md': 'Architecture design document for Tailscale P2P mesh discovery and remote telemetry.',
  'docs/PLAN_VCS_CICD.md': 'Technical specification for Git DAG visualization and GitHub Actions integration.',
  'docs/SPEC_TAILSCALE_PEER_SYNC.md': 'Contract and wire protocol specification for cross-device peer transcript synchronization.',

  // Framework Entrypoints & Assets
  'framework/daemon.js': 'CLI entrypoint for managing the background ModDaemon (start, stop, status, install, uninstall).',
  'framework/host.js': 'CLI entrypoint to trigger an immediate one-shot injection dispatch into active Antigravity Electron.',
  'framework/index.js': 'Main module export aggregator providing programmatic access to framework core, sdk, and services.',
  'framework/assets/mod-daemon.ico': 'High-resolution Windows taskbar tray icon for the background Antigravity Mod Daemon.',

  // Framework Core
  'framework/core/CdpPortResolver.js': 'Auto-detects and validates Electron Chrome DevTools Protocol (CDP) port via HTTP probing and logs.',
  'framework/core/CdpWebSocketClient.js': 'Zero-dependency WebSocket client for executing JavaScript within Electron page targets via CDP.',
  'framework/core/ModDaemon.js': 'Background service monitoring Electron lifecycle and maintaining persistent mod injection.',
  'framework/core/ModHost.js': 'Central orchestrator coordinating mod compilation, repo path resolution, and CDP dispatch.',
  'framework/core/ModLoader.js': 'Client-side runtime script injected into Electron renderer managing DOM mounting and lifecycle.',
  'framework/core/SlotManager.js': 'Defines and manages target UI slot injection anchors and CSS selector strategies in Antigravity DOM.',

  // Framework SDK
  'framework/sdk/AntigravityMod.js': 'Abstract base class enforcing lifecycle hooks (onInit, render, onUpdate, onDestroy) for mods.',
  'framework/sdk/StyleIsolator.js': 'CSS scoping utility isolating mod stylesheets using scoped class prefixes.',

  // Framework Services
  'framework/services/AgentDiscoveryService.js': 'Discovers and parses markdown agent definitions across workspaces and global vaults.',
  'framework/services/AgentSyncServer.js': 'Local HTTP bridge synchronizing active agent selections and modifier state with external agents.',
  'framework/services/GitHubCliService.js': 'Integrates with GitHub CLI (`gh`) to fetch active PR metadata and CI/CD workflow run statuses.',
  'framework/services/GitService.js': 'High-performance local Git operations, topological commit graph calculation, and Gravatar avatars.',
  'framework/services/RemoteHostServer.js': 'Lightweight HTTP/SSE server exposing local conversation transcripts securely across Tailscale mesh.',
  'framework/services/TailscaleDiscoveryService.js': 'Detects Tailscale CLI, retrieves node status, and discovers online mesh peer devices.',
  'framework/services/TelemetryService.js': 'Parses conversation transcripts, tracks multi-model token metrics, and calculates quota reset countdowns.',
  'framework/services/VcsOrchestrator.js': 'Aggregates local Git repository status and remote GitHub metadata into a unified VCS overview.',
  'framework/services/WindowsDaemonService.js': 'Manages Windows Startup persistence via hidden VBScript launchers and PowerShell tray runner.',

  // Distribution
  'dist/antigravity_mod_loader.mjs': 'Standalone bundled distribution payload for injection into Antigravity Electron.',
  'dist/update_ui_badge.mjs': 'Legacy standalone distribution bundle maintaining backward compatibility.',

  // Scripts & Tools
  'scripts/generate_mods_catalog.mjs': 'Deterministic catalog generator compiling architecture, mods, services, and tests into MODS_CATALOG.md.',
  'scripts/xtts_local_server.py': 'Standalone local FastAPI/XTTS v2 server providing high-fidelity neural speech synthesis.',
  'tools/generate_icon.ps1': 'PowerShell script generating multi-resolution Windows ICO assets from vector shapes.',
  'tools/package_release.mjs': 'Packages standalone release distribution zips for deployment and GitHub releases.',
  'tools/probe.js': 'CLI diagnostic probe for verifying CDP ports, Electron DOM targets, and running processes.',
  'tools/remote-host-daemon.js': 'Stand-alone daemon runner initializing RemoteHostServer for remote mesh transcript streaming.',

  // Plugins: antigravity-voice-control
  'plugins/antigravity-voice-control/mcp/server.mjs': 'MCP server exposing voice control tools, session management, and Language Server RPC client.',
  'plugins/antigravity-voice-control/mcp_config.json': 'MCP server configuration registering voice control tool definitions.',
  'plugins/antigravity-voice-control/plugin.json': 'Antigravity plugin manifest defining voice control metadata, MCP, and sidecars.',
  'plugins/antigravity-voice-control/rules/AGENTS.md': 'Governance rules and architectural boundaries for the voice control plugin.',
  'plugins/antigravity-voice-control/sidecars/HandyTranscribeBridge.mjs': 'Bridge integrating Handy C transcription library and local voice RPC dispatch.',
  'plugins/antigravity-voice-control/sidecars/launch.mjs': 'HTTP voice hub dashboard and audio transcription ingestion endpoint.',
  'plugins/antigravity-voice-control/sidecars/voice-hub/sidecar.json': 'Sidecar configuration mounting voice hub auxiliary panel into Antigravity UI.',
  'plugins/antigravity-voice-control/skills/antigravity-control/SKILL.md': 'Skill documentation and command reference for Antigravity voice control operations.'
};

/**
 * Resolves a single-line responsibility description for any file in the repository.
 * Uses curated descriptions when available, falling back to clean header comment/JSDoc extraction.
 * @param {string} relPath
 * @returns {string}
 */
function resolveFileResponsibility(relPath) {
  if (CURATED_FILE_RESPONSIBILITIES[relPath]) {
    return CURATED_FILE_RESPONSIBILITIES[relPath];
  }

  // Mod components
  if (relPath.startsWith('mods/')) {
    const parts = relPath.split('/');
    const modId = parts[1];
    const fileName = path.basename(relPath);

    if (fileName === 'manifest.json') return `Manifest metadata, target slot, and priority declaration for '${modId}' mod.`;
    if (fileName === 'styles.css') return `Scoped CSS stylesheet defining visual styling, layout, and animations for '${modId}'.`;
    if (fileName === 'index.js') return `Main entrypoint and AntigravityMod class implementation for '${modId}'.`;
    if (relPath.includes('/components/')) {
      if (fileName.includes('Svg')) return `SVG rendering component generating dynamic vector graphics for '${modId}'.`;
      if (fileName.includes('Html')) return `HTML template builder generating DOM markup and event containers for '${modId}'.`;
      if (fileName.includes('Icon')) return `Vector icon dictionary and glyph renderers for '${modId}'.`;
      return `UI presentation component for '${modId}'.`;
    }
    if (relPath.includes('/services/')) {
      return `Mod-scoped background service supporting runtime functionality for '${modId}'.`;
    }
  }

  // Tests
  if (relPath.startsWith('tests/')) {
    const fileName = path.basename(relPath);
    if (relPath.startsWith('tests/unit/')) {
      const sut = fileName.replace(/\.test\.mjs$/, '').replace(/_/g, ' ');
      return `Unit test suite verifying behavior and edge cases for ${sut}.`;
    }
    if (relPath.startsWith('tests/functional/')) {
      const sut = fileName.replace(/\.test\.mjs$/, '').replace(/_/g, ' ');
      return `Functional integration test suite validating end-to-end lifecycle for ${sut}.`;
    }
    return `Manual verification and visual regression test script.`;
  }

  // Fallback: Read first sentence from file
  try {
    const fullPath = path.join(ROOT_DIR, relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const docMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
      if (docMatch) {
        const desc = cleanJsDoc(docMatch[1]).description;
        if (desc) {
          const firstSentence = desc.split(/\.\s+/)[0];
          return firstSentence.endsWith('.') ? firstSentence : firstSentence + '.';
        }
      }
    }
  } catch {}

  return 'Repository module file.';
}

/**
 * Gathers all repository files for the single-line responsibility map.
 * @returns {Array<{ relPath: string, responsibility: string, group: string }>}
 */
function gatherAllFiles() {
  const result = [];

  function walk(dirRel, group) {
    const dirAbs = path.join(ROOT_DIR, dirRel);
    if (!fs.existsSync(dirAbs)) return;

    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    for (const ent of entries) {
      const childRel = `${dirRel}/${ent.name}`.replace(/^\.\//, '');
      if (ent.isDirectory()) {
        if (ent.name === '.git' || ent.name === 'node_modules' || ent.name === 'dist') continue;
        walk(childRel, group);
      } else {
        result.push({
          relPath: childRel,
          responsibility: resolveFileResponsibility(childRel),
          group
        });
      }
    }
  }

  // Walk major directories
  walk('framework', 'Framework Runtime & Services');
  walk('mods', 'Antigravity UI Mods');
  walk('plugins', 'Ecosystem Plugins');
  walk('tools', 'Developer Tools & CLI Scripts');
  walk('scripts', 'Automation Scripts');
  walk('docs', 'Technical Specifications & Documentation');
  walk('tests', 'Test Suites & Verification');

  // Add root files
  const rootFiles = fs.readdirSync(ROOT_DIR, { withFileTypes: true })
    .filter(e => !e.isDirectory() && e.name !== '.git')
    .map(e => e.name)
    .sort();

  for (const rf of rootFiles) {
    if (rf === 'MODS_CATALOG.md') continue; // Don't self-reference
    result.push({
      relPath: rf,
      responsibility: resolveFileResponsibility(rf),
      group: 'Root Configuration & Architecture'
    });
  }

  return result.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/**
 * Builds the complete Markdown catalog string deterministically.
 * @returns {string}
 */
function generateCatalogMarkdown() {
  const slotManager = new SlotManager();
  const mods = scanMods(slotManager);
  const coreModules = scanFrameworkDir('core');
  const serviceModules = scanFrameworkDir('services');
  const sdkModules = scanFrameworkDir('sdk');
  const testData = scanTests();
  const allFiles = gatherAllFiles();

  const lines = [];

  // Header
  lines.push('# Antigravity 2.0 Mods & Framework Architectural Catalog');
  lines.push('');
  lines.push('> **Deterministic Architecture Catalog** — Generated automatically by `scripts/generate_mods_catalog.mjs`.');
  lines.push('> Provides subagents and developers with instant, token-efficient architectural context without crawling raw source files.');
  lines.push('');

  // Table of Contents
  lines.push('## Table of Contents');
  lines.push('- [1. Active Mods & UI Slot Topology](#1-active-mods--ui-slot-topology)');
  lines.push('- [2. Framework UI Slot Registry](#2-framework-ui-slot-registry)');
  lines.push('- [3. Framework Core Runtime & SDK](#3-framework-core-runtime--sdk)');
  lines.push('- [4. Framework Services & Public API Reference](#4-framework-services--public-api-reference)');
  lines.push('- [5. Test Suite Mapping & Coverage](#5-test-suite-mapping--coverage)');
  lines.push('- [6. Single-Line Repository File Responsibility Map](#6-single-line-repository-file-responsibility-map)');
  lines.push('');

  // 1. Active Mods & UI Slot Topology
  lines.push('---');
  lines.push('## 1. Active Mods & UI Slot Topology');
  lines.push('');
  lines.push('Antigravity 2.0 UI mods mount cleanly into Electron DOM slots via non-destructive Chrome DevTools Protocol (CDP) injection.');
  lines.push('');
  lines.push('| Mod ID | Name | Version | Priority | Slot | DOM Anchor Selector | Strategy | Components | Styles |');
  lines.push('|---|---|---|:---:|---|---|:---:|:---:|:---:|');
  for (const m of mods) {
    const compCount = m.components.length;
    const cssBadge = m.hasCss ? `${(m.cssSizeBytes / 1024).toFixed(1)} KB` : 'None';
    lines.push(`| \`${m.id}\` | **${m.name}** | \`${m.version}\` | ${m.priority} | \`${m.slot}\` | \`${m.domSelector}\` | \`${m.domStrategy}\` | ${compCount} | ${cssBadge} |`);
  }
  lines.push('');

  // Detailed Mod Profiles
  lines.push('### Detailed Mod Specifications');
  for (const m of mods) {
    lines.push(`#### Mod: \`${m.id}\` (${m.name})`);
    lines.push(`- **Description:** ${m.description}`);
    lines.push(`- **Primary Slot:** \`${m.slot}\` (injects \`${m.domStrategy}\` target \`${m.domSelector}\`)`);
    lines.push(`- **Priority:** ${m.priority}`);
    if (m.author) lines.push(`- **Author:** ${m.author}`);
    if (m.components.length > 0) {
      lines.push(`- **Components:** ${m.components.map(c => `\`mods/${m.dirName}/components/${c}\``).join(', ')}`);
    }
    if (m.localServices.length > 0) {
      lines.push(`- **Local Services:** ${m.localServices.map(s => `\`mods/${m.dirName}/services/${s}\``).join(', ')}`);
    }
    lines.push(`- **Styles:** ${m.hasCss ? `\`mods/${m.dirName}/styles.css\` (${m.cssSizeBytes} bytes)` : 'Inline / none'}`);
    lines.push('');
  }

  // 2. Framework UI Slot Registry
  lines.push('---');
  lines.push('## 2. Framework UI Slot Registry');
  lines.push('');
  lines.push('Registered in `framework/core/SlotManager.js`. Mods declare one of these slots to anchor their UI in Antigravity Electron:');
  lines.push('');
  lines.push('| Slot ID | DOM CSS Target Selector | Injection Strategy | Mounted Mods | Description / Usage |');
  lines.push('|---|---|:---:|---|---|');

  const registeredSlots = Array.from(slotManager.slots.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [slotId, def] of registeredSlots) {
    const mountedMods = mods.filter(m => m.slot === slotId).map(m => `\`${m.id}\``).join(', ') || '*(none)*';
    let slotUsage = 'General UI mounting point.';
    if (slotId === 'header-actions') slotUsage = 'Header action row next to the model selection trigger.';
    if (slotId === 'header-right') slotUsage = 'Top-right corner of the global application banner.';
    if (slotId === 'menubar-actions') slotUsage = 'Sidebar navigation action strip for persistent mod icons and menus.';
    if (slotId === 'status-bar') slotUsage = 'Footer status bar container for telemetry summaries and background statuses.';
    if (slotId === 'floating-dock') slotUsage = 'Detached floating container anchored directly to DOM body.';
    if (slotId === 'aux-pane-tab') slotUsage = 'Auxiliary right-side panel tab bar button.';
    if (slotId === 'chat-input-actions') slotUsage = 'Action button row adjacent to voice memo / chat input form.';

    lines.push(`| \`${slotId}\` | \`${def.selector}\` | \`${def.strategy}\` | ${mountedMods} | ${slotUsage} |`);
  }
  lines.push('');

  // 3. Framework Core Runtime & SDK
  lines.push('---');
  lines.push('## 3. Framework Core Runtime & SDK');
  lines.push('');
  lines.push('The core orchestration runtime manages CDP communication, daemon polling, lifecycle dispatching, and CSS scoping.');
  lines.push('');

  const allCore = [...coreModules, ...sdkModules];
  for (const mod of allCore) {
    lines.push(`### \`${mod.relPath}\``);
    if (mod.topDoc) {
      lines.push(`> ${mod.topDoc}`);
      lines.push('');
    }

    for (const cls of mod.classes) {
      const extStr = cls.extendsName ? ` extends \`${cls.extendsName}\`` : '';
      lines.push(`#### Class: \`${cls.className}\`${extStr}`);
      lines.push(`${cls.description}`);
      lines.push('');
      if (cls.methods.length > 0) {
        lines.push('| Method | Signature | Returns | Description |');
        lines.push('|---|---|:---:|---|');
        for (const m of cls.methods) {
          const flag = (m.isStatic ? '`static` ' : '') + (m.isAsync ? '`async` ' : '');
          lines.push(`| ${flag}\`${m.name}()\` | \`${m.name}(${m.params})\` | \`${m.returns}\` | ${m.description} |`);
        }
        lines.push('');
      }
    }

    if (mod.exportedFunctions.length > 0) {
      lines.push('#### Exported Functions');
      lines.push('| Function | Signature | Returns | Description |');
      lines.push('|---|---|:---:|---|');
      for (const fn of mod.exportedFunctions) {
        const flag = fn.isAsync ? '`async` ' : '';
        lines.push(`| ${flag}\`${fn.name}()\` | \`${fn.name}(${fn.params})\` | \`${fn.returns}\` | ${fn.description} |`);
      }
      lines.push('');
    }
  }

  // 4. Framework Services & Public API Reference
  lines.push('---');
  lines.push('## 4. Framework Services & Public API Reference');
  lines.push('');
  lines.push('Services handle Git inspection, GitHub CLI queries, token telemetry calculations, Tailscale mesh networking, and Windows persistence.');
  lines.push('');

  for (const serv of serviceModules) {
    lines.push(`### \`${serv.relPath}\``);
    if (serv.topDoc) {
      lines.push(`> ${serv.topDoc}`);
      lines.push('');
    }

    for (const cls of serv.classes) {
      const extStr = cls.extendsName ? ` extends \`${cls.extendsName}\`` : '';
      lines.push(`#### Service Class: \`${cls.className}\`${extStr}`);
      lines.push(`${cls.description}`);
      lines.push('');
      if (cls.methods.length > 0) {
        lines.push('| Method | Signature | Returns | Description |');
        lines.push('|---|---|:---:|---|');
        for (const m of cls.methods) {
          const flag = (m.isStatic ? '`static` ' : '') + (m.isAsync ? '`async` ' : '');
          lines.push(`| ${flag}\`${m.name}()\` | \`${m.name}(${m.params})\` | \`${m.returns}\` | ${m.description} |`);
        }
        lines.push('');
      }
    }

    if (serv.exportedFunctions.length > 0) {
      lines.push('#### Exported Helper Functions');
      lines.push('| Function | Signature | Returns | Description |');
      lines.push('|---|---|:---:|---|');
      for (const fn of serv.exportedFunctions) {
        const flag = fn.isAsync ? '`async` ' : '';
        lines.push(`| ${flag}\`${fn.name}()\` | \`${fn.name}(${fn.params})\` | \`${fn.returns}\` | ${fn.description} |`);
      }
      lines.push('');
    }
  }

  // 5. Test Suite Mapping & Coverage
  lines.push('---');
  lines.push('## 5. Test Suite Mapping & Coverage');
  lines.push('');
  lines.push(`Total verified tests: **${testData.totalTests} tests** across **${testData.unit.length} unit test files** and **${testData.functional.length} functional integration test file**.`);
  lines.push('');
  lines.push('| Test Suite File | Type | Tests | Target Under Test (SUT) | Sample / Primary Assertion |');
  lines.push('|---|:---:|:---:|---|---|');

  const allTests = [...testData.unit, ...testData.functional].sort((a, b) => a.relPath.localeCompare(b.relPath));
  for (const t of allTests) {
    const targetsStr = t.targets.map(tgt => `\`${tgt}\``).join(', ') || 'Framework / System';
    lines.push(`| \`${t.relPath}\` | **${t.suiteType}** | ${t.testCount} | ${targetsStr} | ${t.sampleTest} |`);
  }
  lines.push('');

  // 6. Single-Line Repository File Responsibility Map
  lines.push('---');
  lines.push('## 6. Single-Line Repository File Responsibility Map');
  lines.push('');
  lines.push('A dense, token-saving lookup table mapping every file in the repository to its exact architectural responsibility:');
  lines.push('');

  // Group files by category
  const groups = [
    'Framework Runtime & Services',
    'Antigravity UI Mods',
    'Ecosystem Plugins',
    'Developer Tools & CLI Scripts',
    'Automation Scripts',
    'Technical Specifications & Documentation',
    'Test Suites & Verification',
    'Root Configuration & Architecture'
  ];

  for (const grp of groups) {
    const groupFiles = allFiles.filter(f => f.group === grp);
    if (groupFiles.length === 0) continue;

    lines.push(`### ${grp}`);
    for (const f of groupFiles) {
      lines.push(`- \`${f.relPath}\`: ${f.responsibility}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Main execution.
 */
function main() {
  console.log('⚡ Generating Antigravity Mods Architecture Catalog (MODS_CATALOG.md)...');
  const markdown = generateCatalogMarkdown();
  const outputPath = path.join(ROOT_DIR, 'MODS_CATALOG.md');

  fs.writeFileSync(outputPath, markdown, 'utf-8');
  console.log(`✅ Successfully generated ${outputPath}`);
  console.log(`   Size: ${(Buffer.byteLength(markdown, 'utf-8') / 1024).toFixed(1)} KB`);
}

main();
