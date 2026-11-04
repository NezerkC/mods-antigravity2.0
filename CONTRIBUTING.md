# Contributing Guidelines

Thank you for your interest in contributing to `mods-antigravity2.0`! This repository enforces enterprise-grade engineering standards to ensure high reliability, modularity, and security when interacting with the Google Antigravity desktop application.

---

## 1. Development Principles

- **Zero Runtime Dependencies**: The core runtime and mod framework rely strictly on standard Node.js APIs (`http`, `fs`, `path`, `events`, `child_process`) and standard browser/DOM APIs. Do not introduce external npm dependencies into the runtime.
- **Clean Architecture & Decoupling**: Keep UI mods (`mods/`) isolated from framework services (`framework/`). Mods communicate through the public lifecycle methods of `AntigravityMod`.
- **Strict Defensive Execution**: All DOM injections and network bindings must be resilient against crashes, page reloads, and malformed telemetry.

---

## 2. Branching Strategy

- **Never commit directly to `main`**.
- Every unit of work must originate from a short-lived branch branched from `main`.
- Branch naming format:
  ```text
  <type>/<scope>-<kebab-case-description>
  ```
  - **Allowed Types**: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `style`
  - **Allowed Scopes**: `framework`, `core`, `mods`, `tests`, `dist`, `ci`, `docs`
  - **Examples**:
    - `feat/mods-voice-assistant-tts`
    - `fix/core-cdp-port-discovery`
    - `refactor/framework-telemetry-service`

---

## 3. Commit Convention & Governance

- **Atomic Commits**: Exactly one logical change per commit.
- **Conventional Commits**: Format commit messages in lowercase imperative mood without trailing periods:
  ```text
  <type>(<scope>): <short summary in imperative mood>
  ```
  - Examples:
    - `feat(mods): add context tachometer popover portal`
    - `fix(core): prevent mutation observer cycle in slot manager`
    - `test(tests): add e2e functional coverage for agent sync`
- **Zero AI Attribution Policy**: Never include `Co-Authored-By` or AI attribution trailers in commit messages or pull requests.
- **Zero Broken Commits**: Every commit in the git history must successfully pass the test suite (`npm test`).

---

## 4. Local Development & Testing

### Prerequisites
- Node.js v18 or higher (ES Modules required).

### Commands
```bash
# Run complete test suite (unit + functional)
npm test

# Run unit tests only
npm run test:unit

# Run functional integration tests only
npm run test:functional

# Compile and bundle mod distributions
npm run build

# Run live diagnostics probe
npm run probe
```

---

## 5. Pull Request Checklist

Before submitting a Pull Request:
1. Ensure `npm test` passes with 100% success rate (all tests green).
2. Ensure new features or bug fixes include corresponding unit or functional tests in `tests/`.
3. Verify that changes to UI mods do not inject unsanitized HTML (comply with `SECURITY.md`).
4. Rebase against the latest `main` branch before requesting review.
