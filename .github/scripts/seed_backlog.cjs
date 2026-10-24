/**
 * Seed Backlog Script
 * Creates labels and 12 sequential backlog issues idempotently.
 */
module.exports = async function seedBacklog({ github, context }) {
  const owner = context.repo.owner;
  const repo = context.repo.repo;

  // 1. Configurar etiquetas estándar del autopilot
  const labelsToEnsure = [
    { name: 'estado: finalizado', color: '0E8A16', description: 'Tarea verificada y completada en código' },
    { name: 'estado: en-curso', color: 'FBCA04', description: 'Tarea actualmente en desarrollo' },
    { name: 'estado: por-hacer', color: '1D76DB', description: 'Tarea pendiente en el backlog' },
    { name: 'prioridad: alta', color: 'D93F0B', description: 'Prioridad alta en la arquitectura' },
    { name: 'prioridad: media', color: '0075CA', description: 'Prioridad media' }
  ];

  for (const label of labelsToEnsure) {
    try {
      await github.rest.issues.getLabel({ owner, repo, name: label.name });
      await github.rest.issues.updateLabel({
        owner,
        repo,
        name: label.name,
        color: label.color,
        description: label.description
      });
      console.log(`Etiqueta actualizada: ${label.name}`);
    } catch (e) {
      await github.rest.issues.createLabel({
        owner,
        repo,
        name: label.name,
        color: label.color,
        description: label.description
      });
      console.log(`Etiqueta creada: ${label.name}`);
    }
  }

  // 2. Definición del Backlog Maestro (12 Tareas Secuenciales)
  const backlogTasks = [
    {
      title: 'T01: Core Host Runtime & CDP Port Resolver',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Implementar auto-descubrimiento del puerto de depuración de Electron y cliente WebSocket para ejecución de comandos CDP en el renderer.',
        '',
        '### Criterios de Aceptación',
        '- [x] Resolver de puerto de logs de Antigravity (`framework/core/CdpPortResolver.js`)',
        '- [x] Cliente WebSocket resiliente para Chrome DevTools Protocol (`framework/core/CdpWebSocketClient.js`)',
        '- [x] Pruebas unitarias de resolución y conectividad pasando al 100% (`tests/unit/cdp_port_resolver.test.mjs`, `tests/unit/cdp_client.test.mjs`)'
      ].join('\n')
    },
    {
      title: 'T02: Multi-panel Slot Management & Injection Anchors',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Coordinación de anclas DOM en paneles de conversación de Antigravity (`header-actions`, `status-bar`, `floating-dock`).',
        '',
        '### Criterios de Aceptación',
        '- [x] Registro y resolución de selectores de anclaje (`framework/core/SlotManager.js`)',
        '- [x] Generación de contenedores dinámicos sin colisión DOM',
        '- [x] Pruebas unitarias de gestión de slots (`tests/unit/slot_manager.test.mjs`)'
      ].join('\n')
    },
    {
      title: 'T03: AntigravityMod SDK & Scoped Style Isolator',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Definición del contrato formal de mods y aislamiento estricto de estilos CSS mediante prefijado dinámico para evitar colisiones con el IDE.',
        '',
        '### Criterios de Aceptación',
        '- [x] Clase base y contrato de ciclo de vida (`framework/sdk/AntigravityMod.js`)',
        '- [x] Aislador de CSS con soporte para animaciones keyframes y portales (`framework/sdk/StyleIsolator.js`)',
        '- [x] Pruebas unitarias del SDK y aislamiento CSS (`tests/unit/antigravity_mod.test.mjs`, `tests/unit/style_isolator.test.mjs`)'
      ].join('\n')
    },
    {
      title: 'T04: Mod Host & Mod Loader Engine',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Carga, registro por prioridad y compilación del script consolidado de inyección para múltiples mods simultáneos.',
        '',
        '### Criterios de Aceptación',
        '- [x] Host orquestador del ciclo de vida (`framework/core/ModHost.js`)',
        '- [x] Loader con prevención de duplicados y orden por prioridad (`framework/core/ModLoader.js`)',
        '- [x] Pruebas unitarias de carga y orquestación (`tests/unit/mod_host.test.mjs`, `tests/unit/mod_loader.test.mjs`)'
      ].join('\n')
    },
    {
      title: 'T05: Real-time Transcript & Token Telemetry Service',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Escaneo streaming de logs JSONL (`transcript_full.jsonl`) y clasificación granular de tokens por categoría.',
        '',
        '### Criterios de Aceptación',
        '- [x] Parser reactivo de telemetría de contexto (`framework/services/TelemetryService.js`)',
        '- [x] Clasificación de tokens (user, model, system, tools, thinking)',
        '- [x] Pruebas unitarias de parsing y acumulación (`tests/unit/telemetry_service.test.mjs`)'
      ].join('\n')
    },
    {
      title: 'T06: Context Tachometer UI Mod & Telemetry Popover',
      priority: 'prioridad: media',
      body: [
        '### Objetivo',
        'Velocímetro analógico SVG de 240 grados y popover flotante con desglose de telemetría de contexto en el chat activo.',
        '',
        '### Criterios de Aceptación',
        '- [x] Manifiesto y configuración del mod (`mods/context-tachometer/manifest.json`)',
        '- [x] Componente SVG de aguja y gradiente dinámico (`mods/context-tachometer/components/GaugeSvg.js`)',
        '- [x] Popover flotante con auto-inversión vertical (`mods/context-tachometer/components/PopoverHtml.js`)',
        '- [x] Pruebas unitarias del mod Context Tachometer (`tests/unit/context_tachometer_mod.test.mjs`)'
      ].join('\n')
    },
    {
      title: 'T07: Dynamic Agent Discovery Engine',
      priority: 'prioridad: media',
      body: [
        '### Objetivo',
        'Descubrimiento en tiempo de ejecución de definiciones de agentes (`*.agent.md`, `agent.md`) con extracción de frontmatter y headers.',
        '',
        '### Criterios de Aceptación',
        '- [x] Escáner multi-directorio para agentes locales y globales (`framework/services/AgentDiscoveryService.js`)',
        '- [x] Extracción robusta de frontmatter YAML y títulos markdown',
        '- [x] Pruebas unitarias del motor de descubrimiento (`tests/unit/agent_discovery_service.test.mjs`)'
      ].join('\n')
    },
    {
      title: 'T08: Agent Selector UI Mod & Fedora Badge',
      priority: 'prioridad: media',
      body: [
        '### Objetivo',
        'Insignia en el header con icono fedora + gafas de sol y menú desplegable portal para selección y activación de roles.',
        '',
        '### Criterios de Aceptación',
        '- [x] Manifiesto del mod (`mods/agent-selector/manifest.json`)',
        '- [x] Icono fedora + sunglasses en SVG (`mods/agent-selector/components/AgentIconSvg.js`)',
        '- [x] Menú portal desacoplado del DOM nativo (`mods/agent-selector/components/AgentDropdownHtml.js`)',
        '- [x] Pruebas unitarias del selector de agentes (`tests/unit/agent_selector_mod.test.mjs`)'
      ].join('\n')
    },
    {
      title: 'T09: Unified Build Bundler & Deployment Hook Sync',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Pipeline de empaquetado zero-dep en ESM y sincronización con el directorio global `~/.gemini/config/mods/`.',
        '',
        '### Criterios de Aceptación',
        '- [x] Script de empaquetado de producción (`build.js`)',
        '- [x] Generación de bundle consolidado (`dist/antigravity_mod_loader.mjs`)',
        '- [x] Despliegue automático a `~/.gemini/config/mods/`'
      ].join('\n')
    },
    {
      title: 'T10: Git Workflow, Branch Protection & Atomic Commit Governance',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Reglas de ramas (trunk-based con feature branches), commits atómicos convencionales y plantilla de Pull Request.',
        '',
        '### Criterios de Aceptación',
        '- [x] Documentación oficial del flujo Git (`docs/GIT_WORKFLOW.md`)',
        '- [x] Plantilla de Pull Request con verificación de calidad (`.github/pull_request_template.md`)',
        '- [x] Cero atribución automática / Conventional Commits estricto'
      ].join('\n')
    },
    {
      title: 'T11: Automated CI Pipeline with Node Test Runner',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Configurar workflow de GitHub Actions que ejecute `npm test` en cada push y PR hacia `main`.',
        '',
        '### Criterios de Aceptación',
        '- [x] Workflow de CI configurado en `.github/workflows/ci.yml`',
        '- [x] Ejecución de Node.js test runner nativo contra `tests/unit/*.test.mjs`',
        '- [x] Verificación de paso al 100% de la suite de pruebas'
      ].join('\n')
    },
    {
      title: 'T12: Developer Ergonomics, Mod Templates & Authoring Guide',
      priority: 'prioridad: media',
      body: [
        '### Objetivo',
        'Documentar guía para creación de mods, plantilla boilerplate y script de verificación en vivo.',
        '',
        '### Criterios de Aceptación',
        '- [x] Guía de autoría de mods (`docs/MOD_AUTHORING_GUIDE.md`)',
        '- [x] Plantilla starter para nuevos mods (`mods/template/manifest.json`)',
        '- [x] Script de verificación y smoke testing (`tests/verify_loader.mjs`)'
      ].join('\n')
    },
    {
      title: 'T13: Fix Unmerged Auto Agent Card, Broken Template Imports & Repo Hygiene',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Integrar la tarjeta `Auto (Plan / Build)` (`AUTO_AGENT`) huérfana en `AgentDropdownHtml.js`, corregir los imports rotos (`../../src/sdk/AntigravityMod.js`) en `mods/template/index.js` y `docs/MOD_AUTHORING_GUIDE.md`, alinear versiones `2.0.0` con `manifest.json` y limpiar artefactos ajenos (`apps/scientific_calculator` y `.pyc`).',
        '',
        '### Criterios de Aceptación',
        '- [ ] Incluir `AUTO_AGENT`, icono `auto` y tarjeta `auto-mode-card` en `mods/agent-selector/components/AgentDropdownHtml.js` y `AgentIcons.js`',
        '- [ ] Corregir import en `mods/template/index.js` y `docs/MOD_AUTHORING_GUIDE.md` hacia `../../framework/sdk/AntigravityMod.js`',
        '- [ ] Sincronizar `version: "2.0.0"` en `mods/agent-selector/index.js` y `mods/mods-manager/index.js` con sus `manifest.json`',
        '- [ ] Eliminar `apps/scientific_calculator/` del árbol y endurecer `.gitignore` (`__pycache__/`, `*.pyc`)'
      ].join('\n')
    },
    {
      title: 'T14: Fix ModDaemon Live Telemetry & Git Refresh Deadlock + mountAll Exposure',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Corregir el deadlock de actualización en `ModDaemon.tick()` donde la telemetría y Git Graph quedan congelados tras la primera inyección, y exponer `window.__antigravityMountAll` en `ModLoader.js`.',
        '',
        '### Criterios de Aceptación',
        '- [ ] Asignar `window.__antigravityMountAll = mountAllMods;` en `framework/core/ModLoader.js` para habilitar re-montaje y refresh de Git Graph',
        '- [ ] Actualizar `ModDaemon.checkInjected()` para verificar salud integral de los slots activos sin depender exclusivamente de `.antigravity-tachometer-badge`',
        '- [ ] Implementar `refreshTelemetry()` / sincronización periódica en `ModDaemon.tick()` cuando el estado es `injected` para mantener tokens y commits en vivo',
        '- [ ] Pruebas unitarias en `tests/unit/mod_daemon.test.mjs` verificando la actualización periódica y exposición de `__antigravityMountAll`'
      ].join('\n')
    },
    {
      title: 'T15: Complete GitGraphMod Integration in Host, ModsManager, Visibility & Release Packaging',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Integrar `GitGraphMod` de extremo a extremo en `framework/host.js`, `ModsManagerMod` (switch de visibilidad), `ModLoader` (`__applyModsVisibility`), `framework/index.js` y `tools/package_release.mjs`.',
        '',
        '### Criterios de Aceptación',
        '- [ ] Unificar `framework/host.js` usando `createDefaultHost()` para incluir `GitGraphMod`',
        '- [ ] Agregar tarjeta y switch `id="mod-toggle-git-graph"` en `mods/mods-manager/components/ModsManagerHtml.js` y sincronizar visibilidad en `ModLoader.js`',
        '- [ ] Incluir `git-graph` en `tools/package_release.mjs` y exportar `GitService` y `AgentSyncServer` en `framework/index.js`',
        '- [ ] Actualizar pruebas en `tests/unit/mods_manager_mod.test.mjs`'
      ].join('\n')
    },
    {
      title: 'T16: Fix DOM XSS in Git Inspector & Agent Dropdown + Preserve Inspector Metadata',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Sanitizar todas las interpolaciones HTML/atributos en el inspector de commits de `GitGraphMod` y en las tarjetas dinámicas de `AgentSelectorMod`, preservando el email del autor y el enlace `View Commit ↗` al seleccionar cualquier commit.',
        '',
        '### Criterios de Aceptación',
        '- [ ] Agregar `escapeHtml()` en `mods/agent-selector/components/AgentDropdownHtml.js` para nombres, roles y atributos `title` de agentes descubiertos',
        '- [ ] Incluir `data-email` y `data-commit-url` en `.git-commit-row` dentro de `mods/git-graph/components/GitGraphPanelHtml.js`',
        '- [ ] Sanitizar el renderizado dinámico de `#antigravity-git-inspector` en `ModLoader.js` conservando email y link a GitHub',
        '- [ ] Pruebas unitarias de sanitización XSS en `tests/unit/git_graph_mod.test.mjs` y `tests/unit/agent_selector_mod.test.mjs`'
      ].join('\n')
    },
    {
      title: 'T17: Fix Multi-Panel Split-View Bugs, Duplicate DOM IDs & Tachometer Popover Collision',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Corregir la colisión de métricas en `__updateAntigravityTelemetry` con múltiples paneles abiertos, extraer `getGaugeMetrics()` sin duplicar IDs SVG, evitar el reseteo de estado del portal de agentes y permitir actualización de contenido en `SlotManager`.',
        '',
        '### Criterios de Aceptación',
        '- [ ] Verificar `portal.__currentBadge === badge` antes de re-renderizar `#antigravity-tachometer-popover-portal` en `ModLoader.js`',
        '- [ ] Extraer y exportar `getGaugeMetrics(pct)` en `mods/context-tachometer/components/GaugeSvg.js` y reutilizarlo en `PopoverHtml.js` y `ModLoader.js`',
        '- [ ] Actualizar `SlotManager.js` con hash de contenido (`data-render-hash`) para permitir refrescar templates cuando cambian los datos del host',
        '- [ ] Preservar el estado abierto del drawer y tab activo en `#antigravity-agent-dropdown-portal` durante `mountAllMods()`'
      ].join('\n')
    },
    {
      title: 'T18: Fix StyleIsolator @media Query Scoping Leakage & Generic Portal Selectors',
      priority: 'prioridad: media',
      body: [
        '### Objetivo',
        'Aislar recursivamente los selectores internos de bloques `@media` en `StyleIsolator.scopeCss` para evitar fugas globales de CSS y reemplazar la lista hardcodeada de clases por reglas genéricas de portal.',
        '',
        '### Criterios de Aceptación',
        '- [ ] Implementar scoping recursivo dentro de bloques `@media` en `framework/sdk/StyleIsolator.js` (manteniendo `@keyframes` intactos)',
        '- [ ] Soportar selectores de portal de forma genérica (`[data-mod-portal]`, `-portal`) sin depender de nombres de mods fijos',
        '- [ ] Agregar pruebas unitarias para `@media` scoping en `tests/unit/style_isolator.test.mjs`'
      ].join('\n')
    },
    {
      title: 'T19: Optimize TelemetryService & AgentDiscoveryService with mtime/TTL Caching',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Eliminar el cuello de botella $O(C \\times L)$ de lectura síncrona en `TelemetryService.getAllMetrics()` mediante caché por `mtimeMs`/`size` y evitar que `AgentDiscoveryService` escanee directorios pesados como `scratch/` y `tests/`.',
        '',
        '### Criterios de Aceptación',
        '- [ ] Implementar caché en memoria (`this.cache`) por `filePath`, `mtimeMs` y `size` en `framework/services/TelemetryService.js` y eliminar `JSON.stringify(obj.tool_calls)`',
        '- [ ] Excluir `scratch`, `tests`, `apps`, `__pycache__` y `.playwright-mcp` en `framework/services/AgentDiscoveryService.js` y añadir caché con TTL',
        '- [ ] Pruebas unitarias de caché en `tests/unit/telemetry_service.test.mjs` y `tests/unit/agent_discovery_service.test.mjs`'
      ].join('\n')
    },
    {
      title: 'T20: Optimize GitService Subprocesses, Dynamic Workspace Resolution & AgentSyncServer Unref',
      priority: 'prioridad: alta',
      body: [
        '### Objetivo',
        'Reducir los subprocesos bloqueantes `execSync("git ...")` en `GitService`, memoizar avatares MD5, permitir resolución de workspace activo y evitar que `AgentSyncServer` bloquee la salida de procesos one-shot.',
        '',
        '### Criterios de Aceptación',
        '- [ ] Consolidar `getGitStatus()` con `git status --porcelain -b`, cachear `getGitHubMetadata()` por repositorio y memoizar `computeAvatarUrl()` con `this.avatarCache` en `framework/services/GitService.js`',
        '- [ ] Llamar `this.server.unref()` en `framework/services/AgentSyncServer.js` y limitar el tamaño máximo de payload en `POST /active-agent`',
        '- [ ] Pruebas unitarias en `tests/unit/git_service.test.mjs` y `tests/unit/agent_sync_server.test.mjs`'
      ].join('\n')
    },
    {
      title: 'T21: Throttle MutationObserver & ResizeObserver + Single-Pass CDP Evaluation',
      priority: 'prioridad: media',
      body: [
        '### Objetivo',
        'Eliminar el DOM thrashing durante el streaming de tokens en `MutationObserver` y `ResizeObserver`, vigilar todos los slots activos y reducir a una sola evaluación CDP por despacho en `ModHost`.',
        '',
        '### Criterios de Aceptación',
        '- [ ] Cortocircuitar `MutationObserver` al inicio cuando `mountDebounce` está activo y verificar también `aux-pane-new-tab-button` y `.shrink-0 > .bg-sidebar` en `framework/core/ModLoader.js`',
        '- [ ] Usar `entry.contentRect.width` en `ResizeObserver` para evitar forced synchronous reflow (`offsetWidth`)',
        '- [ ] Consolidar la lectura de `__antigravity_selected_agents_map` dentro del retorno de la evaluación principal en `framework/core/ModHost.js` y eliminar el doble `probePort` en `ModDaemon.tick()`'
      ].join('\n')
    },
    {
      title: 'T22: Decouple Mod Client Scripts from ModLoader, Optimize Bundle Shim & Add Architecture Fitness Tests',
      priority: 'prioridad: media',
      body: [
        '### Objetivo',
        'Eliminar los imports directos desde `framework/core/ModLoader.js` hacia `mods/`, activar los hooks de ciclo de vida (`onInit`, `onUpdate`, `script`), convertir `update_ui_badge.mjs` en un shim ligero y crear Fitness Tests de arquitectura.',
        '',
        '### Criterios de Aceptación',
        '- [ ] Eliminar los `import` estáticos hacia `../../mods/*` en `framework/core/ModLoader.js` e inyectar los helpers a través del contrato de cada mod',
        '- [ ] Invocar `onInit` / `onUpdate` con aislamiento `try/catch` por mod en `ModHost.js`',
        '- [ ] Eliminar `AgentIconSvg.js` muerto del bundle en `build.js` y generar `dist/update_ui_badge.mjs` como shim ligero',
        '- [ ] Crear `tests/unit/architecture_fitness.test.mjs` validando fronteras hexagonales, paridad de `manifest.json` y ejecución DOM en `vm`'
      ].join('\n')
    }
  ];

  // 3. Crear Issues de forma 100% idempotente
  const existingIssues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'all'
  });

  const existingMap = new Map();
  for (const issue of existingIssues) {
    existingMap.set(issue.title.trim().toLowerCase(), issue);
  }

  for (const task of backlogTasks) {
    const taskKey = task.title.trim().toLowerCase();
    if (existingMap.has(taskKey)) {
      console.log(`Tarea ya existe en el backlog: ${task.title}`);
      continue;
    }

    const created = await github.rest.issues.create({
      owner,
      repo,
      title: task.title,
      body: task.body,
      labels: ['estado: por-hacer', task.priority]
    });
    console.log(`Issue creado: #${created.data.number} - ${task.title}`);
  }
};
