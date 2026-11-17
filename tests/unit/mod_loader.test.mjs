import test from 'node:test';
import assert from 'node:assert/strict';
import { ModLoader } from '../../framework/core/ModLoader.js';
import { AntigravityMod } from '../../framework/sdk/AntigravityMod.js';

class MockMod extends AntigravityMod {
  constructor(manifest, renderOutput) {
    super(manifest);
    this.renderOutput = renderOutput || { html: `<div id="${manifest.id}">Content</div>` };
  }
  render(context) {
    return this.renderOutput;
  }
}

test('ModLoader - registers mods and respects priority order', () => {
  const loader = new ModLoader();
  const modLow = new MockMod({
    id: 'mod-low',
    name: 'Low Priority',
    version: '1.0.0',
    slot: 'header-actions',
    priority: 5
  });

  const modHigh = new MockMod({
    id: 'mod-high',
    name: 'High Priority',
    version: '1.0.0',
    slot: 'header-actions',
    priority: 100
  });

  loader.register(modLow);
  loader.register(modHigh);

  const mods = loader.getRegisteredMods();
  assert.equal(mods.length, 2);
  assert.equal(mods[0].manifest.id, 'mod-high');
  assert.equal(mods[1].manifest.id, 'mod-low');
});

test('ModLoader - prevents duplicate mod id registration', () => {
  const loader = new ModLoader();
  const modA = new MockMod({
    id: 'duplicate-id',
    name: 'Mod A',
    version: '1.0.0',
    slot: 'header-actions'
  });
  const modB = new MockMod({
    id: 'duplicate-id',
    name: 'Mod B',
    version: '1.1.0',
    slot: 'header-right'
  });

  loader.register(modA);
  assert.throws(() => loader.register(modB), /Mod with ID "duplicate-id" is already registered/);
});

test('ModLoader - generates consolidated injection script for registered mods', () => {
  const loader = new ModLoader();
  loader.register(new MockMod(
    {
      id: 'clock-mod',
      name: 'Clock',
      version: '1.0.0',
      slot: 'header-right'
    },
    {
      html: '<span>12:00</span>',
      css: '.time { color: green; }'
    }
  ));

  const script = loader.buildInjectionPayload({});
  assert.ok(script.includes('window.__antigravityMods'));
  assert.ok(script.includes('clock-mod'));
  assert.ok(script.includes('<span>12:00</span>'));
  assert.ok(script.includes('#antigravity-mod-clock-mod .time { color: green; }'));
});

test('ModLoader - generates click toggle handlers and excludes hover listeners', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  assert.ok(script.includes('window.__toggleTachometerPopover'));
  assert.ok(script.includes('__tachClickBound'));
  assert.ok(!script.includes("badge.addEventListener('mouseenter'"));
  assert.ok(!script.includes("badge.addEventListener('mouseleave'"));
});

test('ModLoader - generates mods manager panel and visibility synchronization logic', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  assert.ok(script.includes('window.__toggleModsManagerPanel'));
  assert.ok(script.includes('window.__applyModsVisibility'));
  assert.ok(script.includes('__modsClickBound'));
  assert.ok(script.includes('antigravity-mods-manager-portal'));
  assert.ok(script.includes('__antigravity_daemon_enabled'));
  assert.ok(script.includes('mod-toggle-git-graph'));
  assert.ok(script.includes('#antigravity-git-tab-trigger'));
  assert.ok(script.includes('mod-toggle-compact-chatbox'));
  assert.ok(script.includes('__applyChatboxModsCompact'));
  assert.ok(script.includes('__antigravity_compact_chatbox_mods'));
});

test('ModLoader - mutation observer traverses parent to prevent self-closest infinite loop', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  assert.ok(script.includes('parent.closest'), 'Must traverse from parentElement');
  assert.ok(!script.includes('btn.closest'), 'Must not call btn.closest directly');
});

test('ModLoader - generates agent tab switcher and catalog toggle functions', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  assert.ok(script.includes('window.__switchAgentTab'));
  assert.ok(script.includes('window.__toggleAgentCatalog'));
  assert.ok(script.includes('.agent-tab-btn'));
  assert.ok(script.includes('.agent-tab-content'));
  assert.ok(script.includes('antigravity-agent-catalog-drawer'));
});




test('ModLoader - exposes window.__antigravityMountAll in client script', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});
  assert.ok(script.includes('window.__antigravityMountAll = mountAllMods;'));
});

test('ModLoader - includes context-driven auto mode classifier and direct badge persistence', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  assert.ok(script.includes('window.__resolveCascadeId'));
  assert.ok(script.includes('window.__classifyPromptMode'));
  assert.ok(script.includes('window.__resolveAgentForCascade'));
  assert.ok(script.includes('window.__syncAgentBadges'));
  assert.ok(script.includes('window.__handleAutoPromptContextUpdate'));
  assert.ok(script.includes('auto-state-build'));
  assert.ok(script.includes('auto-state-plan'));
});

test('ModLoader - generates CI/CD accordion trigger, explicit close handler, and VCS refresh handler in Git panel', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  assert.ok(script.includes('#antigravity-git-ci-rollup-trigger'));
  assert.ok(script.includes('#antigravity-git-ci-accordion'));
  assert.ok(script.includes('/vcs/overview'));
  assert.ok(script.includes('window.__closeGitGraphPanel()'));
  assert.ok(script.includes('window.__toggleGitGraphPanel'));
});


test('ModLoader - compiles valid executable JavaScript syntax without SyntaxError when GitGraphMod is registered', async () => {
  const { GitGraphMod } = await import('../../mods/git-graph/index.js');
  const loader = new ModLoader();
  loader.register(new GitGraphMod({
    initialContext: {
      activeRepo: 'NezerkC/mods-antigravity2.0',
      status: { branch: 'feat/mods-vcs-git-github-cicd', isClean: false, ahead: 2, behind: 1 },
      github: { isGitHub: true, fullName: 'NezerkC/mods-antigravity2.0', webUrl: 'https://github.com/NezerkC/mods-antigravity2.0' },
      branches: {
        local: [
          { name: 'main', isCurrent: false, isTrunk: true, cluster: 'trunk', ahead: 0, behind: 1, hash: '509b6b3' },
          { name: 'feat/mods-vcs-git-github-cicd', isCurrent: true, cluster: 'vcs', ahead: 2, behind: 0, dirtyFiles: 1, hash: '65bf3bb' }
        ],
        remote: [{ name: 'origin/main', shortName: 'main', hash: '509b6b3' }]
      },
      commits: [
        {
          hash: '65bf3bb020e50b06a6517380143129d92adf4329',
          shortHash: '65bf3bb',
          lane: 1,
          pushed: false,
          isTrunk: false,
          parents: ['509b6b3'],
          routes: [
            { fromLane: 0, toLane: 0, type: 'straight', colorLane: 0 },
            { fromLane: 1, toLane: 0, type: 'branch-join', colorLane: 1 }
          ],
          author: { name: 'Victor', email: 'victor@test.com', avatarUrl: '' },
          subject: 'feat(vcs): implement inline inspection capsule',
          relativeDate: '2m ago',
          refs: ['HEAD -> feat/mods-vcs-git-github-cicd'],
          files: [{ status: 'M', path: 'mods/git-graph/index.js', fileName: 'index.js', dir: 'mods/git-graph', ext: 'JS' }]
        },
        {
          hash: '509b6b3',
          shortHash: '509b6b3',
          lane: 0,
          pushed: true,
          isTrunk: true,
          parents: [],
          routes: [],
          author: { name: 'Victor', email: 'victor@test.com', avatarUrl: '' },
          subject: 'Merge pull request #32',
          relativeDate: '1h ago',
          refs: ['origin/main', 'main'],
          files: []
        }
      ]
    }
  }));

  const script = loader.buildInjectionPayload({});

  // Must parse and compile in V8 with zero SyntaxError (catches duplicate const declarations or broken quotes)
  assert.doesNotThrow(() => new Function(script), 'Generated client injection payload must be valid JS without SyntaxError');

  assert.ok(script.includes('window.__antigravityRenderGitSvg'));
  assert.ok(script.includes('window.__antigravityUpdateVcsData'));
  assert.ok(script.includes('window.__antigravityRunVcsAction'));
  assert.ok(script.includes('window.__antigravityProjectFilteredCommits'));
  assert.ok(!script.includes('.git-pill-files'));
});

test('ModLoader - injection script unlocks Antigravity 2.29 native voice mode and flag overrides', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  assert.ok(script.includes('/voice/health'));
  assert.ok(script.includes('enable-voice-relay'));
  assert.ok(script.includes('127.0.0.1:8765'));
  assert.ok(script.includes('jetski.developer.customFlagOverrides'));
});

test('ModLoader - injection script includes window.__toggleVoiceAssistant and localStorage sync', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  assert.ok(script.includes('window.__toggleVoiceAssistant'));
  assert.ok(script.includes('window.__syncVoiceAssistantButton'));
  assert.ok(script.includes('__antigravity_voice_assistant_enabled'));
  assert.ok(script.includes('data-mod-action="toggle-voice"'));
  assert.ok(script.includes('#antigravity-voice-assistant-btn'));
});

test('ModLoader - includes RDP and window minimize zero-dimension guards, recovery listener, and voice conditioning', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  assert.ok(script.includes('document.hidden || window.innerWidth <= 0'));
  assert.ok(script.includes('document.hidden || window.innerWidth <= 0 || footerWidth <= 0'));
  assert.ok(script.includes('if (width <= 0) continue;'));
  assert.ok(script.includes('window.__antigravityRdpRecoveryBound'));
  assert.ok(script.includes("document.addEventListener('visibilitychange'"));
  assert.ok(script.includes("window.addEventListener('focus'"));
  assert.ok(script.includes("window.addEventListener('resize'"));
  assert.ok(script.includes('window.__conditionAgentFromVoice'));
  assert.ok(script.includes('window.__scanVoiceTranscriptsForAgent'));
});

test('ModLoader - preserves badge state during RDP/minimize zero dimensions and recovers on visibilitychange/focus/resize', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({
    activeAgents: {
      'chat-1': { id: 'auto', name: 'Auto', color: '#38bdf8', effectiveMode: 'PLAN' }
    }
  });

  const makeClassList = (initial = []) => {
    const set = new Set(initial);
    return {
      add: (...cls) => cls.forEach(c => set.add(c)),
      remove: (...cls) => cls.forEach(c => set.delete(c)),
      toggle: (c, force) => {
        const shouldAdd = force !== undefined ? !!force : !set.has(c);
        if (shouldAdd) set.add(c);
        else set.delete(c);
        return shouldAdd;
      },
      contains: (c) => set.has(c)
    };
  };

  const tachBadge = {
    classList: makeClassList(),
    attributes: {},
    style: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k] ?? null; },
    removeAttribute(k) { delete this.attributes[k]; },
    addEventListener() {},
    closest(sel) {
      if (sel === '[data-cascade-id]') return cascadeContainer;
      return footerEl;
    },
    querySelector() { return null; }
  };

  const agentLabel = {
    textContent: 'Auto',
    innerHTML: '<span class="auto-oscillate-track"></span>',
    querySelector(sel) {
      return sel === '.auto-oscillate-track' && this.innerHTML.includes('auto-oscillate-track') ? {} : null;
    }
  };

  const agentBadge = {
    classList: makeClassList(),
    attributes: { 'data-agent-id': 'auto', 'data-effective-mode': 'PLAN' },
    style: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k] ?? null; },
    removeAttribute(k) { delete this.attributes[k]; },
    addEventListener() {},
    closest(sel) {
      if (sel === '[data-cascade-id]') return cascadeContainer;
      return footerEl;
    },
    querySelector(sel) {
      if (sel === '.antigravity-active-agent-name') return agentLabel;
      return null;
    }
  };

  const footerEl = {
    offsetWidth: 680,
    getBoundingClientRect() { return { width: this.offsetWidth }; },
    querySelector(sel) {
      if (sel.includes('tachometer-badge')) return tachBadge;
      if (sel.includes('agent-badge')) return agentBadge;
      return null;
    }
  };

  const slotContainer = {
    parentElement: footerEl,
    classList: makeClassList(['antigravity-slot-container']),
    closest() { return footerEl; },
    querySelector(sel) {
      if (sel.includes('tachometer-badge')) return tachBadge;
      if (sel.includes('agent-badge')) return agentBadge;
      return null;
    }
  };

  const cascadeContainer = {
    getAttribute(k) { return k === 'data-cascade-id' ? 'chat-1' : null; },
    querySelector(sel) {
      if (sel.includes('agent-badge')) return agentBadge;
      return null;
    }
  };

  const voiceTranscriptEl = {
    textContent: 'implementa y corrige el bug en ModLoader',
    getAttribute() { return null; },
    closest(sel) { return sel === '[data-cascade-id]' ? cascadeContainer : null; }
  };

  const docListeners = {};
  const winListeners = {};
  let resizeCallback = null;
  let storage = {};

  const mockDocument = {
    hidden: false,
    head: { appendChild() {} },
    body: { appendChild() {} },
    getElementById() { return null; },
    createElement() {
      return {
        style: {},
        classList: makeClassList(),
        setAttribute() {},
        getAttribute() { return '2'; },
        querySelector() { return null; },
        querySelectorAll() { return []; }
      };
    },
    addEventListener(type, fn) {
      docListeners[type] = docListeners[type] || [];
      docListeners[type].push(fn);
    },
    querySelector(sel) {
      if (sel.includes('agent-badge')) return agentBadge;
      if (sel.includes('tachometer-badge')) return tachBadge;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.antigravity-slot-container') return [slotContainer];
      if (sel === '.antigravity-tachometer-badge') return [tachBadge];
      if (sel === '.antigravity-agent-badge') return [agentBadge];
      if (sel.includes('data-voice-transcript')) return [voiceTranscriptEl];
      return [];
    }
  };

  const mockWindow = {
    innerWidth: 1280,
    innerHeight: 800,
    location: { pathname: '/c/chat-1', search: '' },
    addEventListener(type, fn) {
      winListeners[type] = winListeners[type] || [];
      winListeners[type].push(fn);
    }
  };

  const mockLocalStorage = {
    getItem(k) { return storage[k] ?? null; },
    setItem(k, v) { storage[k] = String(v); }
  };

  class MockResizeObserver {
    constructor(cb) { resizeCallback = cb; }
    observe() {}
    disconnect() {}
  }

  class MockMutationObserver {
    constructor(cb) { this.cb = cb; }
    observe() {}
    disconnect() {}
  }

  const runner = new Function(
    'window',
    'document',
    'localStorage',
    'ResizeObserver',
    'MutationObserver',
    script
  );
  runner(mockWindow, mockDocument, mockLocalStorage, MockResizeObserver, MockMutationObserver);

  // 1. Initial wide layout: neither badge is forced into compact mode
  assert.equal(tachBadge.classList.contains('compact'), false);
  assert.equal(agentBadge.classList.contains('compact'), false);
  assert.equal(mockWindow.__antigravityRdpRecoveryBound, true);

  // 2. Simulate RDP disconnect / window minimize: zero dimensions & hidden document
  mockDocument.hidden = true;
  mockWindow.innerWidth = 0;
  footerEl.offsetWidth = 0;

  mockWindow.__antigravityMountAll();
  resizeCallback([{ target: slotContainer, contentRect: { width: 0 } }]);
  mockWindow.__applyChatboxModsCompact();

  assert.equal(tachBadge.classList.contains('compact'), false, 'Tachometer must not collapse to compact when minimized/RDP');
  assert.equal(agentBadge.classList.contains('compact'), false, 'Agent badge must not collapse to compact when minimized/RDP');

  // Even if document.hidden is false transiently during RDP resize while container width is 0
  mockDocument.hidden = false;
  mockWindow.innerWidth = 1280;
  footerEl.offsetWidth = 0;
  resizeCallback([{ target: slotContainer, contentRect: { width: 0 } }]);
  assert.equal(tachBadge.classList.contains('compact'), false, 'Zero contentRect width must be ignored');

  // 3. Simulate desync during minimize and recovery when window restores
  agentBadge.setAttribute('data-agent-id', 'default');
  footerEl.offsetWidth = 680;
  let mountCallCount = 0;
  const origMount = mockWindow.__antigravityMountAll;
  mockWindow.__antigravityMountAll = () => {
    mountCallCount++;
    origMount();
  };

  for (const fn of (docListeners.visibilitychange || [])) fn();
  assert.ok(mountCallCount >= 1, 'visibilitychange recovery must invoke mountAllMods');
  assert.equal(agentBadge.getAttribute('data-agent-id'), 'auto', 'Agent badge must resync after RDP recovery');

  // 4. Verify voice transcript conditioning updates active auto agent mode to BUILD
  mockWindow.__scanVoiceTranscriptsForAgent();
  assert.equal(agentBadge.getAttribute('data-effective-mode'), 'BUILD');
  assert.equal(agentBadge.classList.contains('auto-state-build'), true);
});

test('ModLoader - generates chatbox compact handler supporting explicit normal setting and hysteresis in ResizeObserver', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  assert.ok(script.includes('window.__applyChatboxModsCompact'));
  assert.ok(script.includes("compactSetting === 'false' ? false : isNarrow"));
  assert.ok(script.includes('threshold = isCurrentlyCompact ? 590 : 540'));
  assert.ok(script.includes('window.__renderReticleSvg(isFocus, 14)'));
  assert.ok(script.includes('.min-w-0:not(.flex) > #antigravity-slot-header-actions'));
  assert.ok(script.includes('#antigravity-slot-aux-pane-tab'));
  assert.ok(script.includes('#antigravity-slot-menubar-actions'));
  assert.ok(script.includes('window.__antigravityIsMountingMods'));
});

test('ModLoader - compacts chatbox mods in narrow footers, preserves hysteresis, and ignores self-mutations', async () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  const makeClassList = (initial = []) => {
    const set = new Set(initial);
    return {
      add(c) { set.add(c); },
      remove(c) { set.delete(c); },
      contains(c) { return set.has(c); },
      toggle(c, force) {
        if (typeof force === 'boolean') {
          if (force) set.add(c);
          else set.delete(c);
          return force;
        }
        if (set.has(c)) { set.delete(c); return false; }
        set.add(c); return true;
      }
    };
  };

  let slotRemovedCount = 0;
  const tachBadge = {
    classList: makeClassList(['antigravity-tachometer-badge']),
    style: {},
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute() { return null; },
    closest() { return null; },
    querySelector() { return null; }
  };
  const agentBadge = {
    classList: makeClassList(['antigravity-agent-badge']),
    style: {},
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute() { return null; },
    closest() { return null; },
    querySelector() { return null; }
  };
  const footerEl = {
    offsetWidth: 500,
    getBoundingClientRect() { return { width: this.offsetWidth }; },
    querySelector(sel) {
      if (sel.includes('tachometer-badge')) return tachBadge;
      if (sel.includes('agent-badge')) return agentBadge;
      if (sel.includes('antigravity-slot-container')) return slotContainer;
      return null;
    }
  };
  const flexRow = {
    className: 'flex items-center gap-1 min-w-0',
    parentElement: footerEl
  };
  const slotContainer = {
    id: 'antigravity-slot-header-actions',
    parentElement: flexRow,
    classList: makeClassList(['antigravity-slot-container']),
    remove() { slotRemovedCount++; },
    closest(sel) {
      if (sel?.includes('input-footer') || sel?.includes('justify-between')) return footerEl;
      return null;
    },
    querySelector(sel) {
      if (sel.includes('tachometer-badge')) return tachBadge;
      if (sel.includes('agent-badge')) return agentBadge;
      return null;
    }
  };

  let storage = {};
  let resizeCallback = null;
  let mutationCallback = null;
  let cleanupSelectorCalls = 0;

  const mockDocument = {
    hidden: false,
    head: { appendChild() {} },
    body: { appendChild() {} },
    getElementById() { return null; },
    createElement() {
      return { style: {}, classList: makeClassList(), setAttribute() {}, getAttribute() { return '2'; }, querySelector() { return null; }, querySelectorAll() { return []; } };
    },
    addEventListener() {},
    querySelector(sel) {
      if (sel.includes('agent-badge')) return agentBadge;
      if (sel.includes('tachometer-badge')) return tachBadge;
      return null;
    },
    querySelectorAll(sel) {
      if (sel.includes('.min-w-0:not(.flex)')) {
        cleanupSelectorCalls++;
        return [];
      }
      if (sel === '#antigravity-slot-header-actions, .antigravity-slot-header-actions') return [slotContainer];
      if (sel === '.antigravity-slot-container') return [slotContainer];
      if (sel === '.antigravity-tachometer-badge') return [tachBadge];
      if (sel === '.antigravity-agent-badge') return [agentBadge];
      return [];
    }
  };

  const mockWindow = {
    innerWidth: 1440,
    innerHeight: 900,
    location: { pathname: '/c/chat-2', search: '' },
    addEventListener() {}
  };
  const mockLocalStorage = {
    getItem(k) { return storage[k] ?? null; },
    setItem(k, v) { storage[k] = String(v); }
  };

  class MockResizeObserver {
    constructor(cb) { resizeCallback = cb; }
    observe() {}
    disconnect() {}
  }
  class MockMutationObserver {
    constructor(cb) { mutationCallback = cb; }
    observe() {}
    disconnect() {}
  }

  const runner = new Function('window', 'document', 'localStorage', 'ResizeObserver', 'MutationObserver', script);
  runner(mockWindow, mockDocument, mockLocalStorage, MockResizeObserver, MockMutationObserver);

  // 500px chatbox collapses even on wide 1440px window and preserves flex slot container
  assert.ok(cleanupSelectorCalls >= 1, 'Cleanup query must exclude .flex parent containers');
  assert.equal(slotRemovedCount, 0, 'Valid .flex.min-w-0 slot container must never be removed');
  assert.equal(tachBadge.classList.contains('compact'), true);
  assert.equal(agentBadge.classList.contains('compact'), true);

  // Hysteresis band (560px): remains compact until >= 590px
  footerEl.offsetWidth = 560;
  resizeCallback([{ target: footerEl, contentRect: { width: 560 } }]);
  assert.equal(tachBadge.classList.contains('compact'), true);

  // Expanding to 610px restores labels
  footerEl.offsetWidth = 610;
  resizeCallback([{ target: footerEl, contentRect: { width: 610 } }]);
  assert.equal(tachBadge.classList.contains('compact'), false);
  assert.equal(agentBadge.classList.contains('compact'), false);

  // Explicit Normal override prevents compaction at 500px
  storage.__antigravity_compact_chatbox_mods = 'false';
  footerEl.offsetWidth = 500;
  resizeCallback([{ target: footerEl, contentRect: { width: 500 } }]);
  assert.equal(tachBadge.classList.contains('compact'), false);
  assert.equal(agentBadge.classList.contains('compact'), false);

  // Self-mutation inside #antigravity-slot-header-actions must not schedule remount debounce
  let dockSyncCalls = 0;
  mockWindow.__dockNativeVoiceToast = () => { dockSyncCalls++; };
  mutationCallback([{
    target: {
      nodeType: 1,
      id: 'antigravity-mod-agent-selector',
      classList: makeClassList(),
      closest(s) { return s.includes('[id^="antigravity-"]') ? this : null; }
    },
    removedNodes: []
  }]);
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(dockSyncCalls, 0, 'Self-mutations inside mod nodes must be ignored by MutationObserver');
});

test('ModLoader - closes Git Graph reliably without tab trigger, blocks stale fetch reopen, and prevents stub/filter flicker', async () => {
  const { GitGraphMod } = await import('../../mods/git-graph/index.js');
  const loader = new ModLoader();
  loader.register(new GitGraphMod());

  const stubData = {
    activeRepo: 'my-repo',
    status: { branch: '', isClean: true, ahead: 0, behind: 0 },
    github: { isGitHub: false },
    branches: { local: [], remote: [] },
    commits: []
  };
  const ghData = {
    repoPath: 'C:/work/my-repo',
    activeRepo: 'my-repo',
    status: { branch: 'main', isClean: true, ahead: 1, behind: 0 },
    github: { isGitHub: true, fullName: 'org/my-repo', webUrl: 'https://github.com/org/my-repo' },
    branches: {
      local: [{ name: 'main', isCurrent: true, hash: 'aaa1111' }],
      remote: [{ name: 'origin/main', shortName: 'main', hash: 'bbb2222' }]
    },
    commits: [
      { hash: 'aaa1111', shortHash: 'aaa1111', lane: 0, pushed: false, isTrunk: true, parents: ['bbb2222'], routes: [], author: { name: 'A', email: 'a@b.c' }, subject: 'local commit', refs: ['HEAD -> main'], files: [] },
      { hash: 'bbb2222', shortHash: 'bbb2222', lane: 0, pushed: true, isTrunk: true, parents: [], routes: [], author: { name: 'A', email: 'a@b.c' }, subject: 'gh commit', refs: ['origin/main'], files: [] }
    ]
  };
  const ghDataUpdated = {
    ...ghData,
    status: { branch: 'main', isClean: true, ahead: 2, behind: 0 },
    commits: [
      ...ghData.commits,
      { hash: 'ccc3333', shortHash: 'ccc3333', lane: 0, pushed: true, isTrunk: true, parents: [], routes: [], author: { name: 'A', email: 'a@b.c' }, subject: 'older gh commit', refs: [], files: [] }
    ]
  };

  function makeClassList(initial = []) {
    const s = new Set(initial);
    return {
      add: (...cs) => cs.forEach(c => s.add(c)),
      remove: (...cs) => cs.forEach(c => s.delete(c)),
      toggle: (c, force) => (force === undefined ? (s.has(c) ? (s.delete(c), false) : (s.add(c), true)) : (force ? (s.add(c), true) : (s.delete(c), false))),
      contains: (c) => s.has(c)
    };
  }

  let triggerInDom = true;
  const triggerBtn = {
    id: 'antigravity-git-tab-trigger',
    classList: makeClassList(['antigravity-git-tab-btn']),
    style: {},
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener() {},
    closest() { return null; }
  };

  const closeBtn = { id: 'antigravity-git-close-btn', onclick: null };
  const pillAll = { attrs: { 'data-branch-filter': 'all' }, classList: makeClassList(['git-filter-pill', 'active']), getAttribute(k) { return this.attrs[k] ?? null; }, onclick: null };
  const pillLocal = { attrs: { 'data-branch-filter': 'local' }, classList: makeClassList(['git-filter-pill']), getAttribute(k) { return this.attrs[k] ?? null; }, onclick: null };
  const pillRemote = { attrs: { 'data-branch-filter': 'remote' }, classList: makeClassList(['git-filter-pill']), getAttribute(k) { return this.attrs[k] ?? null; }, onclick: null };
  const commitItemLocal = { attrs: { 'data-commit-type': 'local' }, style: {}, getAttribute(k) { return this.attrs[k] ?? null; } };
  const commitItemRemote = { attrs: { 'data-commit-type': 'remote' }, style: {}, getAttribute(k) { return this.attrs[k] ?? null; } };
  const graphContainer = { scrollTop: 0 };
  const svgCol = { innerHTML: '' };
  const stateScript = { textContent: JSON.stringify(stubData) };

  const tpl = {
    id: 'antigravity-git-panel-template',
    innerHTML: 'stub-html',
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] ?? null; }
  };

  let hostInnerWrites = 0;
  let hostEl = null;
  function makeHostEl() {
    let _html = '';
    const el = {
      id: 'antigravity-git-panel-host',
      style: { display: 'none', cssText: '' },
      attrs: {},
      children: [],
      parentElement: null,
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] ?? null; },
      remove() {},
      get innerHTML() { return _html; },
      set innerHTML(val) {
        hostInnerWrites++;
        _html = val;
        el.children = val ? [{}] : [];
      },
      querySelector(sel) {
        if (sel === '#antigravity-git-vcs-state') return stateScript;
        if (sel === '#antigravity-git-close-btn') return closeBtn;
        if (sel === '.git-filter-pill.active') return [pillAll, pillLocal, pillRemote].find(p => p.classList.contains('active')) || null;
        if (sel === '#antigravity-git-svg-column' || sel === '.git-svg-column') return svgCol;
        if (sel === '.git-graph-container') return graphContainer;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === '.git-filter-pill') return [pillAll, pillLocal, pillRemote];
        if (sel === '.git-commit-item') return [commitItemLocal, commitItemRemote];
        return [];
      }
    };
    return el;
  }

  const keyListeners = [];
  const docBody = { appendChild(el) { el.parentElement = docBody; } };
  const mockDocument = {
    head: { appendChild() {} },
    body: docBody,
    hidden: false,
    addEventListener(ev, fn) { if (ev === 'keydown') keyListeners.push(fn); },
    createElement(tag) {
      return { id: '', style: {}, classList: makeClassList(), attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; } };
    },
    getElementById(id) {
      if (id === 'antigravity-git-panel-host') return hostEl;
      if (id === 'antigravity-git-panel-template') return tpl;
      return null;
    },
    querySelector(sel) {
      if (sel === '#antigravity-git-tab-trigger') return triggerInDom ? triggerBtn : null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '#antigravity-git-panel-host') return hostEl ? [hostEl] : [];
      if (sel === '#antigravity-git-tab-trigger' || sel === '#antigravity-git-tab-trigger, .antigravity-git-tab-btn') {
        return triggerInDom ? [triggerBtn] : [];
      }
      return [];
    }
  };
  mockDocument.createElement = (tag) => {
    const created = { id: '', style: {}, classList: makeClassList(), attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, querySelector: (...a) => makeHostEl().querySelector(...a), querySelectorAll: (...a) => makeHostEl().querySelectorAll(...a) };
    if (tag === 'div' && !hostEl) {
      hostEl = makeHostEl();
      return hostEl;
    }
    return created;
  };

  let resolveFetch = null;
  const requestedUrls = [];
  const mockWindow = {
    innerWidth: 1440,
    innerHeight: 900,
    location: { pathname: '/c/git-test', search: '' },
    addEventListener() {}
  };
  const origFetch = globalThis.fetch;
  globalThis.fetch = (url) => {
    requestedUrls.push(String(url));
    return new Promise((res) => { resolveFetch = res; });
  };

  try {
    const script = loader.buildInjectionPayload({ repoPath: 'C:/work/my-repo' });
    const runner = new Function('window', 'document', 'localStorage', 'ResizeObserver', 'MutationObserver', script);
    runner(
      mockWindow,
      mockDocument,
      { getItem() { return null; }, setItem() {} },
      class { observe() {} disconnect() {} },
      class { observe() {} disconnect() {} }
    );

    // 1. Open panel; should pass repoPath query param and start fetch
    mockWindow.__toggleGitGraphPanel(null, triggerBtn);
    assert.equal(hostEl.style.display, 'flex');
    assert.equal(hostEl.getAttribute('data-open'), 'true');
    assert.equal(triggerBtn.classList.contains('active'), true);
    assert.ok(requestedUrls.some(u => u.includes('/vcs/overview?repoPath=')), 'Fetch must pass active repoPath');

    // 2. Close BEFORE in-flight fetch resolves -> resolving fetch must NOT mutate or reopen panel
    const staleResolve = resolveFetch;
    closeBtn.onclick({ stopPropagation() {}, preventDefault() {} });
    assert.equal(hostEl.style.display, 'none');
    assert.equal(hostEl.getAttribute('data-open'), 'false');
    assert.equal(triggerBtn.classList.contains('active'), false);
    staleResolve({ ok: true, async json() { return ghData; } });
    await new Promise(r => setTimeout(r, 10));
    assert.equal(hostEl.style.display, 'none', 'Stale in-flight fetch must never reopen closed panel');

    // 3. Reopen, hydrate with GitHub data, select 'remote' filter pill
    mockWindow.__toggleGitGraphPanel(null, triggerBtn);
    resolveFetch({ ok: true, async json() { return ghData; } });
    await new Promise(r => setTimeout(r, 10));
    assert.equal(hostEl.style.display, 'flex');
    assert.equal(mockWindow.__antigravityVcsData.github.isGitHub, true);
    pillRemote.onclick({ stopPropagation() {} });
    assert.equal(pillRemote.classList.contains('active'), true);
    assert.equal(commitItemLocal.style.display, 'none');
    assert.equal(commitItemRemote.style.display, '');

    // 4. mountAllMods with unchanged signature + stub template must cause ZERO flicker/rewrite and NOT downgrade GH -> local
    const writesBeforeMount = hostInnerWrites;
    tpl.innerHTML = 'stub-template-overwrite';
    mockWindow.__antigravityMountAll();
    assert.equal(hostInnerWrites, writesBeforeMount, 'mountAllMods must not rewrite open hydrated Git panel');
    assert.equal(mockWindow.__antigravityVcsData.github.isGitHub, true, 'Hydrated GH data must not be overwritten by stub');

    // 5. Real update must preserve active 'remote' filter pill instead of flickering back to 'all'
    mockWindow.__antigravityUpdateVcsData(ghDataUpdated);
    assert.equal(hostInnerWrites, writesBeforeMount + 1);
    assert.equal(pillRemote.classList.contains('active'), true, 'Update must preserve selected GitHub filter pill');
    assert.equal(commitItemLocal.style.display, 'none');

    // 6. Close button works even if tab trigger vanished or lost .active
    triggerInDom = false;
    triggerBtn.classList.remove('active');
    closeBtn.onclick({ stopPropagation() {}, preventDefault() {} });
    assert.equal(hostEl.style.display, 'none', 'Close button must close panel even when tab trigger is missing');
    assert.equal(hostEl.getAttribute('data-open'), 'false');

    // 7. Pressing Escape dismisses open panel
    triggerInDom = true;
    mockWindow.__toggleGitGraphPanel(null, triggerBtn);
    assert.equal(hostEl.style.display, 'flex');
    keyListeners.forEach(fn => fn({ key: 'Escape' }));
    assert.equal(hostEl.style.display, 'none', 'Escape key must close open Git Graph panel');
  } finally {
    globalThis.fetch = origFetch;
  }
});
