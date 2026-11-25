# Antigravity Global Voice Control & App-Level Architecture

## 1. Chat-Scoped Tools vs. App-Scoped Sidecars

Understanding the architectural distinction between chat-scoped tools and app-scoped sidecars is essential for scalable orchestration in Antigravity:

- **Chat-Scoped Tools:** Tools such as `run_command`, `read_file`, `write_file`, and MCP tools execute inside the isolated lifecycle of an individual conversation or cascade. Every invocation consumes tokens in that conversation's context window.
- **App-Scoped Sidecars:** Sidecars are long-running daemon processes managed directly by Antigravity at the application level. They operate independently of any single conversation, persist across session reloads, and can render dedicated auxiliary panes (`SIDECAR_UI_ENTRYPOINT_AUX_PANE`).
- **Zero-Pollution Cross-Chat Routing:** The Antigravity Voice Control sidecar captures real-time microphone audio, transcribes it locally via Handy STT (`transcribe.dll` + Canary 180M), and routes commands targeting other conversations (for example, *"In chat hollow_vector run unit tests"*) directly through the Language Server Connect RPC. This dispatches the instruction into the target cascade without consuming a single token or polluting the context of the user's active implementation chat.

## 2. Sanctioned LanguageServerService Connect RPCs

Antigravity exposes local HTTP Connect RPC endpoints at:
`http://${ANTIGRAVITY_LS_ADDRESS}/exa.language_server_pb.LanguageServerService/<Method>`
with the mandatory security header:
`x-codeium-csrf-token: ${ANTIGRAVITY_CSRF_TOKEN}`

The sanctioned RPC methods for global orchestration are:

| Method Name | Purpose |
| :--- | :--- |
| `GetAllCascadeTrajectories` | Inspect all open conversations, trajectories, and workspace threads. |
| `StartCascade` | Start a new conversation or cascade session programmatically. |
| `SendUserCascadeMessage` | Dispatch a user prompt directly into a specific cascade by `cascadeId`. |
| `SendActionToChatPanel` | Post UI actions, notifications, or status changes to the chat panel. |
| `SmartFocusConversation` | Focus or switch active UI view to a specified conversation. |
| `CancelCascadeInvocation` | Interrupt or stop execution in an active cascade. |
| `CreateTerminal` | Open an integrated terminal session with a specified working directory (`cwd`). |
| `SendTerminalInput` | Transmit keyboard input or commands to a running terminal. |
| `CloseTerminal` | Terminate and dispose of an integrated terminal. |
| `CreateWorktree` | Provision a new isolated Git worktree for parallel agent workflows. |
| `CheckoutWorktree` | Switch between worktrees or branches. |
| `GetAvailableModels` | Enumerate available model configurations and capabilities. |

## 3. Strict Security Guardrails

Agents and subprocesses must adhere to strict security guardrails regarding state mutation:

1. **Restricted RPCs:** Under NO circumstances should any agent, script, or MCP tool call:
   - `JetboxWriteState`
   - `DeletePlugin`
   - `InstallCustomization`
   Any attempt to call these endpoints from subprocesses throws a `RestrictedRpcError` and is strictly forbidden.
2. **Configuration Integrity:** Never edit `~/.gemini/config/config.json` directly from code or shell commands. Direct writes bypass atomic locking and risk clobbering concurrent permission grants, settings, and live reloads.
3. **UI Link Protocol:** Always provide user-facing markdown links using the sanctioned scheme:
   - Direct plugin management: `[Manage Voice Control](customization://antigravity-voice-control)`
   - Marketplace plugins: emit `<plugin-card catalog-id="<catalog-id>"></plugin-card>` on its own line.
   - Never use invalid protocols such as `plugin://` or `plugins://`.
