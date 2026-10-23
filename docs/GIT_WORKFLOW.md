# Git Workflow & Commit Governance

Este documento define la política oficial de ramas y commits atómicos para el proyecto **Mods Antigravity 2.0 (`mods-antigravity2.0`)**.

---

## 1. Reglas de Ramas (Branching Strategy)

Seguimos un modelo **Trunk-Based Development** asistido por ramas cortas de funcionalidad (*short-lived feature branches*).

### 1.1 Rama Principal (`main`)
* `main` representa siempre un estado desplegable, estable y probado en producción.
* Ningún cambio entra directamente a `main` sin pasar por la suite de pruebas unitarias (`npm test`).
* Los merges a `main` se realizan tras verificación técnica y revisión de cambios.

### 1.2 Convención de Nombres de Ramas
Toda rama de trabajo debe crearse a partir de `main` y utilizar el formato de prefijo con descripción en minúsculas separada por guiones (`kebab-case`):

| Prefijo | Propósito | Ejemplo |
| :--- | :--- | :--- |
| `feat/` | Nueva funcionalidad, componente o mod | `feat/agent-discovery-engine` |
| `fix/` | Corrección de bug o comportamiento anómalo | `fix/popover-z-index-clipping` |
| `refactor/` | Reestructuración de código sin alterar comportamiento | `refactor/cdp-socket-reconnect` |
| `perf/` | Optimización de rendimiento o memoria | `perf/throttle-dom-mutations` |
| `test/` | Adición o corrección de pruebas automatizadas | `test/style-isolator-keyframes` |
| `docs/` | Cambios exclusivos en documentación o especificaciones | `docs/git-workflow-rules` |
| `chore/` | Tareas de mantenimiento, CI/CD, dependencias o tooling | `chore/seed-project-backlog` |

### 1.3 Ciclo de Vida de una Rama
1. Actualizar `main`: `git checkout main && git pull origin main`
2. Crear la rama de trabajo: `git checkout -b <tipo>/<nombre-descriptivo>`
3. Desarrollar aplicando commits atómicos verificados.
4. Validar que la suite de pruebas pase al 100%: `npm test`
5. Integrar a `main` mediante Pull Request o merge fast-forward limpio.
6. Eliminar la rama local y remota tras la integración exitosa.

---

## 2. Reglas de Commits Atómicos (Atomic Commits)

Un commit atómico representa **una única unidad lógica de cambio completa e indivisible**.

### 2.1 Invariantes Fundamentales
1. **Un solo propósito:** Si la descripción del commit requiere la conjunción "y" para explicar dos tareas no relacionadas, debe dividirse en dos commits independientes.
2. **Repositorio siempre funcional (Zero Broken Commits):** Cada commit en el historial debe compilar y pasar la suite de pruebas unitarias (`npm test`). Nunca commitear estados rotos como "checkpoint intermedio".
3. **Formato Conventional Commits (v1.0.0):** Estructura obligatoria:
   ```
   <tipo>(<alcance>): <descripción imperativa en minúsculas sin punto final>

   [cuerpo opcional: explica el POR QUÉ y las compensaciones técnicas, no el qué]

   [pie opcional: referencias a issues, ej. Closes #12]
   ```
4. **Cero Atribución de IA:** Prohibido incluir `Co-Authored-By` o menciones promocionales de IA en mensajes de commit o descripciones de Pull Request.

### 2.2 Tipos Permitidos
* `feat`: Nueva característica para el usuario o consumidor del SDK.
* `fix`: Corrección de un fallo o regresión.
* `docs`: Documentación únicamente.
* `style`: Formateo, espacios, punto y coma (sin cambios lógicos).
* `refactor`: Cambio de código que no corrige un bug ni añade una funcionalidad.
* `perf`: Mejora de rendimiento.
* `test`: Añadir o corregir pruebas existentes.
* `build`: Cambios que afectan al sistema de compilación (`build.js`, `package.json`).
* `ci`: Configuración de GitHub Actions o scripts de integración continua.
* `chore`: Actualización de herramientas auxiliares o configuración de proyecto.

### 2.3 Ejemplo de Flujo Atómico
* Correcto:
  - Commit 1: `test(cdp): add test for web socket timeout retry`
  - Commit 2: `fix(cdp): implement exponential backoff on connection timeout`
  - Commit 3: `docs(cdp): document retry parameters in host architecture`
* Incorrecto:
  - `git commit -m "update cdp client and docs and fix bug"` (Violación de atomicidad).
