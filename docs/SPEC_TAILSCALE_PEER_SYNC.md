# Project: Tailscale Peer Sync Daemon

## Architecture
- **Language / Runtime**: Pure Node.js ECMAScript Modules (ESM, Node v20+). Zero external npm dependencies.
- **Network Layer**: Native `node:http`. Strict zero-trust binding to local Tailscale IPv4 (`100.x.y.z`) and/or `127.0.0.1`. Binding to `0.0.0.0` or wildcard interfaces is strictly prohibited and guarded via `assertValidBindHost()`. Defense-in-depth socket inspection on `req.socket.remoteAddress` rejects non-Tailscale / non-loopback connections with 403 Forbidden.
- **Tailscale Discovery**: `TailscaleDiscoveryService` with dual-path resolution: primary via `tailscale status --json` (with binary resolution across Windows / Linux) and fallback via `os.networkInterfaces()` validating RFC 6598 Carrier-Grade NAT prefix `100.64.0.0/10` via `/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.\d{1,3}\.\d{1,3}$/`.
- **Pairing & Security Layer**: `PeerAuthService` with:
  - Ephemeral single-use pairing codes: 8-character uppercase hex with hyphen (`XXXX-XXXX`), 300-second TTL, constant-time validation (`crypto.timingSafeEqual`), immediate consumption upon pairing.
  - Persistent peer credentials: 256-bit cryptographically secure Bearer tokens (`crypto.randomBytes(32)`), stored as SHA-256 hashes in `%USERPROFILE%\.gemini\config\mods\peer_sync_peers.json`.
  - HTTP authentication middleware verifying `Authorization: Bearer <token>`, returning 401 Unauthorized for missing or invalid tokens.
- **Chat Storage & Session Transport Layer**: `PeerChatSessionService` reading from:
  - Metadata: `~/.gemini/antigravity/conversation_summaries.db` (table `conversation_summaries` with `workspace_uris` JSON) with fallback to directory scanning under `~/.gemini/antigravity/brain/`.
  - Transcripts: `~/.gemini/antigravity/brain/<conversationId>/.system_generated/logs/transcript.jsonl` (compact) and `transcript_full.jsonl` (full).
  - Path normalizer handling URL encoding, drive letter case, and slashes.
- **Daemon Service & CLI**: Integrated in `framework/daemon.js` and `framework/services/WindowsDaemonService.js` supporting `--peer-sync`, `--pair-code`, `--start`, `--stop`, `--status`.
- **Test Infrastructure**: Native Node.js test runner (`node --test tests/unit/*.test.mjs`) passing `npm test`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Branch Governance & Plan | Create branch `feat/framework-tailscale-peer-sync`, write `docs/PLAN-tailscale-peer-sync.md`, leave root `PLAN.md` untouched, conventional commits with zero AI markers | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Tailscale IP Resolution | Resolve local host Tailscale IPv4 (`100.x.y.z`) via `tailscale status --json` and `os.networkInterfaces()` RFC 6598 CGNAT filter | M2 | ORIGINAL_REQUEST §R3 |
| 3 | Zero-Trust Host Binding Guard | Reject `0.0.0.0`, `::`, or foreign LANs; allow only Tailscale IPv4 and `127.0.0.1`; socket remoteAddress filter | M2 | ORIGINAL_REQUEST §R3 |
| 4 | Single-Use Pairing Code Gen & TTL | CLI/API generation of 8-char pairing code with 300s TTL; rejection of expired codes | M3 | ORIGINAL_REQUEST §R2 |
| 5 | Single-Use Code Consumption & Replay Defense | Constant-time validation, mark consumed on first handshake, reject reused codes | M3 | ORIGINAL_REQUEST §R2 |
| 6 | Persistent Peer Token Auth | Generate 256-bit Bearer token on pairing, store SHA-256 hash in config, require on all requests (401/403 on invalid) | M3 | ORIGINAL_REQUEST §R2 |
| 7 | Project-Indexed Chat Querying | Query and group sessions by workspace path from DB/brain storage, normalize paths | M4 | ORIGINAL_REQUEST §R4 |
| 8 | Transcript Transport Endpoint | Expose endpoint returning `transcript.jsonl` and `transcript_full.jsonl` contents for sessions | M4 | ORIGINAL_REQUEST §R4 |
| 9 | Daemon CLI & Service Integration | Integrate peer sync server into `framework/daemon.js` CLI commands and Windows daemon lifecycle | M5 | ORIGINAL_REQUEST §R2, §R3 |
| 10 | Automated Test Suite & E2E Verification | Comprehensive test suites passing `npm test`, zero regressions, 100% E2E test pass | M5 | ORIGINAL_REQUEST Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Governance & Plan | Branch `feat/framework-tailscale-peer-sync`, `docs/PLAN-tailscale-peer-sync.md`, root `PLAN.md` untouched | none | DONE |
| 2 | M2: Tailscale & Zero-Trust Networking | `TailscaleDiscoveryService`, `PeerSyncServer` host binding guard, zero-trust network tests | M1 | DONE |
| 3 | M3: Pairing Handshake & Auth | `PeerAuthService`, single-use pairing codes, Bearer token store, pairing & auth HTTP endpoints and unit tests | M1 | DONE |
| 4 | M4: Chat Storage & Session Transport | `PeerChatSessionService`, workspace path normalizer, transcript streaming/fetch endpoints and unit tests | M1 | DONE |
| 5 | M5: Daemon Integration & Final Verification | Daemon CLI integration (`framework/daemon.js`), E2E test pass, Tier 5 adversarial hardening, Forensic Audit | M2, M3, M4 | DONE |

## Interface Contracts

### TailscaleDiscoveryService ↔ PeerSyncServer
- `resolveLocalTailscaleIp(options)` -> `Promise<string | null>`: Returns IPv4 string matching `100.64.0.0/10` or null if inactive/offline.
- `assertValidBindHost(host, localTailscaleIp)` -> `void`: Throws `Error('Security Violation: ...')` if host is `0.0.0.0`, `::`, or neither `127.0.0.1` nor `localTailscaleIp`.

### PeerAuthService ↔ PeerSyncServer
- `generatePairingCode(ttlSeconds = 300)` -> `{ code: string, expiresAt: number }`
- `pairWithCode(candidateCode, peerMetadata = {})` -> `Promise<{ success: boolean, token?: string, peerId?: string, error?: string }>`
- `verifyPeerToken(token)` -> `boolean`: Constant-time comparison of SHA-256 token against stored peer hashes.
- `authMiddleware(req, res)` -> `boolean`: Checks `Authorization: Bearer <token>`, returns true if valid, sends 401 and returns false if missing/invalid.

### PeerChatSessionService ↔ PeerSyncServer
- `listWorkspaces()` -> `Promise<Array<{ workspacePath: string, projectName: string, sessionCount: number, lastModified: string }>>`
- `listSessions(options: { workspace?: string, rootOnly?: boolean })` -> `Promise<Array<{ conversationId: string, title: string, stepCount: number, lastModified: string, workspacePath: string, parentConversationId: string }>>`
- `getTranscript(conversationId: string, options: { full?: boolean })` -> `Promise<{ exists: boolean, conversationId: string, lines: Array<object>, isFull: boolean }>`

### HTTP API Endpoints (`PeerSyncServer`)
- `POST /api/peers/pair`: Body `{ code: string, peerName?: string }`. Returns `{ success: true, token: string, peerId: string }` or 400/401 with error message.
- `GET /api/peers/health`: Authenticated. Returns `{ status: 'ok', node: string, version: string, tailscaleIp: string }`.
- `GET /api/peers/workspaces`: Authenticated. Returns `{ workspaces: [...] }`.
- `GET /api/peers/sessions?workspace=<path>&rootOnly=<bool>`: Authenticated. Returns `{ sessions: [...] }`.
- `GET /api/peers/sessions/:conversationId`: Authenticated. Returns `{ session: {...} }`.
- `GET /api/peers/sessions/:conversationId/transcript?full=<bool>`: Authenticated. Returns `{ conversationId, lines: [...] }`.

## Code Layout
- `docs/PLAN-tailscale-peer-sync.md` — Architectural plan and governance document.
- `framework/services/TailscaleDiscoveryService.js` — Tailscale CLI resolution, status parser, RFC 6598 IP validator.
- `framework/services/PeerAuthService.js` — Pairing code generator, lifecycle tracker, token generator, constant-time validator, peer storage.
- `framework/services/PeerChatSessionService.js` — Brain SQLite & directory reader, workspace normalizer, transcript serializer.
- `framework/services/PeerSyncServer.js` — Zero-trust HTTP server, host binding guard, auth middleware, REST routing.
- `framework/daemon.js` — CLI extensions for peer sync service, pairing code generator, daemon background lifecycle.
- `tests/unit/tailscale_discovery_service.test.mjs` — Unit tests for Tailscale CLI resolution and IP parsing.
- `tests/unit/peer_sync_server.test.mjs` — Unit tests for host binding security (rejection of 0.0.0.0), routing, network guards.
- `tests/unit/peer_auth_service.test.mjs` — Unit tests for pairing code lifecycle, replay prevention, token authentication.
- `tests/unit/peer_chat_session_service.test.mjs` — Unit tests for workspace indexing, path normalization, transcript extraction.
- `tests/unit/peer_sync_e2e.test.mjs` — Full integration tests across pair handshake, auth token verification, and chat query transport.
