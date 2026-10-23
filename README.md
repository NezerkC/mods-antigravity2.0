# Mods Antigravity 2.0 (`mods-antigravity2.0`)

Extensible UI Mod Framework and Specialist Suite for the Google Antigravity 2.0 Desktop Application.

## Overview

This repository provides an enterprise-grade modding engine for Antigravity, organizing code into two decoupled architectural domains:
1. **`framework/`**: The host runtime, slot manager, style isolator, CDP bridge, telemetric token analyzer, and dynamic agent discovery engine.
2. **`mods/`**: Standalone UI mods that mount into target slots across all active conversation panels.

---

## Architecture & Layout

```
mods-antigravity2.0/
├── framework/                       # Core Mod Framework & Runtime
│   ├── core/
│   │   ├── CdpPortResolver.js       # Auto-discovers Electron CDP debug port
│   │   ├── CdpWebSocketClient.js    # Dispatches JS payloads via CDP WebSockets
│   │   ├── ModHost.js               # Central host orchestrator & lifecycle manager
│   │   ├── ModLoader.js             # Compiles mods, binds events, manages portals
│   │   └── SlotManager.js           # Multi-panel slot injection & anchor targeting
│   ├── sdk/
│   │   ├── AntigravityMod.js        # Base contract for custom mods
│   │   └── StyleIsolator.js         # CSS scoping with portal & keyframes support
│   ├── services/
│   │   ├── TelemetryService.js      # Accurate per-chat transcript & token analyzer
│   │   └── AgentDiscoveryService.js # Dynamic scanner for agent.md & *.agent.md files
│   └── index.js                     # Unified framework entrypoint
├── mods/                            # User-Facing Injected Mods
│   ├── agent-selector/              # Role selector with auto-collapse & .md discovery
│   │   ├── components/
│   │   │   ├── AgentDropdownHtml.js # Floating portal dropdown template
│   │   │   └── AgentIconSvg.js      # Fedora hat + sunglasses SVG icon
│   │   ├── manifest.json
│   │   └── styles.css
│   ├── context-tachometer/          # Analog speedometer & context window monitor
│   │   ├── components/
│   │   │   ├── GaugeSvg.js          # SVG 240° gradient speedometer
│   │   │   └── PopoverHtml.js       # Detailed telemetry breakdown card
│   │   ├── manifest.json
│   │   └── styles.css
│   ├── mods-manager/                # Top menubar panel & stealth kill-switch manager
│   │   ├── components/
│   │   │   └── ModsManagerHtml.js   # Slide-out modal with toggle switches
│   │   ├── manifest.json
│   │   └── styles.css
│   └── template/                    # Starter template for new mods
├── dist/                            # Bundled distributions ready for deployment
│   └── antigravity_mod_loader.mjs
├── tests/                           # Unit and live CDP integration test suite (65 tests)
├── tools/                           # Live probing and diagnostic CLI utilities
│   └── probe.js                     # DOM, process, and CDP probe
├── build.js                         # Bundler deploying to ~/.gemini/config/mods/
├── start-daemon.bat                 # Interactive Windows launcher & System Tray daemon
└── package.json
```

---

## Features

### 1. Accurate Per-Chat Context Tachometer (v2.0.0)
- Reads `.system_generated/logs/transcript_full.jsonl` matching the conversation ID in `data-cascade-id` and `/c/<id>` in real-time.
- Displays accurate token count, percentage against the 1M ceiling, and dynamic color-coded needle (Green $\rightarrow$ Yellow $\rightarrow$ Orange $\rightarrow$ Red).
- Floating popover portal with click-to-toggle activation and responsive auto-flip.

### 2. Dynamic Agent Discovery & Selector (v2.0.0)
- `AgentDiscoveryService` automatically discovers all agent definitions from:
  - Local workspace (`./agents/*.md`, `**/*.agent.md`, `agent.md`)
  - Shared Architecture Vault (`~/.gemini/antigravity/scratch/architecture-vault/`)
  - Global Skills (`~/.gemini/config/skills/**/SKILL.md`)
- Parses YAML frontmatter or Markdown headers to extract name, description, role, icon, and suite.
- Fedora hat + sunglasses SVG icon with searchable agent list.

### 3. Mods Manager & Stealth Kill-Switch (v2.0.0)
- Header menubar trigger button mounting cleanly in `.bg-sidebar`.
- Slide-out management panel allowing real-time activation/deactivation of mods.
- Global persistence kill-switch (`localStorage.__antigravity_daemon_enabled`).

### 4. Background Mod Daemon & Windows System Tray
- Autonomous `ModDaemon` monitoring Antigravity Electron lifecycle via active CDP HTTP probing (`127.0.0.1:53908`, `9222`, etc.).
- Auto-reinjects mods on window navigation, reload, or app restart without DOM thrashing.
- Interactive launcher (`start-daemon.bat`) with persistent PowerShell System Tray icon and context menu.

---

## Installation & Setup in Antigravity 2.0

### Prerequisites
1. **Node.js**: v18+ with ES modules support.
2. **Google Antigravity 2.0**: The desktop application must be running. The framework automatically discovers the active Chrome DevTools Protocol (CDP) port via active HTTP probing (`127.0.0.1:53908`, `9222`, `9229`, etc.).

### Step 1: Build & Deploy Bundles
Compile the unified runtime bundle and deploy it directly into Antigravity's global mods directory:

```bash
# Bundle runtime and deploy to ~/.gemini/config/mods/
npm run build
```

This compiles `framework/` and `mods/` into `dist/antigravity_mod_loader.mjs` and writes it to `~/.gemini/config/mods/antigravity_mod_loader.mjs`.

### Step 2: Inject and Maintain Persistence

Choose between the interactive Windows launcher or the CLI scripts:

#### Option A: Interactive Windows Launcher (Recommended)
Launch `start-daemon.bat` in your terminal or by double-clicking it in Windows Explorer:

```bat
.\start-daemon.bat
```

Select from the interactive menu:
- **[1] Iniciar en segundo plano**: Runs the daemon in the background with a Windows System Tray icon.
- **[2] Ver estado del daemon**: Checks whether the background process, System Tray, and startup launcher are running.
- **[3] Detener daemon**: Stops all background instances cleanly.
- **[4] Instalar en el inicio de Windows**: Registers the daemon in Windows Startup (`shell:startup`) so mods automatically inject every time your machine boots.
- **[5] Desinstalar del inicio de Windows**: Removes auto-start persistence.

#### Option B: NPM CLI Commands
Control the daemon directly using npm scripts:

```bash
# Start background daemon with System Tray
npm run daemon:start

# Inspect running state and PID tracking
npm run daemon:status

# Stop background daemon and tray icon
npm run daemon:stop

# Install auto-start persistence for Windows boot
npm run daemon:install

# Remove auto-start persistence
npm run daemon:uninstall

# Run directly in foreground (ideal for debugging)
npm run daemon
```

### Step 3: Verifying Injected Mods in Antigravity 2.0
Once the daemon is active and connects to Antigravity 2.0:
1. **Context Tachometer**: Located inside the chat action bar. Displays current token usage and percentage against the 1M limit. Click the badge to open the detailed telemetry popover card.
2. **Agent Selector**: Located in the chat control bar. Click the specialist icon to open the catalog modal and select an agent role.
3. **Mods Manager**: Located in the top sidebar menu (`.bg-sidebar`). Click the puzzle icon to toggle individual mods or engage the global stealth kill-switch.

---

## Testing & Diagnostics

To run the complete test suite (65 unit tests covering Core, SDK, Services, and Mods):

```bash
npm test
```

To probe live Antigravity Electron instances, DOM tree nodes, or active CDP ports:

```bash
# Probe active CDP debugging endpoint
npm run probe:cdp

# Inspect DOM structure of running Antigravity 2.0
npm run probe:dom

# Track Antigravity and Node processes
npm run probe:proc
```
