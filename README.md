# Antigravity 2.0 Context Tachometer Mod

A real-time visual telemetry and context window monitor for Google Antigravity 2.0 desktop application.

## Overview

This mod enhances the Antigravity 2.0 top toolbar by injecting:
1. **Analog Speedometer / Tachometer Gauge:** A vector SVG gauge featuring a 240° color-gradient track (green to yellow to red) with an active needle rotating dynamically based on the current context consumption against the 1,000,000 token limit.
2. **Context Breakdown Popover:** An interactive overlay that triggers on hover/click over the badge, displaying:
   - User messages (`USER_INPUT`)
   - Model responses (`PLANNER_RESPONSE`)
   - Internal reasoning / thinking (`thinking` CoT)
   - Local tools and terminal output (`GENERIC` / `run_command`, `read_file`)
   - Model Context Protocol calls (`mcp_*`, `call_mcp_tool`)
   - Overall memory size and conversation turn count.

## Architecture

```
antigravity-ui-mods/
├── src/
│   ├── metrics.js           # Brain transcript analyzer & token categorization
│   ├── injector.js          # Chrome DevTools Protocol (CDP) WebSocket bridge
│   └── components/
│       ├── gauge.js         # Reactive SVG analog tachometer component
│       └── popover.js       # Rich breakdown popover markup and styling
├── dist/
│   └── update_ui_badge.mjs  # Standalone bundled distribution file
├── tests/
│   ├── test_cdp.mjs         # DOM injection verification test
│   └── test_hover.mjs       # Hover and popover interaction test
├── build.js                 # Packager that compiles and deploys to ~/.gemini/config/mods/
└── package.json
```

## How It Works

1. **Telemetry Parsing:** Reads `.system_generated/logs/transcript.jsonl` (or `transcript_full.jsonl`) from the active conversation in `~/.gemini/antigravity/brain/<conversation-id>/`.
2. **CDP Connection:** Reads the debugging WebSocket URL exposed in Antigravity's Electron logs (`AppData/Roaming/Antigravity/logs/*.log`).
3. **DOM Injection:** Injects the gauge and floating popover adjacent to `button[data-testid="model-selector-trigger"]`.
4. **Lifecycle Hooks:** Triggered automatically before each invocation through `~/.gemini/config/hooks.json` via the `context-tracker` hook.

## Deployment

To rebuild and deploy changes to the Antigravity global configuration:

```bash
npm run build
```
