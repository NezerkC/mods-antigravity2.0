# Antigravity 2.0 Mods & Framework Architectural Catalog

> **Deterministic Architecture Catalog** — Generated automatically by `scripts/generate_mods_catalog.mjs`.
> Provides subagents and developers with instant, token-efficient architectural context without crawling raw source files.

## Table of Contents
- [1. Active Mods & UI Slot Topology](#1-active-mods--ui-slot-topology)
- [2. Framework UI Slot Registry](#2-framework-ui-slot-registry)
- [3. Framework Core Runtime & SDK](#3-framework-core-runtime--sdk)
- [4. Framework Services & Public API Reference](#4-framework-services--public-api-reference)
- [5. Test Suite Mapping & Coverage](#5-test-suite-mapping--coverage)
- [6. Single-Line Repository File Responsibility Map](#6-single-line-repository-file-responsibility-map)

---
## 1. Active Mods & UI Slot Topology

Antigravity 2.0 UI mods mount cleanly into Electron DOM slots via non-destructive Chrome DevTools Protocol (CDP) injection.

| Mod ID | Name | Version | Priority | Slot | DOM Anchor Selector | Strategy | Components | Styles |
|---|---|---|:---:|---|---|:---:|:---:|:---:|
| `agent-selector` | **Agent Role Selector** | `2.0.0` | 45 | `header-actions` | `button[data-testid="model-selector-trigger"]` | `after` | 3 | 20.3 KB |
| `context-tachometer` | **Context Window Tachometer** | `2.0.0` | 50 | `header-actions` | `button[data-testid="model-selector-trigger"]` | `after` | 2 | 4.2 KB |
| `git-graph` | **Git & GitHub Topological Graph** | `2.0.0` | 60 | `aux-pane-tab` | `button[data-testid="aux-pane-new-tab-button"]` | `before` | 3 | 34.7 KB |
| `model-slots` | **Planner & Builder Model Slots** | `1.0.0` | 90 | `menubar-actions` | `.shrink-0 > .bg-sidebar` | `append` | 1 | 23.4 KB |
| `mods-manager` | **Mods Manager** | `2.0.0` | 100 | `menubar-actions` | `.shrink-0 > .bg-sidebar` | `append` | 1 | 10.4 KB |
| `pit-wall` | **Pit Wall Telemetry & Cost Analytics** | `1.0.0` | 85 | `menubar-actions` | `.shrink-0 > .bg-sidebar` | `append` | 1 | 14.3 KB |
| `my-custom-mod` | **My Custom Mod** | `1.0.0` | 10 | `header-actions` | `button[data-testid="model-selector-trigger"]` | `after` | 0 | 0.5 KB |
| `voice-assistant` | **Voice Assistant** | `1.0.0` | 40 | `chat-input-actions` | `button[aria-label="Record voice memo"]` | `before` | 1 | 12.4 KB |

### Detailed Mod Specifications
#### Mod: `agent-selector` (Agent Role Selector)
- **Description:** Interactive selector for active architecture agents and specialists
- **Primary Slot:** `header-actions` (injects `after` target `button[data-testid="model-selector-trigger"]`)
- **Priority:** 45
- **Components:** `mods/agent-selector/components/AgentDropdownHtml.js`, `mods/agent-selector/components/AgentIconSvg.js`, `mods/agent-selector/components/AgentIcons.js`
- **Styles:** `mods/agent-selector/styles.css` (20802 bytes)

#### Mod: `context-tachometer` (Context Window Tachometer)
- **Description:** Analog speedometer and context breakdown telemetry popover for Antigravity 2.0
- **Primary Slot:** `header-actions` (injects `after` target `button[data-testid="model-selector-trigger"]`)
- **Priority:** 50
- **Components:** `mods/context-tachometer/components/GaugeSvg.js`, `mods/context-tachometer/components/PopoverHtml.js`
- **Styles:** `mods/context-tachometer/styles.css` (4344 bytes)

#### Mod: `git-graph` (Git & GitHub Topological Graph)
- **Description:** Live DAG topology branch graph, collaborator avatars, and GitHub integration
- **Primary Slot:** `aux-pane-tab` (injects `before` target `button[data-testid="aux-pane-new-tab-button"]`)
- **Priority:** 60
- **Components:** `mods/git-graph/components/GitGraphPanelHtml.js`, `mods/git-graph/components/GitGraphSvg.js`, `mods/git-graph/components/PrCiCardHtml.js`
- **Styles:** `mods/git-graph/styles.css` (35568 bytes)

#### Mod: `model-slots` (Planner & Builder Model Slots)
- **Description:** Dual menubar selectors to assign any model as Planner or Builder across actions
- **Primary Slot:** `menubar-actions` (injects `append` target `.shrink-0 > .bg-sidebar`)
- **Priority:** 90
- **Components:** `mods/model-slots/components/ModelSlotsHtml.js`
- **Styles:** `mods/model-slots/styles.css` (23955 bytes)

#### Mod: `mods-manager` (Mods Manager)
- **Description:** Panel de control y switches para activar o desactivar mods y persistencia en Antigravity.
- **Primary Slot:** `menubar-actions` (injects `append` target `.shrink-0 > .bg-sidebar`)
- **Priority:** 100
- **Author:** Victor Manuel Martinez Munoz
- **Components:** `mods/mods-manager/components/ModsManagerHtml.js`
- **Styles:** `mods/mods-manager/styles.css` (10622 bytes)

#### Mod: `pit-wall` (Pit Wall Telemetry & Cost Analytics)
- **Description:** Desktop UI Mod for Antigravity.
- **Primary Slot:** `menubar-actions` (injects `append` target `.shrink-0 > .bg-sidebar`)
- **Priority:** 85
- **Components:** `mods/pit-wall/components/PitWallHtml.js`
- **Styles:** `mods/pit-wall/styles.css` (14627 bytes)

#### Mod: `my-custom-mod` (My Custom Mod)
- **Description:** A starter boilerplate mod for Antigravity 2.0 desktop UI
- **Primary Slot:** `header-actions` (injects `after` target `button[data-testid="model-selector-trigger"]`)
- **Priority:** 10
- **Styles:** `mods/template/styles.css` (539 bytes)

#### Mod: `voice-assistant` (Voice Assistant)
- **Description:** Voice Assistant with Text-to-Speech (TTS) live activity narrator and chat reader
- **Primary Slot:** `chat-input-actions` (injects `before` target `button[aria-label="Record voice memo"]`)
- **Priority:** 40
- **Components:** `mods/voice-assistant/components/VoiceHudBoxHtml.js`
- **Local Services:** `mods/voice-assistant/services/ActionNarratorService.js`, `mods/voice-assistant/services/TextSanitizer.js`, `mods/voice-assistant/services/VoicePromptConditioner.js`, `mods/voice-assistant/services/XttsLocalAdapter.js`
- **Styles:** `mods/voice-assistant/styles.css` (12742 bytes)

---
## 2. Framework UI Slot Registry

Registered in `framework/core/SlotManager.js`. Mods declare one of these slots to anchor their UI in Antigravity Electron:

| Slot ID | DOM CSS Target Selector | Injection Strategy | Mounted Mods | Description / Usage |
|---|---|:---:|---|---|
| `aux-pane-tab` | `button[data-testid="aux-pane-new-tab-button"]` | `before` | `git-graph` | Auxiliary right-side panel tab bar button. |
| `chat-input-actions` | `button[aria-label="Record voice memo"]` | `before` | `voice-assistant` | Action button row adjacent to voice memo / chat input form. |
| `floating-dock` | `body` | `append` | *(none)* | Detached floating container anchored directly to DOM body. |
| `header-actions` | `button[data-testid="model-selector-trigger"]` | `after` | `agent-selector`, `context-tachometer`, `my-custom-mod` | Header action row next to the model selection trigger. |
| `header-right` | `header, [role="banner"]` | `append` | *(none)* | Top-right corner of the global application banner. |
| `menubar-actions` | `.shrink-0 > .bg-sidebar` | `append` | `model-slots`, `mods-manager`, `pit-wall` | Sidebar navigation action strip for persistent mod icons and menus. |
| `status-bar` | `footer, [data-testid="status-bar"]` | `append` | *(none)* | Footer status bar container for telemetry summaries and background statuses. |

---
## 3. Framework Core Runtime & SDK

The core orchestration runtime manages CDP communication, daemon polling, lifecycle dispatching, and CSS scoping.

### `framework/core/CdpPortResolver.js`
#### Class: `CdpPortResolver`
Discovers and validates the active Chrome DevTools Protocol (CDP) debugging port for Antigravity Electron via active HTTP probing, CLI/environment flags, and log tail fallback.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor(options = {})` | `void` | Public class method. |
| `async` `probePort()` | `probePort(port, timeoutMs = this.probeTimeoutMs)` | `{Promise<boolean>}` | Actively probes an HTTP port to verify if it is an active CDP endpoint. |
| `static` `parsePortFromLog()` | `parsePortFromLog(content, fallback = null)` | `{number|null}` | Parses the CDP WebSocket port from a raw log string. |
| `resolvePortFromLogs()` | `resolvePortFromLogs()` | `{number|null} Discovered port or null if not found.` | Synchronously attempts to resolve the port by inspecting the newest log files. Reads only the tail (last 64 KB) of each log to prevent memory bloat on large files. |
| `resolvePortFromDevToolsActivePort()` | `resolvePortFromDevToolsActivePort()` | `{number|null} Discovered port or null if missing/invalid.` | Synchronously reads Electron's DevToolsActivePort file (line 1 = active port) and parses it as a valid TCP port (1..65535). |
| `async` `resolvePort()` | `resolvePort()` | `{Promise<number>}` | Resolves the active CDP port using a tiered cascading strategy: 1. CLI parameter (--cdp-port <port>) 2. Environment variable (ANTIGRAVITY_CDP_PORT) 3. Electron DevToolsActivePort file (verified via active HTTP probe) 4. Active HTTP probe on defaultPort & candidate ports 5. Passive log tail inspection 6. Fallback to defaultPort |

### `framework/core/CdpWebSocketClient.js`
#### Class: `CdpWebSocketClient`
Client for interacting with the Electron Chrome DevTools Protocol (CDP) WebSocket bridge.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor(options = {})` | `void` | Public class method. |
| `getTargetListUrl()` | `getTargetListUrl()` | `{string}` | Builds the CDP JSON target listing endpoint. |
| `static` `isNonUiPageTarget()` | `isNonUiPageTarget(target)` | `{boolean}` | Checks whether a CDP target represents a non-UI page such as a splash screen, DevTools window, or blank document. |
| `static` `isPreferredAppTarget()` | `isPreferredAppTarget(target)` | `{boolean}` | Checks whether a CDP page target URL matches the primary Antigravity app window. |
| `static` `findPageTarget()` | `findPageTarget(targets)` | `{{ type: string, url?: string, title?: string, webSocketDebuggerUrl?: string } | undefined}` | Finds the primary browser page target among the reported CDP targets. Skips `data:`, `devtools:`, `about:blank`, and other non-UI targets, preferring the real Antigravity app window with a clean fallback to any valid UI page. |
| `createEvaluatePayload()` | `createEvaluatePayload(expression, id)` | `{Object}` | Creates a JSON-RPC 2.0 command payload for Runtime.evaluate. |
| `async` `evaluate()` | `evaluate(expression)` | `{Promise<any>}` | Dispatches a JavaScript expression to be evaluated inside the Electron page context. |

### `framework/core/ModDaemon.js`
#### Class: `ModDaemon`
Autonomous background daemon watcher that monitors Antigravity Electron lifecycle via CDP and ensures UI mods remain persistently injected across application restarts, window reloads, and navigation events.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor(options = {})` | `void` | Public class method. |
| `getGitMtimeSignature()` | `getGitMtimeSignature(repoPath)` | `{string}` | Computes a lightweight mtime signature for .git/HEAD, .git/index, and .git/refs without spawning subprocesses, allowing reactive Git Graph updates on commit/push/stage. |
| `async` `checkInjected()` | `checkInjected(client)` | `{Promise<'injected' | 'missing' | 'paused'>}` | Checks whether mod containers are actively mounted in the Electron DOM, or whether the daemon persistence has been paused by the user stealth switch. |
| `async` `refreshTelemetry()` | `refreshTelemetry(client)` | `{Promise<boolean>}` | Refreshes telemetry metrics and live data in the active Electron DOM session without re-injecting entire mod styles and DOM shells. |
| `async` `tick()` | `tick()` | `{Promise<{ status: string, port?: number|null, error?: string } >}` | Single polling tick to verify CDP availability and inject mods if missing. |
| `start()` | `start()` | `void` | Starts the background monitoring loop. |
| `stop()` | `stop()` | `void` | Stops the background monitoring loop cleanly. |
| `getStatus()` | `getStatus()` | `{{ isRunning: boolean, connectedPort: number|null, lastInjectedAt: number|null, pollIntervalMs: number } }` | Returns current operational status of the daemon. |

#### Exported Functions
| Function | Signature | Returns | Description |
|---|---|:---:|---|
| `createDefaultHost()` | `createDefaultHost(options = {})` | `{ModHost}` | Creates a ModHost instance pre-configured with default first-party mods. |

### `framework/core/ModHost.js`
#### Class: `ModHost`
Central orchestrator host for Antigravity Mod Framework. Coordinates telemetry extraction, mod lifecycle, and CDP DOM dispatching.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor(options = {})` | `void` | Public class method. |
| `registerMod()` | `registerMod(mod)` | `void` | Registers an active UI mod with the host. |
| `getMods()` | `getMods()` | `{Array<import('../sdk/AntigravityMod.js').AntigravityMod>}` | Returns registered mods from the mod loader. |
| `getRegisteredMods()` | `getRegisteredMods()` | `{Array<import('../sdk/AntigravityMod.js').AntigravityMod>}` | Returns registered mods from the mod loader. |
| `compilePayload()` | `compilePayload(context = {})` | `{string}` | Compiles the combined DOM injection payload for all registered mods. |
| `async` `resolveRepoPath()` | `resolveRepoPath(cdpClient, explicitTranscriptPath)` | `{Promise<string>}` | Resolves the active Git repository root directory. Checks CDP renderer tab URLs, transcript metadata, cwd, and known project paths. |
| `async` `dispatch()` | `dispatch()` | `{Promise<any>}` | Executes the full host lifecycle: extracts telemetry, compiles registered mods, resolves CDP port, and dispatches the payload to the Electron renderer. |

### `framework/core/ModLoader.js`
#### Class: `ModLoader`
Discovers, registers, and compiles UI mods into coordinated injection scripts.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor(options = {})` | `void` | Public class method. |
| `register()` | `register(mod)` | `void` | Registers a mod into the loader. |
| `getRegisteredMods()` | `getRegisteredMods()` | `{Array<import('../sdk/AntigravityMod.js').AntigravityMod>}` | Returns registered mods sorted by priority (descending). |
| `buildInjectionPayload()` | `buildInjectionPayload(context = {})` | `{string} Executable JavaScript.` | Compiles registered mods and their rendered templates into an executable CDP payload. Cleans up legacy duplicate elements and auto-mounts across ALL open chat panels. |

### `framework/core/SlotManager.js`
#### Class: `SlotManager`
Manages target UI slots in the Antigravity 2.0 DOM and generates collision-free injection payloads for registered mods across all active chat panels.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor()` | `void` | Public class method. |
| `registerSlot()` | `registerSlot(slotId, definition)` | `void` | Registers a new slot or overrides an existing slot target. |
| `getSlot()` | `getSlot(slotId)` | `void` | Retrieves definition for a given slot. |
| `getContainerId()` | `getContainerId(slotId)` | `{string}` | Gets deterministic DOM element ID for a slot container. |
| `static` `computeHtmlSignature()` | `computeHtmlSignature(html)` | `{string}` | Computes a deterministic content signature to skip redundant innerHTML writes. |
| `static` `generateMountSnippet()` | `generateMountSnippet(slotId, modId, htmlContent)` | `{string}` | Generates browser-executable JavaScript to mount a mod within a target slot using default SlotManager definitions. |
| `generateMountSnippet()` | `generateMountSnippet(slotId, modId, htmlContent)` | `{string}` | Generates browser-executable JavaScript to mount a mod within a target slot across ALL conversation tabs and split panels matching the selector. |
| `generateMountCode()` | `generateMountCode({ slotId, modId, htmlContent })` | `{string} Executable JavaScript.` | Generates browser-executable JavaScript to mount a mod within a target slot across ALL conversation tabs and split panels matching the selector. |

### `framework/sdk/AntigravityMod.js`
#### Class: `AntigravityMod`
Base class for all Antigravity desktop UI mods. Enforces metadata manifest and standard lifecycle contracts.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor(manifest)` | `void` | Public class method. |
| `async` `onInit()` | `onInit(context)` | `void` | Optional initialization lifecycle hook. Called once when the mod is registered into the host runtime. |
| `render()` | `render(context)` | `{{ html: string, css?: string, script?: string } }` | Primary render method. MUST return an object containing the rendered HTML template and optional scoped CSS. |
| `onUpdate()` | `onUpdate(context)` | `void` | Optional update lifecycle hook. Invoked on subsequent turns or when new telemetry is emitted without full remount. |
| `onDestroy()` | `onDestroy()` | `void` | Optional cleanup lifecycle hook. Called when the mod is disabled or unmounted. |

### `framework/sdk/StyleIsolator.js`
#### Class: `StyleIsolator`
Scopes and isolates raw CSS rules to prevent injected mod styles from conflicting with Antigravity host UI.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `static` `scopeCss()` | `scopeCss(css, scopeSelector)` | `{string} Scoped CSS string.` | Scopes CSS rules by prefixing non-at-rule selectors with a root container selector. |

---
## 4. Framework Services & Public API Reference

Services handle Git inspection, GitHub CLI queries, token telemetry calculations, Tailscale mesh networking, and Windows persistence.

### `framework/services/AgentDiscoveryService.js`
#### Service Class: `AgentDiscoveryService`
Service responsible for discovering and parsing agent markdown files (*.agent.md, agent.md, Agente *.md, SKILL.md) across workspace directories and global Antigravity/Gemini configuration vaults.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor(options = {})` | `void` | Public class method. |
| `discoverAgents()` | `discoverAgents(options = {})` | `{Array<Object>} List of structured agent descriptor objects.` | Scans configured paths and returns all discovered agents. Uses a short-lived TTL cache to avoid repeated filesystem walks. |
| `parseAgentFile()` | `parseAgentFile(filePath)` | `{Object|null}` | Parses frontmatter or markdown content from an agent file. |

### `framework/services/AgentSyncServer.js`
#### Service Class: `AgentSyncServer`
Lightweight local HTTP bridge server for synchronizing active agent selections from the Electron renderer directly to disk (~/.gemini/config/mods/active_agents.json) and providing unified VCS (Git + GitHub PR/CI) telemetry.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor(options = {})` | `void` | Public class method. |
| `normalizeRepoCandidate()` | `normalizeRepoCandidate(candidate = '', requireGit = false)` | `{string|null}` | Normalizes a candidate file/directory path or file:// URI into a valid Git repository root. |
| `resolveRepoForCascade()` | `resolveRepoForCascade(cascadeId, explicitRepoPath)` | `{string}` | Resolves the Git repository root for a specific conversation cascadeId or explicit path. |
| `readActiveAgents()` | `readActiveAgents()` | `{Object}` | Reads active agents map from disk. |
| `readModelSlots()` | `readModelSlots()` | `{Object}` | Reads model slots from disk or returns default configuration. |
| `writeActiveAgents()` | `writeActiveAgents(data)` | `void` | Saves active agents map to disk atomically. |
| `writeModelSlots()` | `writeModelSlots(data)` | `void` | Saves model slots configuration to disk atomically. |
| `updateModelSlots()` | `updateModelSlots(patch = {})` | `{Object}` | Updates model slots config with partial patch. |
| `readModelCatalog()` | `readModelCatalog()` | `{Object}` | Reads discovered live model catalog from disk or returns an empty snapshot. |
| `writeModelCatalog()` | `writeModelCatalog(data)` | `void` | Saves discovered model catalog to disk atomically. |
| `updateModelCatalog()` | `updateModelCatalog(payload = {})` | `{Object|null}` | Updates and persists the live discovered model catalog. |
| `readSubagentSessionSlots()` | `readSubagentSessionSlots(sessionId)` | `{Object|null}` | Reads saved model slots for a specific subagent sessionId, or all sessions map if omitted. |
| `updateSubagentSessionSlots()` | `updateSubagentSessionSlots(sessionId, slots = {})` | `{Object|null}` | Updates and persists model slots for a specific subagent sessionId atomically. |
| `updateAgentForCascade()` | `updateAgentForCascade(cascadeId, agent)` | `void` | Updates an agent entry for a specific conversation cascadeId. Preserves existing modifiers (like caveman and adhd) unless explicitly specified. |
| `updateModifiersForCascade()` | `updateModifiersForCascade(cascadeId, modifiers = {})` | `void` | Updates modifier flags (such as caveman and adhd focus modes) for a specific cascadeId. |
| `async` `start()` | `start()` | `{Promise<boolean>}` | Starts the HTTP bridge server if not already running. |
| `async` `stop()` | `stop()` | `{Promise<void>}` | Stops the server if running. |

### `framework/services/GitHubCliService.js`
#### Service Class: `GitHubCliService`
Service for interacting with GitHub CLI (`gh`) in native JSON mode, extracting Pull Requests, commit check status rollups, and CI/CD workflow runs.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor(options = {})` | `void` | Public class method. |
| `checkAuth()` | `checkAuth()` | `{{ isInstalled: boolean, isAuthenticated: boolean, account: string, scopes: string[] } }` | Checks whether GitHub CLI is installed and user is authenticated. |
| `getActivePullRequest()` | `getActivePullRequest(branch)` | `{Object | null}` | Retrieves active Pull Request for a given branch name. |
| `getRecentRuns()` | `getRecentRuns(options = {})` | `{Array<Object>}` | Retrieves recent CI/CD workflow runs. |

### `framework/services/GitService.js`
#### Service Class: `GitService`
Service providing high-performance Git operations, DAG topology graph calculation, collaborator avatar resolution, and GitHub metadata for Antigravity UI mods.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor()` | `{string}` | Computes Gravatar identicon URL based on author email. |
| `computeAvatarUrl()` | `computeAvatarUrl(email = '')` | `{string}` | Computes Gravatar identicon URL based on author email with memoization. |
| `parseGitHubRemote()` | `parseGitHubRemote(remoteUrl)` | `{Object}` | Parses a Git remote URL to extract GitHub owner and repository metadata. |
| `getGitHubMetadata()` | `getGitHubMetadata(options = {})` | `{Object}` | Reads GitHub metadata from the local repository's `origin` remote. |
| `computeTopology()` | `computeTopology(commits, options = {})` | `{Array<Object>}` | Computes topological lanes and Bezier branch route connections for commits. Guarantees: 1. The trunk (main/master) is anchored to Lane 0. 2. Continuous pass-through routes are emitted on EVERY row for all active lanes, ensuring the blue main line and feature branch lines never break into floating islands. 3. Smooth Bezier curves connect branches to/from main. 4. Each commit is marked with pushed: boolean (false if unpushed local commit). |
| `getBranches()` | `getBranches(options = {})` | `{Object}` | Retrieves enriched branch descriptors grouped by similarity cluster, tracking ahead (push), behind (pull), isMerged, and dirty files. |
| `getGitStatus()` | `getGitStatus(options = {})` | `{Object}` | Retrieves working tree and branch status. |
| `watchRepository()` | `watchRepository(options = {})` | `{Function} cleanup unsubscribe function` | Watches a git repository for head and ref changes and invokes callback. |
| `fetch()` | `fetch(options = {})` | `{{ local: Array<{ name: string, isCurrent: boolean, hash: string } >, remote: Array<{ name: string, shortName: string, hash: string }> }}` | Retrieves all local and remote branches categorized. |

### `framework/services/RemoteHostServer.js`
#### Service Class: `RemoteHostServer`
Lightweight HTTP/SSE server that runs on the host PC (PC de escritorio) to securely expose conversation transcripts and metadata across Tailscale.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor(options = {})` | `void` | Public class method. |
| `resolveBrainDir()` | `resolveBrainDir()` | `{string}` | Resolves the default Antigravity conversation brain directory. |
| `start()` | `start()` | `{Promise<{ host: string, port: number } >}` | Starts the HTTP server. |
| `stop()` | `stop()` | `{Promise<void>}` | Stops the server and closes all active streaming sockets. |
| `getTranscriptPath()` | `getTranscriptPath(convId)` | `{string|null}` | Finds the path to the transcript.jsonl file for a conversation ID. |
| `getConversations()` | `getConversations()` | `{Array<{ id: string, title: string, updatedAt: string, sizeBytes: number } >}` | Scans brain directory and returns list of conversations with titles and metadata. |
| `handleRequest()` | `handleRequest(req, res)` | `void` | Dispatches incoming HTTP requests to handlers. |

### `framework/services/TailscaleDiscoveryService.js`
#### Service Class: `TailscaleDiscoveryService`
Service that interfaces with the local Tailscale CLI / daemon to discover network topology, devices, and mesh IPs (100.x.y.z) in real time.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor(options = {})` | `void` | Public class method. |
| `resolveTailscaleCli()` | `resolveTailscaleCli()` | `{string}` | Detects the location of the Tailscale executable across common OS paths. |
| `getRawStatus()` | `getRawStatus()` | `{Object|null} Parsed JSON status or null if unavailable.` | Executes tailscale status in JSON mode. |
| `checkStatus()` | `checkStatus()` | `{{ isInstalled: boolean, isRunning: boolean, selfName: string, selfIpv4: string } }` | Checks the health and connectivity of the local Tailscale node. |
| `getDevices()` | `getDevices()` | `{TailscaleDevice[]}` | Transforms raw Tailscale status into a uniform list of local and peer devices. |
| `getOnlinePeers()` | `getOnlinePeers()` | `{TailscaleDevice[]}` | Returns only remote peers that are currently reachable and online. |
| `findDeviceByName()` | `findDeviceByName(name)` | `{TailscaleDevice|null}` | Finds a device by case-insensitive name or hostname match. |

### `framework/services/TelemetryService.js`
#### Service Class: `TelemetryService`
Service responsible for calculating detailed context window telemetry and token usage metrics from Antigravity conversation transcripts.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor(options = {})` | `void` | Public class method. |
| `estimateToolCallsChars()` | `estimateToolCallsChars(toolCalls)` | `{number}` | Estimates character weight of structured tool calls without calling JSON.stringify on large payloads. |
| `formatTokens()` | `formatTokens(tokens)` | `{string}` | Formats token count into a compact human-readable string. |
| `sanitizeModelName()` | `sanitizeModelName(rawName = '')` | `{string}` | Sanitizes a raw model name extracted from transcript logs, stripping system prompt instructions or trailing punctuation. |
| `isValidModelName()` | `isValidModelName(rawName = '')` | `{boolean}` | Validates whether a candidate model string is a realistic model identifier or junk. |
| `classifyModelFamily()` | `classifyModelFamily(modelName = '')` | `{{ family: 'argon' | 'claude' | 'gemini', hasDualLimit: boolean, rollingCeiling: number, weeklyCeiling: number } }` | Classifies a model name into its quota family and returns its quota limits. |
| `unwrapToolArg()` | `unwrapToolArg(rawVal)` | `{any}` | Unwraps potentially JSON-encoded tool call arguments from transcript logs. |
| `resolveSubagentModel()` | `resolveSubagentModel(rawModelArg, parentActiveModel = '')` | `{{ modelName: string, requestedModel: string, isInherited: boolean } }` | Resolves the effective model name used by a subagent given its requested Model argument ('inherit', 'flash', 'flash_lite', 'pro', or explicit name) and parent model. |
| `inferConversationPaths()` | `inferConversationPaths(filePath)` | `{{ convId: string|null, convDir: string|null, brainRoot: string|null } }` | Infers conversation ID, conversation directory, and brain root from a transcript path. |
| `resolveConversationTranscriptPath()` | `resolveConversationTranscriptPath(convId, brainRoot = this.brainDir)` | `{string|null}` | Resolves the transcript file path for a given conversation ID inside brainRoot. |
| `resolveModelVisualMeta()` | `resolveModelVisualMeta(modelName = '')` | `{{ color: string, shortName: string, poolId: 'gemini_unified'|'argon_weekly'|'third_party', poolLabel: string } }` | Resolves display palette, short name, and quota pool classification for a model name. |
| `buildWaffleCells()` | `buildWaffleCells(estTokens = 0, breakdown = {})` | `{Array<{ index: number, key: string, label: string, color: string, tokens: number, pct: number } >}` | Builds a 100-cell Claude-style waffle grid representing session context usage vs tokenLimit. |
| `buildPoolsSummary()` | `buildPoolsSummary(chatModels = [])` | `{Array<Object>}` | Aggregates chatModels entries into the 3 Antigravity quota pools. |
| `extractModelSelectionChange()` | `extractModelSelectionChange(content)` | `{{ fromModel: string|null, toModel: string|null } }` | Extracts { fromModel, toModel } from a <USER_SETTINGS_CHANGE> block when present. Supports both `<USER_SETTINGS_CHANGE>Model Selection from "A" to "B"</USER_SETTINGS_CHANGE>` and `The user changed setting \`Model Selection\` from A to B.` formats, including dotted versions. |
| `getEmptySnapshot()` | `getEmptySnapshot()` | `void` | Default empty telemetry snapshot. |
| `parseTranscriptFile()` | `parseTranscriptFile(filePath, options = {})` | `{Object}` | Parses a specific transcript JSONL file and resolves any spawned subagents along with their effective models and per-model consumption breakdown. |
| `resolveModelQuota()` | `resolveModelQuota(detectedModel = '', stepEntries = [], chatModels = [], nativeQuotaGroups = null)` | `{Object}` | Resolves model quota metrics based on the model tier and conversation activity. |
| `getAllMetrics()` | `getAllMetrics()` | `{Record<string, Object>}` | Retrieves telemetry metrics for all active conversations in the brain, aggregating global account quota usage across all chats. |
| `resolveModelPricing()` | `resolveModelPricing(modelName = '')` | `{{ baseName: string, compactName: string, packId: string, packLabel: string, packColor: string, inputPerM: number, cacheReadPerM: number, outputPerM: number } }` | Resolves list API pricing ($ per 1M input/output tokens) and canonical base name for Pit Wall analytics. |
| `getPitWallMetrics()` | `getPitWallMetrics(options = {})` | `{Object}` | Aggregates all-time Pit Wall metrics (stretches, hours worked, day streaks, consistency heatmap, and API price cost estimates across every conversation in brainDir). |

#### Exported Helper Functions
| Function | Signature | Returns | Description |
|---|---|:---:|---|
| `formatResetTime()` | `formatResetTime(resetTimeIso, now = Date.now())` | `{string}` | Formats an ISO reset timestamp or remaining milliseconds into a human-readable countdown string. |
| `resolveNativeQuotaForModel()` | `resolveNativeQuotaForModel(groups, activeModelName = '', now = Date.now())` | `{Object|null}` | Resolves accurate native quota metrics for a target model from RetrieveUserQuotaSummary groups. |

### `framework/services/VcsOrchestrator.js`
#### Service Class: `VcsOrchestrator`
Orchestrator combining local Git repository data and remote GitHub CLI metadata into a single unified payload for the Antigravity VCS mod and HTTP bridge.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor(options = {})` | `void` | Public class method. |
| `getRepositoryOverview()` | `getRepositoryOverview(options = {})` | `{Object}` | Produces unified repository status, commit DAG, active PR, and CI/CD runs. |

### `framework/services/WindowsDaemonService.js`
#### Service Class: `WindowsDaemonService`
Service to manage Windows startup persistence and background lifecycle for Antigravity Mod Daemon using a hidden VBScript launcher and batch runner.

| Method | Signature | Returns | Description |
|---|---|:---:|---|
| `constructor()` | `constructor(options = {})` | `void` | Public class method. |
| `resolveStartupDir()` | `resolveStartupDir()` | `{string}` | Resolves the current user's Windows Startup folder path. |
| `getLauncherPath()` | `getLauncherPath()` | `{string}` | Returns absolute path to the VBS startup launcher in Startup folder. |
| `getCmdPath()` | `getCmdPath()` | `{string}` | Returns absolute path to the CMD batch runner. |
| `getTrayPath()` | `getTrayPath()` | `{string}` | Returns absolute path to the PowerShell System Tray runner. |
| `getPidFilePath()` | `getPidFilePath()` | `{string}` | Returns absolute path to the PID tracking file. |
| `getTrayPidFilePath()` | `getTrayPidFilePath()` | `{string}` | Returns absolute path to the Tray PID tracking file. |
| `generateCmdContent()` | `generateCmdContent(targetScript)` | `{string}` | Generates batch script content to run Node with log redirection. |
| `generateTrayContent()` | `generateTrayContent(targetScript)` | `{string}` | Generates PowerShell Tray Runner script with WinForms NotifyIcon and lifecycle control. |
| `generateVbsContent()` | `generateVbsContent(targetScript)` | `{string}` | Generates VBScript content that executes the CMD or PowerShell tray runner with a hidden window. |
| `install()` | `install(targetScript)` | `{boolean}` | Installs the daemon runners into Windows Startup folder and config dir. |
| `uninstall()` | `uninstall()` | `{boolean}` | Removes launcher, batch runner, and tray runner from disk. |
| `isInstalled()` | `isInstalled()` | `{boolean}` | Checks whether the startup launcher is currently installed. |
| `savePid()` | `savePid(pid)` | `void` | Writes the active PID to disk for process tracking. |
| `readPid()` | `readPid()` | `{number|null}` | Reads the recorded PID from disk. |
| `clearPid()` | `clearPid()` | `void` | Clears the recorded PID file. |
| `saveTrayPid()` | `saveTrayPid(pid)` | `void` | Writes the active Tray PID to disk. |
| `readTrayPid()` | `readTrayPid()` | `{number|null}` | Reads the recorded Tray PID from disk. |
| `clearTrayPid()` | `clearTrayPid()` | `void` | Clears the recorded Tray PID file. |
| `isProcessRunning()` | `isProcessRunning(pid)` | `{boolean}` | Checks whether the process associated with a PID is alive. |
| `stopRunningDaemon()` | `stopRunningDaemon()` | `{boolean}` | Terminates the background daemon if currently running. |
| `stopRunningTray()` | `stopRunningTray()` | `{boolean}` | Terminates the system tray runner process if running. |

---
## 5. Test Suite Mapping & Coverage

Total verified tests: **309 tests** across **35 unit test files** and **1 functional integration test file**.

| Test Suite File | Type | Tests | Target Under Test (SUT) | Sample / Primary Assertion |
|---|:---:|:---:|---|---|
| `tests/functional/remote_mesh_functional.test.mjs` | **Functional** | 1 | `framework/services/RemoteHostServer.js`, `framework/services/TailscaleDiscoveryService.js` | Functional E2E: Complete Remote Mesh Discovery and Conversation Stream Life |
| `tests/unit/agent_discovery_service.test.mjs` | **Unit** | 4 | `framework/services/AgentDiscoveryService.js` | AgentDiscoveryService - parses frontmatter and markdown headers from agent  |
| `tests/unit/agent_selector_mod.test.mjs` | **Unit** | 10 | `mods/agent-selector/index.js`, `mods/agent-selector/components/AgentDropdownHtml.js` | AgentSelectorMod - loads correct manifest metadata |
| `tests/unit/agent_sync_server.test.mjs` | **Unit** | 8 | `framework/services/AgentSyncServer.js` | reads empty agents when file does not exist |
| `tests/unit/antigravity_mod.test.mjs` | **Unit** | 3 | `framework/sdk/AntigravityMod.js` | AntigravityMod - enforces required manifest properties |
| `tests/unit/antigravity_mods_hook.test.mjs` | **Unit** | 11 | `plugins/antigravity-mods/scripts/context-hook.mjs` | hooks.json - configures PreInvocation, PostInvocation, and Stop with distin |
| `tests/unit/antigravity_mods_sidecar.test.mjs` | **Unit** | 13 | `plugins/antigravity-mods/sidecars/dashboard/server.mjs` | plugin.json contains only allowed top-level Antigravity manifest keys |
| `tests/unit/build_bundle.test.mjs` | **Unit** | 3 | Framework / System | build.js - reads and orders VoicePromptConditioner before VoiceAssistantMod |
| `tests/unit/cdp_client.test.mjs` | **Unit** | 8 | `framework/core/CdpWebSocketClient.js` | CdpWebSocketClient - generates structured Runtime.evaluate command payload |
| `tests/unit/cdp_port_resolver.test.mjs` | **Unit** | 8 | `framework/core/CdpPortResolver.js` | CdpPortResolver - parses port from log string |
| `tests/unit/context_tachometer_mod.test.mjs` | **Unit** | 5 | `mods/context-tachometer/index.js`, `mods/context-tachometer/components/GaugeSvg.js` | ContextTachometerMod - loads correct manifest metadata |
| `tests/unit/framework_exports.test.mjs` | **Unit** | 2 | `framework/index.js`, `framework/host.js` | framework/index.js - exports GitService and AgentSyncServer alongside core  |
| `tests/unit/generate_mods_catalog.test.mjs` | **Unit** | 1 | Framework / System | generate_mods_catalog - executes cleanly and produces comprehensive MODS_CA |
| `tests/unit/git_graph_mod.test.mjs` | **Unit** | 16 | `mods/git-graph/index.js`, `mods/git-graph/components/GitGraphSvg.js`, `mods/git-graph/components/GitGraphPanelHtml.js` | GitGraphMod - loads correct manifest metadata |
| `tests/unit/git_service.test.mjs` | **Unit** | 11 | `framework/services/GitService.js` | GitService - computeAvatarUrl generates deterministic Gravatar identicon UR |
| `tests/unit/github_cli_service.test.mjs` | **Unit** | 5 | `framework/services/GitHubCliService.js` | GitHubCliService - detects missing gh CLI gracefully |
| `tests/unit/mod_daemon.test.mjs` | **Unit** | 9 | `framework/core/ModDaemon.js` | ModDaemon - constructor initializes with default configuration and status |
| `tests/unit/mod_host.test.mjs` | **Unit** | 1 | `framework/core/ModHost.js`, `framework/sdk/AntigravityMod.js` | ModHost - initializes with mod loader and manages multiple mods |
| `tests/unit/mod_loader.test.mjs` | **Unit** | 20 | `framework/core/ModLoader.js`, `framework/sdk/AntigravityMod.js` | ModLoader - registers mods and respects priority order |
| `tests/unit/model_slots_mod.test.mjs` | **Unit** | 58 | `mods/model-slots/components/ModelSlotsHtml.js`, `mods/model-slots/index.js`, `framework/services/AgentSyncServer.js`, `framework/core/ModDaemon.js`, `framework/core/ModLoader.js`, `framework/core/SlotManager.js`, `framework/sdk/StyleIsolator.js` | BASE_MODELS defines 9 base models with grouped effort levels including Gemi |
| `tests/unit/mods_hover_stability.test.mjs` | **Unit** | 3 | `mods/context-tachometer/index.js`, `mods/agent-selector/index.js` | ContextTachometerMod - hover styles are stationary without translateY jitte |
| `tests/unit/mods_manager_mod.test.mjs` | **Unit** | 3 | `mods/mods-manager/index.js`, `mods/mods-manager/components/ModsManagerHtml.js` | ModsManagerMod - loads correct manifest metadata |
| `tests/unit/pit_wall_mod.test.mjs` | **Unit** | 10 | `framework/services/TelemetryService.js`, `framework/core/ModLoader.js`, `mods/pit-wall/index.js`, `mods/pit-wall/components/PitWallHtml.js`, `mods/mods-manager/components/ModsManagerHtml.js` | PitWall - TelemetryService.getPitWallMetrics computes merged 20-min stretch |
| `tests/unit/pr_ci_card.test.mjs` | **Unit** | 3 | `mods/git-graph/components/PrCiCardHtml.js` | renderPrCiCardHtml - renders active PR header with passing CI/CD badge and  |
| `tests/unit/probe_tool.test.mjs` | **Unit** | 4 | `tools/probe.js` | ProbeTool - inspectDom dispatches query and returns evaluated structure |
| `tests/unit/RemoteHostServer.test.mjs` | **Unit** | 3 | `framework/services/RemoteHostServer.js` | RemoteHostServer - health endpoint returns valid node metadata |
| `tests/unit/slot_manager.test.mjs` | **Unit** | 14 | `framework/core/SlotManager.js` | SlotManager - provides default slot definitions |
| `tests/unit/style_isolator.test.mjs` | **Unit** | 6 | `framework/sdk/StyleIsolator.js` | StyleIsolator - scopes simple class selectors under root container |
| `tests/unit/TailscaleDiscoveryService.test.mjs` | **Unit** | 5 | `framework/index.js` | TailscaleDiscoveryService - detects installed status correctly |
| `tests/unit/telemetry_service.test.mjs` | **Unit** | 10 | `framework/services/TelemetryService.js`, `mods/context-tachometer/components/PopoverHtml.js` | TelemetryService - calculates empty metric snapshot |
| `tests/unit/vcs_orchestrator.test.mjs` | **Unit** | 2 | `framework/services/VcsOrchestrator.js` | VcsOrchestrator - aggregates local Git and remote GitHub metadata into unif |
| `tests/unit/voice_assistant_mod.test.mjs` | **Unit** | 11 | `mods/voice-assistant/index.js` | VoiceAssistantMod - loads correct manifest metadata |
| `tests/unit/voice_control_plugin.test.mjs` | **Unit** | 15 | `plugins/antigravity-voice-control/mcp/server.mjs`, `plugins/antigravity-voice-control/sidecars/HandyTranscribeBridge.mjs`, `plugins/antigravity-voice-control/sidecars/launch.mjs` | plugin.json - adheres strictly to allowed top-level schema keys and values |
| `tests/unit/voice_prompt_conditioner.test.mjs` | **Unit** | 7 | `mods/voice-assistant/index.js` | VoicePromptConditioner.extractSpokenText - extracts latest user line from < |
| `tests/unit/voice_toast_and_git_close.test.mjs` | **Unit** | 11 | `framework/core/ModLoader.js`, `framework/sdk/StyleIsolator.js`, `mods/voice-assistant/components/VoiceHudBoxHtml.js` | Voice Assistant Styles - defines centered Top HUD box-in-box CSS across vie |
| `tests/unit/windows_daemon_service.test.mjs` | **Unit** | 5 | `framework/services/WindowsDaemonService.js` | WindowsDaemonService - generates valid CMD and VBScript content |

---
## 6. Single-Line Repository File Responsibility Map

A dense, token-saving lookup table mapping every file in the repository to its exact architectural responsibility:

### Framework Runtime & Services
- `framework/assets/mod-daemon.ico`: High-resolution Windows taskbar tray icon for the background Antigravity Mod Daemon.
- `framework/core/CdpPortResolver.js`: Auto-detects and validates Electron Chrome DevTools Protocol (CDP) port via HTTP probing and logs.
- `framework/core/CdpWebSocketClient.js`: Zero-dependency WebSocket client for executing JavaScript within Electron page targets via CDP.
- `framework/core/ModDaemon.js`: Background service monitoring Electron lifecycle and maintaining persistent mod injection.
- `framework/core/ModHost.js`: Central orchestrator coordinating mod compilation, repo path resolution, and CDP dispatch.
- `framework/core/ModLoader.js`: Client-side runtime script injected into Electron renderer managing DOM mounting and lifecycle.
- `framework/core/SlotManager.js`: Defines and manages target UI slot injection anchors and CSS selector strategies in Antigravity DOM.
- `framework/daemon.js`: CLI entrypoint for managing the background ModDaemon (start, stop, status, install, uninstall).
- `framework/host.js`: CLI entrypoint to trigger an immediate one-shot injection dispatch into active Antigravity Electron.
- `framework/index.js`: Main module export aggregator providing programmatic access to framework core, sdk, and services.
- `framework/sdk/AntigravityMod.js`: Abstract base class enforcing lifecycle hooks (onInit, render, onUpdate, onDestroy) for mods.
- `framework/sdk/StyleIsolator.js`: CSS scoping utility isolating mod stylesheets using scoped class prefixes.
- `framework/services/AgentDiscoveryService.js`: Discovers and parses markdown agent definitions across workspaces and global vaults.
- `framework/services/AgentSyncServer.js`: Local HTTP bridge synchronizing active agent selections and modifier state with external agents.
- `framework/services/GitHubCliService.js`: Integrates with GitHub CLI (`gh`) to fetch active PR metadata and CI/CD workflow run statuses.
- `framework/services/GitService.js`: High-performance local Git operations, topological commit graph calculation, and Gravatar avatars.
- `framework/services/RemoteHostServer.js`: Lightweight HTTP/SSE server exposing local conversation transcripts securely across Tailscale mesh.
- `framework/services/TailscaleDiscoveryService.js`: Detects Tailscale CLI, retrieves node status, and discovers online mesh peer devices.
- `framework/services/TelemetryService.js`: Parses conversation transcripts, tracks multi-model token metrics, and calculates quota reset countdowns.
- `framework/services/VcsOrchestrator.js`: Aggregates local Git repository status and remote GitHub metadata into a unified VCS overview.
- `framework/services/WindowsDaemonService.js`: Manages Windows Startup persistence via hidden VBScript launchers and PowerShell tray runner.

### Antigravity UI Mods
- `mods/agent-selector/components/AgentDropdownHtml.js`: HTML template builder generating DOM markup and event containers for 'agent-selector'.
- `mods/agent-selector/components/AgentIcons.js`: Vector icon dictionary and glyph renderers for 'agent-selector'.
- `mods/agent-selector/components/AgentIconSvg.js`: SVG rendering component generating dynamic vector graphics for 'agent-selector'.
- `mods/agent-selector/index.js`: Main entrypoint and AntigravityMod class implementation for 'agent-selector'.
- `mods/agent-selector/manifest.json`: Manifest metadata, target slot, and priority declaration for 'agent-selector' mod.
- `mods/agent-selector/styles.css`: Scoped CSS stylesheet defining visual styling, layout, and animations for 'agent-selector'.
- `mods/context-tachometer/components/GaugeSvg.js`: SVG rendering component generating dynamic vector graphics for 'context-tachometer'.
- `mods/context-tachometer/components/PopoverHtml.js`: HTML template builder generating DOM markup and event containers for 'context-tachometer'.
- `mods/context-tachometer/index.js`: Main entrypoint and AntigravityMod class implementation for 'context-tachometer'.
- `mods/context-tachometer/manifest.json`: Manifest metadata, target slot, and priority declaration for 'context-tachometer' mod.
- `mods/context-tachometer/styles.css`: Scoped CSS stylesheet defining visual styling, layout, and animations for 'context-tachometer'.
- `mods/git-graph/components/GitGraphPanelHtml.js`: HTML template builder generating DOM markup and event containers for 'git-graph'.
- `mods/git-graph/components/GitGraphSvg.js`: SVG rendering component generating dynamic vector graphics for 'git-graph'.
- `mods/git-graph/components/PrCiCardHtml.js`: HTML template builder generating DOM markup and event containers for 'git-graph'.
- `mods/git-graph/index.js`: Main entrypoint and AntigravityMod class implementation for 'git-graph'.
- `mods/git-graph/manifest.json`: Manifest metadata, target slot, and priority declaration for 'git-graph' mod.
- `mods/git-graph/styles.css`: Scoped CSS stylesheet defining visual styling, layout, and animations for 'git-graph'.
- `mods/model-slots/components/ModelSlotsHtml.js`: HTML template builder generating DOM markup and event containers for 'model-slots'.
- `mods/model-slots/index.js`: Main entrypoint and AntigravityMod class implementation for 'model-slots'.
- `mods/model-slots/manifest.json`: Manifest metadata, target slot, and priority declaration for 'model-slots' mod.
- `mods/model-slots/styles.css`: Scoped CSS stylesheet defining visual styling, layout, and animations for 'model-slots'.
- `mods/mods-manager/components/ModsManagerHtml.js`: HTML template builder generating DOM markup and event containers for 'mods-manager'.
- `mods/mods-manager/index.js`: Main entrypoint and AntigravityMod class implementation for 'mods-manager'.
- `mods/mods-manager/manifest.json`: Manifest metadata, target slot, and priority declaration for 'mods-manager' mod.
- `mods/mods-manager/styles.css`: Scoped CSS stylesheet defining visual styling, layout, and animations for 'mods-manager'.
- `mods/pit-wall/components/PitWallHtml.js`: HTML template builder generating DOM markup and event containers for 'pit-wall'.
- `mods/pit-wall/index.js`: Main entrypoint and AntigravityMod class implementation for 'pit-wall'.
- `mods/pit-wall/manifest.json`: Manifest metadata, target slot, and priority declaration for 'pit-wall' mod.
- `mods/pit-wall/styles.css`: Scoped CSS stylesheet defining visual styling, layout, and animations for 'pit-wall'.
- `mods/template/index.js`: Main entrypoint and AntigravityMod class implementation for 'template'.
- `mods/template/manifest.json`: Manifest metadata, target slot, and priority declaration for 'template' mod.
- `mods/template/styles.css`: Scoped CSS stylesheet defining visual styling, layout, and animations for 'template'.
- `mods/voice-assistant/components/VoiceHudBoxHtml.js`: HTML template builder generating DOM markup and event containers for 'voice-assistant'.
- `mods/voice-assistant/index.js`: Main entrypoint and AntigravityMod class implementation for 'voice-assistant'.
- `mods/voice-assistant/manifest.json`: Manifest metadata, target slot, and priority declaration for 'voice-assistant' mod.
- `mods/voice-assistant/services/ActionNarratorService.js`: Mod-scoped background service supporting runtime functionality for 'voice-assistant'.
- `mods/voice-assistant/services/TextSanitizer.js`: Mod-scoped background service supporting runtime functionality for 'voice-assistant'.
- `mods/voice-assistant/services/VoicePromptConditioner.js`: Mod-scoped background service supporting runtime functionality for 'voice-assistant'.
- `mods/voice-assistant/services/XttsLocalAdapter.js`: Mod-scoped background service supporting runtime functionality for 'voice-assistant'.
- `mods/voice-assistant/styles.css`: Scoped CSS stylesheet defining visual styling, layout, and animations for 'voice-assistant'.

### Ecosystem Plugins
- `plugins/antigravity-mods/hooks.json`: Repository module file.
- `plugins/antigravity-mods/plugin.json`: Repository module file.
- `plugins/antigravity-mods/scripts/context-hook.mjs`: Antigravity Native Lifecycle Hook & Telemetry Engine (SSOT) Plugin: antigravity-mods Runtime: Node.js (ESM) - Zero External Dependencies.
- `plugins/antigravity-mods/sidecars/dashboard/server.mjs`: Antigravity Mods & Telemetry Native Sidecar Server.
- `plugins/antigravity-mods/sidecars/dashboard/sidecar.json`: Repository module file.
- `plugins/antigravity-voice-control/mcp_config.json`: MCP server configuration registering voice control tool definitions.
- `plugins/antigravity-voice-control/mcp/server.mjs`: MCP server exposing voice control tools, session management, and Language Server RPC client.
- `plugins/antigravity-voice-control/plugin.json`: Antigravity plugin manifest defining voice control metadata, MCP, and sidecars.
- `plugins/antigravity-voice-control/rules/AGENTS.md`: Governance rules and architectural boundaries for the voice control plugin.
- `plugins/antigravity-voice-control/sidecars/HandyTranscribeBridge.mjs`: Bridge integrating Handy C transcription library and local voice RPC dispatch.
- `plugins/antigravity-voice-control/sidecars/launch.mjs`: HTTP voice hub dashboard and audio transcription ingestion endpoint.
- `plugins/antigravity-voice-control/sidecars/voice-hub/sidecar.json`: Sidecar configuration mounting voice hub auxiliary panel into Antigravity UI.
- `plugins/antigravity-voice-control/skills/antigravity-control/SKILL.md`: Skill documentation and command reference for Antigravity voice control operations.

### Developer Tools & CLI Scripts
- `tools/generate_icon.ps1`: PowerShell script generating multi-resolution Windows ICO assets from vector shapes.
- `tools/hooks/context-tracker.py`: Repository module file.
- `tools/hooks/model-catalog-hook.py`: Repository module file.
- `tools/hooks/permission-guard.py`: Repository module file.
- `tools/package_release.mjs`: Packages standalone release distribution zips for deployment and GitHub releases.
- `tools/probe.js`: CLI diagnostic probe for verifying CDP ports, Electron DOM targets, and running processes.
- `tools/remote-host-daemon.js`: Stand-alone daemon runner initializing RemoteHostServer for remote mesh transcript streaming.
- `tools/verify_model_slots_cdp.mjs`: Repository module file.
- `tools/verify_model_slots_styles_cdp.mjs`: Repository module file.

### Automation Scripts
- `scripts/generate_mods_catalog.mjs`: Deterministic catalog generator compiling architecture, mods, services, and tests into MODS_CATALOG.md.
- `scripts/xtts_local_server.py`: Standalone local FastAPI/XTTS v2 server providing high-fidelity neural speech synthesis.

### Technical Specifications & Documentation
- `docs/assets/agent-selector.png`: Repository module file.
- `docs/assets/git-graph.png`: Repository module file.
- `docs/assets/overview.png`: Repository module file.
- `docs/GIT_WORKFLOW.md`: Developer guidelines for branching strategy, atomic conventional commits, and CI validation.
- `docs/MOD_AUTHORING_GUIDE.md`: Developer tutorial on creating custom Antigravity UI mods using AntigravityMod base class.
- `docs/PLAN_TAILSCALE_REMOTE_MESH.md`: Architecture design document for Tailscale P2P mesh discovery and remote telemetry.
- `docs/PLAN_VCS_CICD.md`: Technical specification for Git DAG visualization and GitHub Actions integration.
- `docs/SPEC_TAILSCALE_PEER_SYNC.md`: Contract and wire protocol specification for cross-device peer transcript synchronization.

### Test Suites & Verification
- `tests/check_ag_default_fonts.mjs`: Manual verification and visual regression test script.
- `tests/check_badge_svg.mjs`: Manual verification and visual regression test script.
- `tests/check_cq.mjs`: Manual verification and visual regression test script.
- `tests/check_fonts.mjs`: Manual verification and visual regression test script.
- `tests/check_popover_rect.mjs`: Manual verification and visual regression test script.
- `tests/check_pos.mjs`: Manual verification and visual regression test script.
- `tests/check_widths.mjs`: Manual verification and visual regression test script.
- `tests/functional/remote_mesh_functional.test.mjs`: Functional integration test suite validating end-to-end lifecycle for remote mesh functional.
- `tests/test_cdp.mjs`: Manual verification and visual regression test script.
- `tests/test_hover.mjs`: Manual verification and visual regression test script.
- `tests/test_interactive_live.mjs`: Manual verification and visual regression test script.
- `tests/test_pin_toggle.mjs`: Manual verification and visual regression test script.
- `tests/unit/agent_discovery_service.test.mjs`: Unit test suite verifying behavior and edge cases for agent discovery service.
- `tests/unit/agent_selector_mod.test.mjs`: Unit test suite verifying behavior and edge cases for agent selector mod.
- `tests/unit/agent_sync_server.test.mjs`: Unit test suite verifying behavior and edge cases for agent sync server.
- `tests/unit/antigravity_mod.test.mjs`: Unit test suite verifying behavior and edge cases for antigravity mod.
- `tests/unit/antigravity_mods_hook.test.mjs`: Unit test suite verifying behavior and edge cases for antigravity mods hook.
- `tests/unit/antigravity_mods_sidecar.test.mjs`: Unit test suite verifying behavior and edge cases for antigravity mods sidecar.
- `tests/unit/build_bundle.test.mjs`: Unit test suite verifying behavior and edge cases for build bundle.
- `tests/unit/cdp_client.test.mjs`: Unit test suite verifying behavior and edge cases for cdp client.
- `tests/unit/cdp_port_resolver.test.mjs`: Unit test suite verifying behavior and edge cases for cdp port resolver.
- `tests/unit/context_tachometer_mod.test.mjs`: Unit test suite verifying behavior and edge cases for context tachometer mod.
- `tests/unit/framework_exports.test.mjs`: Unit test suite verifying behavior and edge cases for framework exports.
- `tests/unit/generate_mods_catalog.test.mjs`: Unit test suite verifying behavior and edge cases for generate mods catalog.
- `tests/unit/git_graph_mod.test.mjs`: Unit test suite verifying behavior and edge cases for git graph mod.
- `tests/unit/git_service.test.mjs`: Unit test suite verifying behavior and edge cases for git service.
- `tests/unit/github_cli_service.test.mjs`: Unit test suite verifying behavior and edge cases for github cli service.
- `tests/unit/mod_daemon.test.mjs`: Unit test suite verifying behavior and edge cases for mod daemon.
- `tests/unit/mod_host.test.mjs`: Unit test suite verifying behavior and edge cases for mod host.
- `tests/unit/mod_loader.test.mjs`: Unit test suite verifying behavior and edge cases for mod loader.
- `tests/unit/model_slots_mod.test.mjs`: Unit test suite verifying behavior and edge cases for model slots mod.
- `tests/unit/mods_hover_stability.test.mjs`: Unit test suite verifying behavior and edge cases for mods hover stability.
- `tests/unit/mods_manager_mod.test.mjs`: Unit test suite verifying behavior and edge cases for mods manager mod.
- `tests/unit/pit_wall_mod.test.mjs`: Unit test suite verifying behavior and edge cases for pit wall mod.
- `tests/unit/pr_ci_card.test.mjs`: Unit test suite verifying behavior and edge cases for pr ci card.
- `tests/unit/probe_tool.test.mjs`: Unit test suite verifying behavior and edge cases for probe tool.
- `tests/unit/RemoteHostServer.test.mjs`: Unit test suite verifying behavior and edge cases for RemoteHostServer.
- `tests/unit/slot_manager.test.mjs`: Unit test suite verifying behavior and edge cases for slot manager.
- `tests/unit/style_isolator.test.mjs`: Unit test suite verifying behavior and edge cases for style isolator.
- `tests/unit/TailscaleDiscoveryService.test.mjs`: Unit test suite verifying behavior and edge cases for TailscaleDiscoveryService.
- `tests/unit/telemetry_service.test.mjs`: Unit test suite verifying behavior and edge cases for telemetry service.
- `tests/unit/vcs_orchestrator.test.mjs`: Unit test suite verifying behavior and edge cases for vcs orchestrator.
- `tests/unit/voice_assistant_mod.test.mjs`: Unit test suite verifying behavior and edge cases for voice assistant mod.
- `tests/unit/voice_control_plugin.test.mjs`: Unit test suite verifying behavior and edge cases for voice control plugin.
- `tests/unit/voice_prompt_conditioner.test.mjs`: Unit test suite verifying behavior and edge cases for voice prompt conditioner.
- `tests/unit/voice_toast_and_git_close.test.mjs`: Unit test suite verifying behavior and edge cases for voice toast and git close.
- `tests/unit/windows_daemon_service.test.mjs`: Unit test suite verifying behavior and edge cases for windows daemon service.
- `tests/verify_click_toggle.mjs`: Manual verification and visual regression test script.
- `tests/verify_compact.mjs`: Manual verification and visual regression test script.
- `tests/verify_loader.mjs`: Manual verification and visual regression test script.

### Root Configuration & Architecture
- `.gitignore`: Git ignore rules for node_modules, build artifacts, temporary logs, and local caches.
- `build.js`: Rollup-style build and bundler script packaging framework runtime and mods into dist bundles.
- `CONTRIBUTING.md`: Repository module file.
- `GEMINI.md`: Repository instruction contract enforcing atomic commits, branch workflows, and zero AI attribution.
- `LICENSE`: Repository module file.
- `package.json`: Node.js package manifest defining dependencies, daemon scripts, tests, and build commands.
- `PLAN.md`: Comprehensive engineering roadmap, architectural invariants, and backlog task tracking.
- `progreso.ps1`: Interactive PowerShell assistant checking local git status, pending issues, and branch health.
- `README.md`: Project overview, architectural architecture diagram, installation guide, and usage documentation.
- `SECURITY.md`: Repository module file.
- `start-daemon.bat`: One-click Windows batch launcher initializing background ModDaemon process.
