# Git Workflow & Atomic Commits Governance

## 1. Branching Strategy
- Do not commit directly to `main`.
- Every unit of work must have its own short-lived feature/fix/refactor branch.
- Branch naming convention: `<type>/<scope>-<kebab-case-description>`
  - Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `style`
  - Scopes: `framework`, `core`, `mods`, `tests`, `dist`, `ci`, `docs`

## 2. Atomic Commits Policy
- **Single Responsibility:** Exactly one logical change per commit.
- **Zero Broken Commits:** Every commit must pass all tests (`npm test`).
- **Conventional Commits:** `<type>(<scope>): <imperative summary in lowercase without trailing period>`.
- **Zero AI Attribution:** Never add `Co-Authored-By` or AI attribution markers.
