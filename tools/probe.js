import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CdpPortResolver } from '../framework/core/CdpPortResolver.js';
import { CdpWebSocketClient } from '../framework/core/CdpWebSocketClient.js';
import { normalizeNativeModelCatalog } from '../mods/model-slots/components/ModelSlotsHtml.js';

/**
 * Diagnostic utility for live CDP probing, DOM hierarchy inspection,
 * and background daemon process tracking in Antigravity.
 */

/**
 * Inspects a DOM element, its bounding box, parent hierarchy, and app-region styling.
 * @param {string} [selector='.antigravity-mods-manager-btn']
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export async function inspectDom(selector = '.antigravity-mods-manager-btn', options = {}) {
  const resolver = options.portResolver || new CdpPortResolver();
  const port = await resolver.resolvePort();
  const client = options.cdpClient || new CdpWebSocketClient({ port });

  const expression = `
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) {
        return {
          found: false,
          selector: ${JSON.stringify(selector)},
          totalMatches: 0
        };
      }

      const allMatches = document.querySelectorAll(${JSON.stringify(selector)});
      const comp = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      const parents = [];
      let p = el.parentElement;
      while (p && parents.length < 5) {
        const ps = window.getComputedStyle(p);
        parents.push({
          tag: p.tagName.toLowerCase(),
          id: p.id || undefined,
          className: p.className || undefined,
          appRegion: ps.appRegion || ps.webkitAppRegion || 'none',
          display: ps.display
        });
        p = p.parentElement;
      }

      const children = Array.from(el.children).map(c => ({
        tag: c.tagName.toLowerCase(),
        id: c.id || undefined,
        className: c.className || undefined
      }));

      return {
        found: true,
        selector: ${JSON.stringify(selector)},
        totalMatches: allMatches.length,
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        className: el.className || undefined,
        appRegion: comp.appRegion || comp.webkitAppRegion || 'none',
        display: comp.display,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        parents,
        children
      };
    })()
  `;

  const res = await client.evaluate(expression);
  return res?.value || res;
}

/**
 * Inspects active Antigravity and framework daemon processes.
 * @returns {Array<{ pid: number, commandLine: string }>}
 */
export function inspectProcesses() {
  if (os.platform() !== 'win32') {
    try {
      const out = execSync('ps aux | grep -E "node|antigravity" | grep -v grep').toString();
      return out.split('\n').filter(Boolean).map(line => ({ commandLine: line }));
    } catch {
      return [];
    }
  }

  try {
    const cmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = \'node.exe\'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress"';
    const out = execSync(cmd).toString().trim();
    if (!out) return [];
    const parsed = JSON.parse(out);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
      .filter(p => p.CommandLine && (
        p.CommandLine.includes('daemon') ||
        p.CommandLine.includes('antigravity') ||
        p.CommandLine.includes('update_ui') ||
        p.CommandLine.includes('joyful')
      ))
      .map(p => ({
        pid: p.ProcessId,
        commandLine: p.CommandLine
      }));
  } catch {
    return [];
  }
}

/**
 * Checks CDP port discovery, connection probe, and returns target info.
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export async function inspectCdp(options = {}) {
  const resolver = options.portResolver || new CdpPortResolver();
  const port = await resolver.resolvePort();
  const isAlive = await resolver.probePort(port);

  let targets = [];
  if (isAlive) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        targets = await res.json();
      }
    } catch {}
  }

  return {
    port,
    isAlive,
    targetCount: targets.length,
    pageTarget: CdpWebSocketClient.findPageTarget(targets)?.title || null
  };
}

/**
 * Discovers live models and effort levels directly from Antigravity's native React model selector context.
 * Optionally persists the normalized catalog to ~/.gemini/config/mods/model_catalog.json.
 * @param {Object} [options]
 * @param {boolean} [options.sync=false] Persist discovered catalog to disk
 * @param {string} [options.catalogPath] Custom output path for model_catalog.json
 * @returns {Promise<Object>}
 */
export async function inspectModels(options = {}) {
  const resolver = options.portResolver || new CdpPortResolver();
  const port = await resolver.resolvePort();
  const client = options.cdpClient || new CdpWebSocketClient({ port });

  const expression = `
    (() => {
      const triggers = Array.from(document.querySelectorAll('button[data-testid="model-selector-trigger"]'));
      const activeTrigger = triggers[triggers.length - 1] || triggers[0];
      if (!activeTrigger) return { found: false, error: 'model-selector-trigger not found' };

      const reactKey = Object.keys(activeTrigger).find(k => k.startsWith('__reactFiber'));
      if (!reactKey) return { found: false, error: 'React fiber not found on trigger' };

      let cur = activeTrigger[reactKey];
      let depth = 0;
      let ctxValue = null;
      while (cur && depth < 35) {
        const val = cur.memoizedProps && cur.memoizedProps.value;
        if (val && Array.isArray(val.modelOptions) && val.modelOptions.length > 0) {
          ctxValue = val;
          break;
        }
        cur = cur.return;
        depth++;
      }

      if (!ctxValue) return { found: false, error: 'Native modelOptions context not found' };

      const modelOptions = ctxValue.modelOptions.map(m => ({
        modelId: m.modelId || m.id || '',
        label: m.label || m.name || '',
        value: m.value,
        disabled: Boolean(m.disabled),
        tagTitle: m.tagTitle || '',
        tagDescription: m.tagDescription || ''
      }));

      const groups = Array.isArray(ctxValue.groups)
        ? ctxValue.groups.map(g => ({
            groupName: g.groupName || '',
            options: Array.isArray(g.options)
              ? g.options.map(o => ({
                  modelId: o.modelId || o.id || '',
                  label: o.label || o.name || '',
                  value: o.value,
                  disabled: Boolean(o.disabled),
                  tagTitle: o.tagTitle || '',
                  tagDescription: o.tagDescription || ''
                }))
              : []
          }))
        : [];

      const effortIndex = {};
      const ei = ctxValue.effortIndex;
      if (ei && typeof ei === 'object') {
        const entries = (typeof Map === 'function' && ei instanceof Map)
          ? Array.from(ei.entries())
          : Object.entries(ei);
        for (const [baseKey, effList] of entries) {
          if (typeof Map === 'function' && effList instanceof Map) {
            effortIndex[baseKey] = Array.from(effList.entries()).map(([effKey, ev]) => ({
              effort: effKey,
              modelId: ev?.modelId || ev?.id || '',
              label: ev?.label || ev?.name || '',
              value: ev?.value,
              disabled: Boolean(ev?.disabled)
            }));
          } else if (Array.isArray(effList)) {
            effortIndex[baseKey] = effList.map(ev => ({
              effort: ev?.effort || ev?.effortLabel || '',
              modelId: ev?.modelId || ev?.id || '',
              label: ev?.label || ev?.name || '',
              value: ev?.value,
              disabled: Boolean(ev?.disabled)
            }));
          }
        }
      }

      return {
        found: true,
        activeTriggerText: (activeTrigger.textContent || '').trim(),
        modelOptions,
        effortIndex,
        groups
      };
    })()
  `;

  const res = await client.evaluate(expression);
  const raw = res?.value || res;
  if (!raw || !raw.found) {
    return {
      found: false,
      error: raw?.error || 'Failed to read native model catalog'
    };
  }

  const normalized = normalizeNativeModelCatalog(raw.modelOptions, raw.effortIndex, raw.groups);
  const catalogPayload = {
    source: 'native-react-context',
    activeTriggerText: raw.activeTriggerText || '',
    ...normalized,
    updatedAt: Date.now()
  };

  if (options.sync) {
    const targetPath = options.catalogPath || path.join(os.homedir(), '.gemini', 'config', 'mods', 'model_catalog.json');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tmpPath = `${targetPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    fs.writeFileSync(tmpPath, JSON.stringify(catalogPayload, null, 2), 'utf-8');
    fs.renameSync(tmpPath, targetPath);
    catalogPayload.syncedTo = targetPath;
  }

  return {
    found: true,
    ...catalogPayload
  };
}

/**
 * Evaluates arbitrary expression inside Antigravity Electron page.
 * @param {string} code
 * @param {Object} [options]
 * @returns {Promise<any>}
 */
export async function evaluateCode(code, options = {}) {
  const resolver = options.portResolver || new CdpPortResolver();
  const port = await resolver.resolvePort();
  const client = options.cdpClient || new CdpWebSocketClient({ port });
  return await client.evaluate(code);
}

// CLI Execution Router
async function runCli() {
  const [,, cmd, ...args] = process.argv;

  switch (cmd) {
    case 'dom': {
      const selector = args[0] || '.antigravity-mods-manager-btn';
      console.log(`🔍 Probing DOM element: "${selector}"...`);
      const info = await inspectDom(selector);
      console.log(JSON.stringify(info, null, 2));
      break;
    }
    case 'proc':
    case 'processes': {
      console.log('🔍 Probing background daemon and mod processes...');
      const procs = inspectProcesses();
      console.log(JSON.stringify(procs, null, 2));
      break;
    }
    case 'cdp': {
      console.log('🔍 Probing Antigravity CDP endpoint...');
      const status = await inspectCdp();
      console.log(JSON.stringify(status, null, 2));
      break;
    }
    case 'models': {
      const shouldSync = args.includes('--sync');
      const result = await inspectModels({ sync: shouldSync });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case 'eval': {
      const code = args.join(' ');
      if (!code) {
        console.error('Error: specify code to evaluate. Example: node tools/probe.js eval "document.title"');
        process.exit(1);
      }
      console.log(`⚡ Evaluating expression in Antigravity: ${code}`);
      const result = await evaluateCode(code);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    default: {
      console.log(`
Antigravity Live Probing & Diagnostic Tool
===========================================
Usage:
  node tools/probe.js <command> [arguments]

Commands:
  dom [selector]     Inspect DOM element, rect dimensions, and appRegion hierarchy
  processes          List running background daemon and Node.js tasks
  cdp                Test CDP port discovery, connection probe, and page targets
  eval "<code>"      Evaluate arbitrary JavaScript directly inside Antigravity Electron

Examples:
  npm run probe:dom
  node tools/probe.js dom ".antigravity-tachometer-badge"
  node tools/probe.js dom "#antigravity-mods-manager-trigger"
  npm run probe:proc
  npm run probe:cdp
      `.trim());
    }
  }
}

const isDirectExecution = process.argv[1] && process.argv[1].endsWith('probe.js');
if (isDirectExecution) {
  runCli().catch(err => {
    console.error('❌ Probe failed:', err.message);
    process.exit(1);
  });
}
