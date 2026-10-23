# Git Workflow: Ramas con Alcance y Commits Atómicos

Esta regla es obligatoria para la gestión de control de versiones con Git en este repositorio.

## 1. Estrategia de Ramas Obligatoria
- Nunca desarrollar directamente en `main` ni mezclar tareas en una misma rama.
- Toda tarea debe tener su propia rama corta de funcionalidad (*short-lived branch*).
- Formato estructurado obligatorio:
  ```text
  <tipo>/<alcance>-<descripcion-kebab-case>
  ```
  **Tipos:** `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `style`  
  **Alcances:** `framework`, `core`, `mods`, `tests`, `dist`, `ci`, `docs`

## 2. Invariantes de Commits Atómicos
1. **Un solo propósito indivisible:** Cada commit debe contener un único cambio lógico. No mezclar refactor con corrección de bugs ni estilos con lógica de negocio.
2. **Repositorio siempre funcional (Zero Broken Commits):** Cada commit intermedio debe compilar y pasar la suite de pruebas unitarias (`npm test`). Prohibido commitear estados rotos.
3. **Formato Conventional Commits (v1.0.0):**
   ```text
   <tipo>(<alcance>): <descripción imperativa en minúsculas sin punto final>
   ```
4. **Cero atribución de IA:** Prohibido incluir `Co-Authored-By` o cualquier atribución a herramientas de IA en commits o PRs.
