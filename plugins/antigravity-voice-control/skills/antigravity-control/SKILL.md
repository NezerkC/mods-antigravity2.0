---
name: antigravity-control
description: Inspect open conversations/cascades, dispatch prompts to a named conversation without polluting active implementation chats, manage terminals and worktrees, and control the global voice hub auxiliary pane.
---

# Antigravity App-Level Voice & System Control

This skill guides agents and developers on controlling Antigravity at the application level. It enables inspecting active conversations, routing prompts across chats without context pollution, spawning terminals, creating worktrees, and accessing the Voice Hub auxiliary dashboard.

## Overview

The Antigravity Voice Control plugin operates an app-level sidecar daemon and an MCP server that connect directly to Antigravity's Language Server.

```text
Spoken Command / Voice Hub
           │
           ▼
 HandyTranscribeBridge (Local STT & Normalization)
           │
           ▼
 LanguageServerRpcClient (Connect RPC / Allowlist)
    ├── Cross-Chat: SendUserCascadeMessage -> target cascadeId
    ├── App Actions: CancelCascadeInvocation, CreateTerminal
    └── UI Focus: SmartFocusConversation
```

## Step 1: Inspect Open Conversations and Cascades

Query open conversations and trajectories across workspaces using the `antigravity-voice-control-mcp` tool `list_conversations` or the direct RPC:

```bash
# Connect RPC call using environment variables:
curl -sS -X POST \
  "http://${ANTIGRAVITY_LS_ADDRESS:-localhost:5387}/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories" \
  -H "Content-Type: application/json" \
  -H "x-codeium-csrf-token: ${ANTIGRAVITY_CSRF_TOKEN}" \
  -d '{}'
```

Identify the target conversation's `cascadeId` and title/name (for example, finding a conversation named `hollow_vector` with ID `cascade-hv-789`).

## Step 2: Dispatch Prompts to a Named Conversation (Zero Pollution)

When an agent needs to delegate or send an instruction to another conversation without interrupting the current chat or consuming context tokens:

1. Identify the target `cascadeId`.
2. Send the message directly using `send_conversation_message` or RPC:

```bash
curl -sS -X POST \
  "http://${ANTIGRAVITY_LS_ADDRESS:-localhost:5387}/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage" \
  -H "Content-Type: application/json" \
  -H "x-codeium-csrf-token: ${ANTIGRAVITY_CSRF_TOKEN}" \
  -d '{"cascadeId": "cascade-hv-789", "text": "Review commit and run unit tests"}'
```

3. (Optional) Focus the conversation in the UI:

```bash
curl -sS -X POST \
  "http://${ANTIGRAVITY_LS_ADDRESS:-localhost:5387}/exa.language_server_pb.LanguageServerService/SmartFocusConversation" \
  -H "Content-Type: application/json" \
  -H "x-codeium-csrf-token: ${ANTIGRAVITY_CSRF_TOKEN}" \
  -d '{"cascadeId": "cascade-hv-789"}'
```

## Step 3: Manage Terminals and Worktrees

### Create and Control Terminals
Spawn background or interactive terminals in a given directory:

```bash
# Create a terminal session
curl -sS -X POST \
  "http://${ANTIGRAVITY_LS_ADDRESS:-localhost:5387}/exa.language_server_pb.LanguageServerService/CreateTerminal" \
  -H "Content-Type: application/json" \
  -H "x-codeium-csrf-token: ${ANTIGRAVITY_CSRF_TOKEN}" \
  -d '{"cwd": "c:/Users/lolpl/Documents/antigravity/joyful-chandrasekhar"}'
```

Send commands to the terminal:
```bash
curl -sS -X POST \
  "http://${ANTIGRAVITY_LS_ADDRESS:-localhost:5387}/exa.language_server_pb.LanguageServerService/SendTerminalInput" \
  -H "Content-Type: application/json" \
  -H "x-codeium-csrf-token: ${ANTIGRAVITY_CSRF_TOKEN}" \
  -d '{"terminalId": "<terminalId>", "input": "git status\n"}'
```

### Git Worktrees for Parallel Fronts
Create isolated worktrees for multi-agent workflows without duplicating storage:
```bash
curl -sS -X POST \
  "http://${ANTIGRAVITY_LS_ADDRESS:-localhost:5387}/exa.language_server_pb.LanguageServerService/CreateWorktree" \
  -H "Content-Type: application/json" \
  -H "x-codeium-csrf-token: ${ANTIGRAVITY_CSRF_TOKEN}" \
  -d '{"branch": "feat/parallel-subtask", "path": "../worktrees/parallel-subtask"}'
```

## Step 4: Access the Voice Hub Auxiliary Pane

The plugin hosts a real-time web dashboard inside the Antigravity UI.

- **Direct Auxiliary Pane Link:**
  Inform the user they can view the dashboard by opening:
  `sidecar://antigravity-voice-control/voice-hub/`
- **Dashboard Features:**
  - Handy STT local library detection (`transcribe.dll`, Canary 180M GGUF, Silero VAD)
  - Live transcription telemetry and normalized developer terms
  - Cross-chat routing status and active cascade inspector
  - Dry run / Mute toggle for hands-free safe testing

## Step 5: Security Guardrails

- **Prohibited Calls:** Never call `JetboxWriteState`, `DeletePlugin`, or `InstallCustomization`.
- **Plugin Management:** Provide user links formatted as `[Manage Voice Control](customization://antigravity-voice-control)`.
