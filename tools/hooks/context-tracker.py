import sys
import json
import os
import re
import subprocess

def calculate_context(transcript_path):
    if not transcript_path or not os.path.exists(transcript_path):
        return None
    
    target_path = transcript_path
    if transcript_path.endswith("transcript_full.jsonl"):
        compact_candidate = os.path.join(os.path.dirname(transcript_path), "transcript.jsonl")
        if os.path.exists(compact_candidate):
            target_path = compact_candidate

    total_bytes = os.path.getsize(target_path)
    steps = 0
    total_chars = 0
    
    try:
        with open(target_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                if not line.strip():
                    continue
                steps += 1
                try:
                    data = json.loads(line)
                    if data.get("type") == "CHECKPOINT":
                        total_chars = len(line)
                    else:
                        total_chars += len(line)
                except Exception:
                    total_chars += len(line)
    except Exception:
        total_chars = total_bytes

    est_tokens = int(total_chars / 3.8)
    limit_1m = 1_000_000
    pct = (est_tokens / limit_1m) * 100

    return {
        "tokens": est_tokens,
        "steps": steps,
        "size_kb": round(total_bytes / 1024, 1),
        "percentage": round(pct, 2)
    }

def get_last_user_prompt(transcript_path):
    if not transcript_path or not os.path.exists(transcript_path):
        return ""
    try:
        with open(transcript_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
            for line in reversed(lines):
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    if data.get("type") == "USER_INPUT" or data.get("source") == "USER_EXPLICIT":
                        content = data.get("content", "")
                        if isinstance(content, str):
                            # Remove wrapper tags if present
                            clean = re.sub(r'<[^>]+>', '', content).strip()
                            if clean:
                                return clean
                except Exception:
                    continue
    except Exception:
        pass
    return ""

def classify_plan_vs_build(transcript_path, prompt):
    # 1. If agent has executed editing tools in current turn -> BUILD phase
    if transcript_path and os.path.exists(transcript_path):
        editing_tools = {"edit_file", "write_file"}
        has_edited = False
        try:
            with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
            for line in reversed(lines):
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    if data.get("type") == "USER_INPUT" or data.get("source") == "USER_EXPLICIT":
                        break
                    for tc in data.get("tool_calls", []):
                        name = tc.get("name", "")
                        if name in editing_tools:
                            has_edited = True
                            break
                        if name == "run_command":
                            cmd = tc.get("args", {}).get("CommandLine", "")
                            if re.search(r'(?i)\b(npm\s+(test|run\s+build|build)|git\s+commit|node\s+build|tsc|cargo\s+build)\b', cmd):
                                has_edited = True
                                break
                    if has_edited:
                        break
                except Exception:
                    continue
            if has_edited:
                return "BUILD"
        except Exception:
            pass

    # 2. Classify based on user prompt intent
    if not prompt:
        return "PLAN"
    
    plan_pattern = re.compile(
        r'(?i)\b(diseñ|plan|arquitect|estructur|diagram|rfc|adr|evalu|compar|como\s+(hacer|estructurar|abordar|organizar)|analiz|estrateg|roadmap|criterio|decision|flujo|explic|por\s*qu[eé]|evaluaci[oó]n|diagn[oó]stic)\b'
    )
    build_pattern = re.compile(
        r'(?i)\b(implement|escrib|crea|agreg|corrig|arregl|fix|refactor|test|prueb|npm|git\s+commit|ejecut|corr|instal|modific|edit|program|actualiz|agrega|elimina|borra)\b'
    )

    has_plan = bool(plan_pattern.search(prompt))
    has_build = bool(build_pattern.search(prompt))

    if has_build and not has_plan:
        return "BUILD"
    if has_plan and not has_build:
        return "PLAN"

    p_lower = prompt.lower()
    if any(p_lower.startswith(w) for w in ["cómo", "como", "por qué", "porque", "explica", "cuál", "cual", "analiza", "revisa"]):
        return "PLAN"
    if any(p_lower.startswith(w) for w in ["haz", "crea", "agrega", "modifica", "corrige", "ejecuta", "implementa"]):
        return "BUILD"

    return "BUILD" if has_build else "PLAN"

def get_active_agent(conversation_id):
    if not conversation_id:
        return None
    config_path = os.path.expanduser(r"~\.gemini\config\mods\active_agents.json")
    if not os.path.exists(config_path):
        return None
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            agent = data.get(conversation_id)
            if agent and agent.get("id") != "default" and agent.get("name") != "Sin Agente":
                return agent
    except Exception:
        pass
    return None

def update_agent_effective_mode(conversation_id, effective_mode):
    if not conversation_id:
        return
    config_path = os.path.expanduser(r"~\.gemini\config\mods\active_agents.json")
    try:
        data = {}
        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        if conversation_id in data:
            data[conversation_id]["effectiveMode"] = effective_mode
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
    except Exception:
        pass

def load_agent_instructions(agent):
    if not agent:
        return None
    
    file_path = agent.get("filePath")
    if file_path and os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read().strip()
        except Exception:
            pass

    search_dirs = [
        os.path.expanduser(r"~\.gemini\antigravity\scratch\architecture-vault"),
        os.path.expanduser(r"~\.gemini\config\skills"),
        os.path.expanduser(r"~\.gemini\antigravity\agents")
    ]
    agent_id = agent.get("id", "").lower()
    agent_name = agent.get("name", "").lower()

    for s_dir in search_dirs:
        if not os.path.exists(s_dir):
            continue
        try:
            for root, _, files in os.walk(s_dir):
                for file in files:
                    if not file.endswith(".md"):
                        continue
                    f_lower = file.lower()
                    if agent_id in f_lower or agent_name in f_lower:
                        full_path = os.path.join(root, file)
                        try:
                            with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                                return f.read().strip()
                        except Exception:
                            pass
        except Exception:
            pass

    return None

def update_ui_badge(transcript_path=""):
    try:
        script = os.path.expanduser(r"~\.gemini\config\mods\antigravity_mod_loader.mjs")
        if os.path.exists(script):
            cmd = ["node", script]
            if transcript_path:
                cmd.extend(["--transcript", transcript_path])
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

def is_caveman_enabled(conversation_id):
    if not conversation_id:
        return False
    config_path = os.path.expanduser(r"~\.gemini\config\mods\active_agents.json")
    if not os.path.exists(config_path):
        return False
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            entry = data.get(conversation_id)
            if not entry:
                return False
            modifiers = entry.get("modifiers") or {}
            return bool(entry.get("caveman") or modifiers.get("caveman") or entry.get("adhd") or modifiers.get("adhd"))
    except Exception:
        return False

def build_caveman_directive():
    return (
        "[MODIFIER: CAVEMAN FOCUS MODE]\n"
        "Status: Active. Communication compressed ~75% while keeping 100% technical accuracy.\n\n"
        "RULES:\n"
        "1. Speak terse like smart caveman. Drop filler, pleasantries, hedging, and articles (a/an/the).\n"
        "2. Short sentences, fragments OK. Short synonyms. High signal-to-noise ratio.\n"
        "3. Pattern: [thing] [action] [reason]. [next step].\n"
        "4. Code blocks, diffs, filenames, paths, exact errors, types, and commands must remain 100% intact and functional.\n"
        "5. Code and commit messages stay normal. Auto-clarity for security risks and irreversible operations."
    )

def build_adhd_directive():
    return (
        "[MODIFIER: I-HAVE-ADHD OUTPUT SHAPING]\n"
        "Status: Active. Reader has ADHD; cognitive friction minimized and start barrier lowered.\n\n"
        "RULES:\n"
        "1. Lead with next action: First line is actionable (command, path, snippet). No preambles, no conversational filler.\n"
        "2. Number multi-step work: One bounded action per number. Fewest steps that work.\n"
        "3. End with one concrete next action (< 2 minutes): One clear immediate step.\n"
        "4. Suppress tangents: Finish main issue first; offer side topics separately at the end.\n"
        "5. Restate state every turn: Explicitly state current step (e.g. 'Step 3 of 5 done...').\n"
        "6. Concrete time estimates: Use minutes/hours, never vague terms like 'a while'.\n"
        "7. Make completed work visible: Show what now works and exact verification command.\n"
        "8. Matter-of-fact errors: No drama; state cause and fix directly.\n"
        "9. Cap lists to 5 items: Visible working set small (maximum 5 items per group).\n"
        "10. Zero preamble, zero recap, zero closing pleasantries: Start with the answer, end when done."
    )

MODEL_DISPLAY_NAMES = {
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
    "gemini-pro-orchestrator-g1-pro": "Orchestrator (Argon)",
}

def get_model_display_name(model_id):
    if not model_id:
        return "Unknown"
    return MODEL_DISPLAY_NAMES.get(model_id, model_id)

def get_model_slots():
    default_slots = {
        "planner": "gemini-4-argon-high",
        "builder": "gemini-4-hydrogen-high",
        "enabled": True,
    }
    config_path = os.path.expanduser(r"~\.gemini\config\mods\model_slots.json")
    if not os.path.exists(config_path):
        return default_slots
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                planner = data.get("planner")
                builder = data.get("builder")
                enabled = data.get("enabled")
                return {
                    "planner": str(planner) if planner else default_slots["planner"],
                    "builder": str(builder) if builder else default_slots["builder"],
                    "enabled": bool(enabled) if enabled is not None else default_slots["enabled"],
                }
    except Exception:
        pass
    return default_slots

def build_model_slots_directive(slots, effective_mode="PLAN"):
    planner_id = slots.get("planner", "gemini-4-argon-high") if isinstance(slots, dict) else "gemini-4-argon-high"
    builder_id = slots.get("builder", "gemini-4-hydrogen-high") if isinstance(slots, dict) else "gemini-4-hydrogen-high"
    planner_name = get_model_display_name(planner_id)
    builder_name = get_model_display_name(builder_id)

    return (
        "[DUAL-SLOT MODEL GOVERNANCE: PLANNER & BUILDER]\n"
        f"- Planner Slot: {planner_name} ({planner_id})\n"
        f"- Builder Slot: {builder_name} ({builder_id})\n"
        f"- Current Detected Phase: {effective_mode}\n\n"
        "ORCHESTRATION RULES:\n"
        "1. The Planner model governs architectural reasoning, design decisions, and task decomposition in the main thread.\n"
        f"2. When executing individual implementation, file mutation, refactoring, or test-fixing tasks, delegate the tactical work to a subagent (via invoke_subagent) acting as the Builder ({builder_name}), unless the user explicitly requested /swarm.\n"
        "3. Keep subagent delegations atomic and well-scoped; review their output as Planner before concluding."
    )

def main():
    is_post = "--post" in sys.argv
    try:
        raw_input = sys.stdin.read()
        payload = json.loads(raw_input) if raw_input.strip() else {}
    except Exception:
        payload = {}

    conversation_id = payload.get("conversationId", "")
    transcript_path = payload.get("transcriptPath", "")

    if is_post:
        update_ui_badge(transcript_path)
        sys.stdout.write("{}")
        return

    info = calculate_context(transcript_path)
    last_prompt = get_last_user_prompt(transcript_path)

    output = {
        "injectSteps": []
    }
    combined_directives = []

    # Model Slots Governance (Dual-Slot Planner & Builder)
    slots = get_model_slots()
    if slots.get("enabled", True):
        phase = classify_plan_vs_build(transcript_path, last_prompt)
        slots_directive = build_model_slots_directive(slots, effective_mode=phase)
        combined_directives.append(slots_directive)
        output["injectSteps"].append({
            "ephemeralMessage": slots_directive
        })

    # Inyección Inteligente y Gobernanza de Permisos
    agent = get_active_agent(conversation_id)
    if agent:
        agent_id = agent.get("id", "")
        
        # Caso 1: Modo AUTO (Clasificación Heurística Dinámica)
        if agent_id == "auto":
            mode = classify_plan_vs_build(transcript_path, last_prompt)
            update_agent_effective_mode(conversation_id, mode)

            if mode == "PLAN":
                # Resuelve directivas del Lead Architect
                plan_agent = {
                    "id": "lead-architect",
                    "name": "Lead Architect",
                    "filePath": os.path.expanduser(r"~\.gemini\antigravity\scratch\architecture-vault\Agente Orquestador.md")
                }
                instructions = load_agent_instructions(plan_agent)
                specialist_block = (
                    "[CLASSIFIED MODE: PLANNER (LEAD ARCHITECT)]\n"
                    "[PERMISSIONS POLICY: REQUEST REVIEW / SAFE PLANNING]\n"
                    "Status: Active in Architectural Planning Mode.\n\n"
                    "PERMISSIONS & CONSTRAINTS:\n"
                    "1. Focus strictly on system design, hexagonal boundaries, contracts, and trade-offs.\n"
                    "2. Do NOT execute destructive mutations (file deletes, permanent overwrites, blind commits) without explicit confirmation.\n"
                    "3. When code changes are needed, formulate the plan and ask the user to proceed before entering implementation.\n\n"
                    "--- SPECIALIST DIRECTIVES ---\n"
                    f"{instructions or 'Operate as Lead Architect.'}\n"
                    "--- END SPECIALIST DIRECTIVES ---"
                )
            else:
                # Resuelve directivas del SDD Orchestrator
                build_agent = {
                    "id": "sdd-orchestrator",
                    "name": "SDD Orchestrator",
                    "filePath": os.path.expanduser(r"~\.gemini\antigravity\scratch\architecture-vault\.agents\skills\sdd-orchestrator\SKILL.md")
                }
                instructions = load_agent_instructions(build_agent)
                specialist_block = (
                    "[CLASSIFIED MODE: BUILDER (SDD ORCHESTRATOR)]\n"
                    "[PERMISSIONS POLICY: TURBO BUILD / TDD EXECUTION]\n"
                    "Status: Active in Spec-Driven Implementation Mode.\n\n"
                    "PERMISSIONS & CONSTRAINTS:\n"
                    "1. Execute changes following Spec-Driven Development (Red-Green-Refactor).\n"
                    "2. You are authorized to write code, edit files, and execute verification commands (npm test).\n"
                    "3. Ensure all tests pass with zero broken commits and atomic changes.\n\n"
                    "--- SPECIALIST DIRECTIVES ---\n"
                    f"{instructions or 'Operate as SDD Orchestrator.'}\n"
                    "--- END SPECIALIST DIRECTIVES ---"
                )

            output["injectSteps"].append({
                "ephemeralMessage": specialist_block
            })

        # Caso 2: Especialista Explícito Fijado por el Usuario
        else:
            effective_mode = "PLAN" if agent_id in ["lead-architect", "product-manager", "context-distiller"] else "BUILD"
            update_agent_effective_mode(conversation_id, effective_mode)
            instructions = load_agent_instructions(agent)
            if instructions:
                perm_policy = "REQUEST REVIEW" if effective_mode == "PLAN" else "TURBO BUILD"
                specialist_block = (
                    f"[ACTIVE SPECIALIST ROLE: {agent.get('name', 'Specialist')}]\n"
                    f"[PERMISSIONS POLICY: {perm_policy}]\n"
                    f"Operating under the direct authority of {agent.get('name')}.\n\n"
                    "--- SPECIALIST DIRECTIVES ---\n"
                    f"{instructions}\n"
                    "--- END SPECIALIST DIRECTIVES ---"
                )
                output["injectSteps"].append({
                    "ephemeralMessage": specialist_block
                })

    if is_caveman_enabled(conversation_id):
        output["injectSteps"].append({
            "ephemeralMessage": build_caveman_directive()
        })
        output["injectSteps"].append({
            "ephemeralMessage": build_adhd_directive()
        })

    # Actualiza el badge visual en la barra de herramientas tras sincronizar effectiveMode
    update_ui_badge(transcript_path)

    if info:
        notice = (
            f"[CONTEXT MONITOR]: ~{info['tokens']:,} tokens usados "
            f"({info['percentage']}% de 1M) | {info['steps']} pasos | {info['size_kb']} KB."
        )
        output["injectSteps"].append({
            "ephemeralMessage": notice
        })

    sys.stdout.write(json.dumps(output))

if __name__ == "__main__":
    main()
