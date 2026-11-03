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

test('ModLoader - generates CI/CD accordion trigger and VCS refresh handler in Git panel', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  assert.ok(script.includes('#antigravity-git-ci-rollup-trigger'));
  assert.ok(script.includes('#antigravity-git-ci-accordion'));
  assert.ok(script.includes('/vcs/overview'));
  assert.ok(script.includes('window.__toggleGitGraphPanel()'));
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
test('ModLoader - generates chatbox compact handler supporting explicit normal setting and hysteresis in ResizeObserver', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  assert.ok(script.includes('window.__applyChatboxModsCompact'));
  assert.ok(script.includes("compactSetting === 'false' ? false : isNarrow"));
  assert.ok(script.includes('threshold = isCurrentlyCompact ? 430 : 380'));
  assert.ok(script.includes('window.__renderReticleSvg(isFocus, 14)'));
});
