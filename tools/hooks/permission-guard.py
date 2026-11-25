# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 Victor Manuel Martinez Munoz
"""
Antigravity PreToolUse Permission Guard & Dual-Slot Builder Governance Hook.

- When Dual-Slot Model Governance is enabled (`model_slots.json`):
  1. Blocks `invoke_subagent` so tactical delegations cannot silently fall back
     to hardcoded default models.
  2. Enforces the active Builder slot model (`builder_id` or `builder_name`) on
     `swarm(action='add', ...)` and `swarm(action='model', ...)` for non-system workers.
- Preserves dynamic AUTO-mode PLAN -> BUILD transition and destructive-command
  safeguards in PLAN mode.
"""

import json
import os
import re
import subprocess
import sys

MODEL_DISPLAY_NAMES = {
    "gemini-4-neon-xhigh": "Gemini 4 Neon (XHigh)",
    "gemini-4-neon-high": "Gemini 4 Neon (High)",
    "gemini-4-neon-medium": "Gemini 4 Neon (Medium)",
    "gemini-4-neon-low": "Gemini 4 Neon (Low)",
    "gemini-4-argon-high": "Gemini 4 Argon (High)",
    "gemini-4-argon-medium": "Gemini 4 Argon (Medium)",
    "gemini-4-argon-low": "Gemini 4 Argon (Low)",
    "gemini-4-hydrogen-xhigh": "Gemini 4 Hydrogen (XHigh)",
    "gemini-4-hydrogen-high": "Gemini 4 Hydrogen (High)",
    "gemini-4-hydrogen-medium": "Gemini 4 Hydrogen (Medium)",
    "gemini-4-hydrogen-low": "Gemini 4 Hydrogen (Low)",
    "gemini-3.8-flash-high": "Gemini 3.8 Flash (High)",
    "gemini-3.8-flash-medium": "Gemini 3.8 Flash (Medium)",
    "gemini-3.8-flash-low": "Gemini 3.8 Flash (Low)",
    "claude-opus-5-5-high": "Claude Opus 5.5 (High)",
    "claude-opus-5-5-medium": "Claude Opus 5.5 (Medium)",
    "claude-opus-5-5-low": "Claude Opus 5.5 (Low)",
    "claude-sonnet-5-5-high": "Claude Sonnet 5.5 (High)",
    "claude-sonnet-5-5-medium": "Claude Sonnet 5.5 (Medium)",
    "claude-sonnet-5-5-low": "Claude Sonnet 5.5 (Low)",
    "gpt-oss-120b-medium": "GPT-OSS 120B (Medium)",
    "gemini-pro-orchestrator-neon": "Orchestrator (Neon)",
    "gemini-pro-orchestrator-g1-pro": "Orchestrator (Argon)",
}


def resolve_catalog_path():
    env_path = os.environ.get("ANTIGRAVITY_MODEL_CATALOG_PATH")
    if env_path:
        return os.path.expanduser(env_path)
    return os.path.expanduser(r"~\.gemini\config\mods\model_catalog.json")


def resolve_slots_path():
    env_path = os.environ.get("ANTIGRAVITY_MODEL_SLOTS_PATH")
    if env_path:
        return os.path.expanduser(env_path)
    return os.path.expanduser(r"~\.gemini\config\mods\model_slots.json")


def load_dynamic_model_names():
    catalog_path = resolve_catalog_path()
    if not os.path.exists(catalog_path):
        return {}
    try:
        with open(catalog_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {}
        names = {}
        for item in data.get("modelCatalog", []) or []:
            if isinstance(item, dict) and item.get("id") and item.get("name"):
                names[str(item["id"])] = str(item["name"])
        for bm in data.get("baseModels", []) or []:
            if not isinstance(bm, dict):
                continue
            base_name = bm.get("name", "")
            for eff in bm.get("efforts", []) or []:
                if isinstance(eff, dict) and eff.get("id") and eff["id"] not in names:
                    label = eff.get("label", "")
                    names[str(eff["id"])] = (
                        base_name if label.lower() == "standard" else f"{base_name} ({label})"
                    )
        return names
    except Exception:
        return {}


def get_model_display_name(model_id):
    if not model_id:
        return "Unknown"
    dynamic_names = load_dynamic_model_names()
    if model_id in dynamic_names:
        return dynamic_names[model_id]
    return MODEL_DISPLAY_NAMES.get(model_id, model_id)


def resolve_valid_builder_model(builder_id):
    fallback_id = "gemini-3.8-flash-medium"
    candidate = str(builder_id or "").strip()
    if not candidate:
        return fallback_id

    catalog_path = resolve_catalog_path()
    if not os.path.exists(catalog_path):
        return candidate
    try:
        with open(catalog_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            for d in data.get("disabledModels", []) or []:
                if isinstance(d, dict) and str(d.get("id", "")).strip() == candidate:
                    return fallback_id
    except Exception:
        pass
    return candidate


def get_model_slots():
    default_slots = {
        "planner": "gemini-4-argon-high",
        "builder": "gemini-4-hydrogen-high",
        "enabled": True,
    }
    config_path = resolve_slots_path()
    if not os.path.exists(config_path):
        return {
            **default_slots,
            "builder": resolve_valid_builder_model(default_slots["builder"]),
        }
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                planner = data.get("planner")
                builder = data.get("builder")
                enabled = data.get("enabled")
                resolved_builder = str(builder) if builder else default_slots["builder"]
                return {
                    "planner": str(planner) if planner else default_slots["planner"],
                    "builder": resolve_valid_builder_model(resolved_builder),
                    "enabled": bool(enabled) if enabled is not None else default_slots["enabled"],
                }
    except Exception:
        pass
    return {
        **default_slots,
        "builder": resolve_valid_builder_model(default_slots["builder"]),
    }


def update_ui_badge(conversation_id=""):
    try:
        script = os.path.expanduser(r"~\.gemini\config\mods\antigravity_mod_loader.mjs")
        if os.path.exists(script):
            subprocess.Popen(["node", script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def emit_decision(decision, reason=None):
    out = {"decision": decision}
    if reason:
        out["reason"] = reason
    sys.stdout.write(json.dumps(out))


def main():
    try:
        raw_input = sys.stdin.read()
        if not os.environ.get("ANTIGRAVITY_MODEL_SLOTS_PATH"):
            try:
                with open(os.path.expanduser(r"~\.gemini\config\mods\permission_guard_debug.log"), "w", encoding="utf-8") as f:
                    f.write(raw_input)
            except Exception:
                pass
        payload = json.loads(raw_input) if raw_input.strip() else {}
    except Exception:
        payload = {}

    conversation_id = payload.get("conversationId") or payload.get("cascadeId") or ""
    tool_call = payload.get("toolCall") or {}
    tool_name = str(tool_call.get("name", "") or "").strip()
    raw_args = tool_call.get("args")
    if isinstance(raw_args, str):
        try:
            tool_args = json.loads(raw_args)
        except Exception:
            tool_args = {}
    elif isinstance(raw_args, dict):
        tool_args = raw_args
    else:
        tool_args = {}

    # Dual-Slot Builder Governance enforcement
    slots = get_model_slots()
    if slots.get("enabled", True):
        builder_id = slots["builder"]
        builder_name = get_model_display_name(builder_id)

        # Rule A: Block invoke_subagent completely when Dual-Slot Governance is active
        if tool_name == "invoke_subagent":
            emit_decision(
                "deny",
                (
                    f"Dual-Slot Builder Governance activo: 'invoke_subagent' está bloqueado porque no permite seleccionar "
                    f"el modelo Builder exacto. Usa swarm(action='add', name='builder', model='{builder_id}', brief='...') "
                    f"(o tasks=[...] para enjambre) con el modelo Builder activo ({builder_name}: {builder_id})."
                ),
            )
            return

        # Rule B: Enforce exact Builder model on swarm add / model switching for worker roles
        if tool_name == "swarm":
            action = str(tool_args.get("action", "") or "").strip().lower()
            worker_name = str(tool_args.get("name", "") or "").strip().lower()
            req_model = str(tool_args.get("model", "") or "").strip()
            is_system_helper = (
                worker_name in ("narrator", "monitor")
                or worker_name.startswith("narrator-")
                or worker_name.startswith("monitor-")
            )

            if action == "add" and not is_system_helper:
                if req_model != builder_id and req_model.lower() != builder_name.lower():
                    emit_decision(
                        "deny",
                        (
                            f"Dual-Slot Builder Governance activo: debes especificar model='{builder_id}' ({builder_name}) "
                            f"en swarm(action='add', ...). Recibido: model='{req_model or 'None'}'."
                        ),
                    )
                    return

            if action == "model" and worker_name not in ("", "coordinator") and not is_system_helper:
                if req_model != builder_id and req_model.lower() != builder_name.lower():
                    emit_decision(
                        "deny",
                        (
                            f"Dual-Slot Builder Governance activo: debes especificar model='{builder_id}' ({builder_name}) "
                            f"en swarm(action='model', ...). Recibido: model='{req_model or 'None'}'."
                        ),
                    )
                    return

    # Read active agent and mode from active_agents.json
    config_path = os.path.expanduser(
        os.environ.get("ANTIGRAVITY_ACTIVE_AGENTS_PATH", r"~\.gemini\config\mods\active_agents.json")
    )
    all_data = {}
    agent = {}
    active_mode = "TURBO"

    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                all_data = json.load(f)
            if conversation_id and conversation_id in all_data:
                agent = all_data[conversation_id]
            else:
                # Fallback to the latest active entry in all_data
                for k, v in reversed(list(all_data.items())):
                    if isinstance(v, dict) and v.get("id") == "auto":
                        conversation_id = k
                        agent = v
                        break
            if isinstance(agent, dict) and agent:
                active_mode = str(agent.get("effectiveMode", agent.get("id", "TURBO"))).upper()
        except Exception:
            pass

    # Dynamic transition for AUTO mode:
    # Analyzing tools (read_file, search_web, gemini_search_docs) -> PLAN
    # Editing / mutating tools (edit_file, write_file, build commands) -> BUILD
    if isinstance(agent, dict) and agent.get("id") == "auto":
        is_editing_tool = tool_name in ["edit_file", "write_file"]
        is_build_command = False
        if tool_name == "run_command":
            cmd = str(tool_args.get("CommandLine", "") or "")
            is_build_command = bool(
                re.search(r'(?i)\b(npm\s+(run\s+)?(test|build)|git\s+commit|node\s+build|tsc|cargo\s+build|go\s+build)\b', cmd)
            )

        if (is_editing_tool or is_build_command) and active_mode != "BUILD":
            active_mode = "BUILD"
            try:
                if conversation_id and conversation_id in all_data:
                    all_data[conversation_id]["effectiveMode"] = "BUILD"
                    with open(config_path, "w", encoding="utf-8") as f:
                        json.dump(all_data, f, indent=2)
                update_ui_badge(conversation_id)
            except Exception:
                pass

    # Guard rules for PLAN mode (destructive command safety)
    if "PLAN" in active_mode and tool_name == "run_command":
        cmd = str(tool_args.get("CommandLine", "") or "")
        destructive = re.search(
            r'(?i)\b(git\s+push|rm\s+-rf|del\s+/f|format|git\s+reset\s+--hard|git\s+clean\s+-fd|drop\s+database)\b',
            cmd,
        )
        if destructive:
            emit_decision(
                "ask",
                f"Modo PLAN activo: el comando potencialmente destructivo '{cmd[:60]}' requiere confirmación.",
            )
            return

    # Allow editing tools, compliant swarm calls, and harmless commands
    emit_decision("allow")


if __name__ == "__main__":
    main()
