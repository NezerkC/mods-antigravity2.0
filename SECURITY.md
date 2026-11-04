# Security Policy

## Supported Versions

Security updates and patches are actively maintained for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

---

## Reporting a Vulnerability

We take the security of `mods-antigravity2.0` and its host runtime seriously. If you discover a potential vulnerability, please **do not create a public issue**.

Instead, report it responsibly via:
- **GitHub Private Vulnerability Reporting**: Submit a private advisory via the Security tab on [GitHub](https://github.com/NezerkC/mods-antigravity2.0/security/advisories/new).
- **Maintainer Email**: Contact Victor Manuel Martinez Munoz at `lolplayer.vmmm@gmail.com`.

You can expect:
1. **Initial Acknowledgment**: Within 48 hours of report receipt.
2. **Assessment & Triage**: Confirmation and severity assessment within 5 business days.
3. **Patch & Coordinated Disclosure**: A security patch release accompanied by a CVE identifier where applicable.

---

## Threat Model & Security Architecture

`mods-antigravity2.0` injects UI components and telemetry observers into Google Antigravity 2.0 (Electron desktop environment) via the Chrome DevTools Protocol (CDP). Because modifying an Electron runtime carries distinct security considerations, the framework enforces strict architectural boundaries:

### 1. Loopback CDP Isolation
- **Strict Localhost Binding**: The CDP discovery client (`CdpPortResolver`) and WebSocket transport (`CdpWebSocketClient`) bind exclusively to loopback addresses (`127.0.0.1` / `localhost`). Remote network probes or unauthenticated external CDP bridges are strictly rejected.
- **Port Discovery Validation**: HTTP verification against `/json/version` validates authentic Chromium DevTools endpoints prior to establishing WebSocket handshakes.

### 2. XSS Mitigation & Input Sanitization
- **Strict Output Encoding**: Dynamic metadata (agent names, conversation telemetry, git commit messages, author avatars, and CI/CD status payloads) must pass through HTML escaping and sanitization routines (`TextSanitizer.js`) prior to DOM insertion.
- **No Direct Arbitrary Code Execution**: Custom mods are restricted to predefined DOM slot containers managed by `SlotManager`. Script evaluation via CDP is scoped to container lifecycle hooks.

### 3. IPC & Agent Sync Server Boundary
- **Payload Limits**: The embedded `AgentSyncServer` enforces a hard limit of 64 KB on all incoming HTTP POST requests (`/active-agent`, `/active-agent/modifier`), rejecting oversized payloads with HTTP 413 to prevent memory exhaustion and buffer starvation.
- **Loopback Only**: Server sockets are bound to `127.0.0.1` with unreferenced handles (`server.unref()`) to prevent persistent daemon locking or external interface exposure.

### 4. DOM Lifecycle & Memory Leak Prevention
- **Defensive Mutation Observers**: `ModLoader` observer routines employ cycle-detection algorithms (e.g., parent traversal checks) to eliminate DOM thrashing and infinite self-referential trigger loops.
- **Style Isolation**: All injected stylesheets are strictly scoped using `StyleIsolator` to avoid leaking styles into native Electron UI layers or hijacking application controls.
