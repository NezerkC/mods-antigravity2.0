# ==============================================================================
# GitHub Projects Autopilot - Asistente Local de Progreso
# Compatible con Windows PowerShell 5.1 y PowerShell 7+
# ==============================================================================

$OutputEncoding = [System.Text.Encoding]::UTF8

$root = $PSScriptRoot
if (-not $root) {
    $root = Get-Location
}

function Test-TaskPath {
    param([string]$RelativePath)
    $full = Join-Path $root $RelativePath
    return (Test-Path $full)
}

# Definicion de las 12 Tareas Secuenciales y Verificables
$tasks = @(
    @{
        Id = "T01"
        Title = "Core Host Runtime & CDP Port Resolver"
        Done = (Test-TaskPath "framework\core\CdpPortResolver.js") -and (Test-TaskPath "tests\unit\cdp_port_resolver.test.mjs")
        Tip = "Implementar auto-descubrimiento del puerto de Electron y cliente WebSocket para CDP."
    },
    @{
        Id = "T02"
        Title = "Multi-panel Slot Management & Injection Anchors"
        Done = (Test-TaskPath "framework\core\SlotManager.js") -and (Test-TaskPath "tests\unit\slot_manager.test.mjs")
        Tip = "Implementar SlotManager para coordinar anclas DOM en paneles de chat activos y header."
    },
    @{
        Id = "T03"
        Title = "AntigravityMod SDK & Scoped Style Isolator"
        Done = (Test-TaskPath "framework\sdk\AntigravityMod.js") -and (Test-TaskPath "framework\sdk\StyleIsolator.js") -and (Test-TaskPath "tests\unit\style_isolator.test.mjs")
        Tip = "Definir contrato base AntigravityMod y aislamiento CSS con prefijado dinamico."
    },
    @{
        Id = "T04"
        Title = "Mod Host & Mod Loader Engine"
        Done = (Test-TaskPath "framework\core\ModHost.js") -and (Test-TaskPath "framework\core\ModLoader.js") -and (Test-TaskPath "tests\unit\mod_loader.test.mjs")
        Tip = "Implementar ModHost y ModLoader para registrar, ordenar por prioridad y compilar payload."
    },
    @{
        Id = "T05"
        Title = "Real-time Transcript & Token Telemetry Service"
        Done = (Test-TaskPath "framework\services\TelemetryService.js") -and (Test-TaskPath "tests\unit\telemetry_service.test.mjs")
        Tip = "Construir TelemetryService con escaneo streaming de JSONL y clasificacion de tokens."
    },
    @{
        Id = "T06"
        Title = "Context Tachometer UI Mod & Telemetry Popover"
        Done = (Test-TaskPath "mods\context-tachometer\manifest.json") -and (Test-TaskPath "mods\context-tachometer\components\GaugeSvg.js") -and (Test-TaskPath "tests\unit\context_tachometer_mod.test.mjs")
        Tip = "Desarrollar velocimetro analogo SVG y popover flotante con metricas de contexto."
    },
    @{
        Id = "T07"
        Title = "Dynamic Agent Discovery Engine"
        Done = (Test-TaskPath "framework\services\AgentDiscoveryService.js") -and (Test-TaskPath "tests\unit\agent_discovery_service.test.mjs")
        Tip = "Crear motor de descubrimiento de agentes markdown con extraccion de frontmatter y headers."
    },
    @{
        Id = "T08"
        Title = "Agent Selector UI Mod & Fedora Badge"
        Done = (Test-TaskPath "mods\agent-selector\manifest.json") -and (Test-TaskPath "mods\agent-selector\components\AgentIconSvg.js") -and (Test-TaskPath "tests\unit\agent_selector_mod.test.mjs")
        Tip = "Construir badge en header con icono fedora + sunglasses y selector portal de agentes."
    },
    @{
        Id = "T09"
        Title = "Unified Build Bundler & Deployment Hook Sync"
        Done = (Test-TaskPath "build.js") -and (Test-TaskPath "dist\antigravity_mod_loader.mjs")
        Tip = "Configurar empaquetador ESM zero-dependencies y sincronizacion a ~/.gemini/config/mods/."
    },
    @{
        Id = "T10"
        Title = "Git Workflow, Branch Protection & Atomic Commit Governance"
        Done = (Test-TaskPath "docs\GIT_WORKFLOW.md") -and (Test-TaskPath ".github\pull_request_template.md")
        Tip = "Documentar reglas de ramas (trunk-based/feature branches), commits atomicos y template de PR."
    },
    @{
        Id = "T11"
        Title = "Automated CI Pipeline with Node Test Runner"
        Done = (Test-TaskPath ".github\workflows\ci.yml")
        Tip = "Crear workflow .github/workflows/ci.yml para ejecutar la suite de pruebas en cada push y PR."
    },
    @{
        Id = "T12"
        Title = "Developer Ergonomics, Mod Templates & Authoring Guide"
        Done = (Test-TaskPath "docs\MOD_AUTHORING_GUIDE.md") -and (Test-TaskPath "mods\template\manifest.json") -and (Test-TaskPath "tests\verify_loader.mjs")
        Tip = "Publicar guia de autoria de mods, plantilla starter y script de verificacion en vivo."
    }
)

# Conteo y Estados
$total = $tasks.Count
$completed = 0
$activeTask = $null

foreach ($t in $tasks) {
    if ($t.Done) {
        $completed++
    } elseif ($null -eq $activeTask) {
        $activeTask = $t
    }
}

$percent = [math]::Round(($completed / $total) * 100)

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "       GITHUB PROJECTS AUTOPILOT - MODS ANTIGRAVITY 2.0" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Progreso Global: $percent% ($completed / $total tareas verificadas)" -ForegroundColor Yellow
$currentBranch = (git branch --show-current 2>$null)
if ($currentBranch) {
    $currentBranch = $currentBranch.Trim()
} else {
    $currentBranch = "desconocida"
}
Write-Host " Rama Activa:     $currentBranch" -ForegroundColor White
Write-Host "----------------------------------------------------------------------" -ForegroundColor DarkGray

foreach ($t in $tasks) {
    $idStr = "[$($t.Id)]"
    $titleStr = $t.Title.PadRight(50)
    if ($t.Done) {
        Write-Host "  $idStr $titleStr [LISTO]" -ForegroundColor Green
    } elseif ($activeTask -and ($activeTask.Id -eq $t.Id)) {
        Write-Host "  $idStr $titleStr [EN CURSO]" -ForegroundColor Yellow
    } else {
        Write-Host "  $idStr $titleStr [PENDIENTE]" -ForegroundColor DarkGray
    }
}

Write-Host "----------------------------------------------------------------------" -ForegroundColor DarkGray

if ($activeTask) {
    Write-Host ""
    Write-Host " >>> QUE TOCA HACER AHORA <<< " -ForegroundColor Black -BackgroundColor Yellow
    Write-Host " Tarea Activa: [$($activeTask.Id)] $($activeTask.Title)" -ForegroundColor Yellow
    Write-Host " Instruccion:  $($activeTask.Tip)" -ForegroundColor White
    Write-Host ""
    Write-Host " Recuerda la politica de ramas y commits atomicos:" -ForegroundColor Cyan
    Write-Host "  1. Rama:    git checkout -b feat/$($activeTask.Id.ToLower())-..." -ForegroundColor Gray
    Write-Host "  2. Test:    npm test" -ForegroundColor Gray
    Write-Host "  3. Commit:  git commit -m `"<tipo>(<alcance>): <descripcion>`"" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host " FELICITACIONES! Todas las tareas del backlog estan completadas al 100%." -ForegroundColor Green
    Write-Host " El sistema esta listo para despliegue y produccion." -ForegroundColor Green
    Write-Host ""
}
