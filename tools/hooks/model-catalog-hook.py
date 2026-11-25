# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 Victor Manuel Martinez Munoz
"""
Antigravity Lifecycle Hook & CLI for live Model & Effort Catalog awareness.

- As a SessionStart hook (configured in ~/.gemini/config/hooks.json):
  Reads the latest live-discovered model catalog from ~/.gemini/config/mods/model_catalog.json
  (populated automatically by ModLoader / ModHost / probe:models from Antigravity's native React context)
  and injects a compact systemMessage listing every available model and its effort tiers.
- As a CLI utility:
  python model-catalog-hook.py --inspect   # Human-readable summary of models & efforts
  python model-catalog-hook.py --json      # Raw JSON catalog
  python model-catalog-hook.py --refresh   # Live CDP sync via tools/probe.js before output
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone

DEFAULT_CATALOG_PATH = os.path.expanduser(r"~\.gemini\config\mods\model_catalog.json")

FALLBACK_BASE_MODELS = [
    {
        "name": "Gemini 4 Neon",
        "family": "Neon",
        "efforts": [
            {"id": "gemini-4-neon-low", "label": "Low"},
            {"id": "gemini-4-neon-medium", "label": "Medium"},
            {"id": "gemini-4-neon-high", "label": "High"},
            {"id": "gemini-4-neon-xhigh", "label": "XHigh"},
        ],
    },
    {
        "name": "Gemini 4 Argon",
        "family": "Argon",
        "efforts": [
            {"id": "gemini-4-argon-low", "label": "Low"},
            {"id": "gemini-4-argon-medium", "label": "Medium"},
            {"id": "gemini-4-argon-high", "label": "High"},
        ],
    },
    {
        "name": "Gemini 4 Hydrogen",
        "family": "Hydrogen",
        "efforts": [
            {"id": "gemini-4-hydrogen-low", "label": "Low"},
            {"id": "gemini-4-hydrogen-medium", "label": "Medium"},
            {"id": "gemini-4-hydrogen-high", "label": "High"},
            {"id": "gemini-4-hydrogen-xhigh", "label": "XHigh"},
        ],
    },
    {
        "name": "Gemini 3.8 Flash",
        "family": "Gemini 3.8",
        "efforts": [
            {"id": "gemini-3.8-flash-low", "label": "Low"},
            {"id": "gemini-3.8-flash-medium", "label": "Medium"},
            {"id": "gemini-3.8-flash-high", "label": "High"},
        ],
    },
    {
        "name": "Claude Opus 5.5",
        "family": "Claude",
        "efforts": [
            {"id": "claude-opus-5-5-low", "label": "Low"},
            {"id": "claude-opus-5-5-medium", "label": "Medium"},
            {"id": "claude-opus-5-5-high", "label": "High"},
        ],
    },
    {
        "name": "Claude Sonnet 5.5",
        "family": "Claude",
        "efforts": [
            {"id": "claude-sonnet-5-5-low", "label": "Low"},
            {"id": "claude-sonnet-5-5-medium", "label": "Medium"},
            {"id": "claude-sonnet-5-5-high", "label": "High"},
        ],
    },
    {
        "name": "GPT-OSS 120B",
        "family": "OpenAI OSS",
        "efforts": [
            {"id": "gpt-oss-120b-medium", "label": "Medium"},
        ],
    },
    {
        "name": "Orchestrator (Neon)",
        "family": "Neon",
        "efforts": [
            {"id": "gemini-pro-orchestrator-neon", "label": "Standard"},
        ],
    },
    {
        "name": "Orchestrator (Argon)",
        "family": "Argon",
        "efforts": [
            {"id": "gemini-pro-orchestrator-g1-pro", "label": "Standard"},
        ],
    },
]


def resolve_catalog_path(cli_path=None):
    if cli_path:
        return os.path.expanduser(cli_path)
    env_path = os.environ.get("ANTIGRAVITY_MODEL_CATALOG_PATH")
    if env_path:
        return os.path.expanduser(env_path)
    return DEFAULT_CATALOG_PATH


def trigger_live_refresh(timeout_sec=4):
    """Best-effort live CDP catalog refresh via tools/probe.js or mod loader."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.normpath(os.path.join(script_dir, "..", "probe.js")),
    ]
    for probe_path in candidates:
        if os.path.exists(probe_path):
            try:
                subprocess.run(
                    ["node", probe_path, "models", "--sync"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=timeout_sec,
                    check=False,
                )
                return True
            except Exception:
                return False
    return False


def load_catalog(catalog_path):
    if catalog_path and os.path.exists(catalog_path):
        try:
            with open(catalog_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and isinstance(data.get("baseModels"), list) and len(data["baseModels"]) > 0:
                return data
        except Exception:
            pass

    total_variants = sum(len(m.get("efforts", [])) for m in FALLBACK_BASE_MODELS)
    return {
        "source": "static-fallback",
        "baseModels": FALLBACK_BASE_MODELS,
        "disabledModels": [],
        "totalBaseModels": len(FALLBACK_BASE_MODELS),
        "totalModels": total_variants,
        "updatedAt": 0,
    }


def format_catalog_summary(catalog):
    base_models = catalog.get("baseModels") or []
    disabled_models = catalog.get("disabledModels") or []
    source = catalog.get("source", "unknown")
    total_variants = sum(len(bm.get("efforts") or []) for bm in base_models)

    updated_str = "never"
    updated_at = catalog.get("updatedAt")
    if isinstance(updated_at, (int, float)) and updated_at > 0:
        try:
            dt = datetime.fromtimestamp(updated_at / 1000.0, tz=timezone.utc)
            updated_str = dt.strftime("%Y-%m-%d %H:%M UTC")
        except Exception:
            updated_str = str(updated_at)

    lines = [
        f"[LIVE MODEL CATALOG & EFFORTS] ({len(base_models)} models, {total_variants} effort variants | source: {source} | synced: {updated_str})"
    ]

    for bm in base_models:
        name = bm.get("name", "Unknown")
        efforts = bm.get("efforts") or []
        effort_labels = ", ".join(e.get("label", "?") for e in efforts)
        effort_ids = ", ".join(e.get("id", "?") for e in efforts)
        lines.append(f"- {name}: [{effort_labels}] -> {effort_ids}")

    if disabled_models:
        unavailable = ", ".join(
            f"{d.get('name', d.get('id', 'Unknown'))} ({d.get('tagTitle') or 'Unavailable'})"
            for d in disabled_models
        )
        lines.append(f"- Unavailable: {unavailable}")

    return "\n".join(lines)


def build_hook_output(catalog):
    summary = format_catalog_summary(catalog)
    return {
        "injectSteps": [
            {
                "systemMessage": {
                    "systemMessage": summary
                }
            }
        ]
    }


def main():
    args = sys.argv[1:]
    inspect_mode = "--inspect" in args
    json_mode = "--json" in args
    refresh_mode = "--refresh" in args

    cli_path = None
    if "--catalog-path" in args:
        idx = args.index("--catalog-path")
        if idx + 1 < len(args):
            cli_path = args[idx + 1]

    catalog_path = resolve_catalog_path(cli_path)

    if refresh_mode:
        trigger_live_refresh()

    if inspect_mode or json_mode:
        catalog = load_catalog(catalog_path)
        if json_mode:
            sys.stdout.write(json.dumps(catalog, indent=2) + "\n")
        else:
            sys.stdout.write(format_catalog_summary(catalog) + "\n")
        return

    # Hook mode: consume stdin payload per Antigravity lifecycle hook contract
    try:
        if not sys.stdin.isatty():
            sys.stdin.read()
    except Exception:
        pass

    catalog = load_catalog(catalog_path)
    output = build_hook_output(catalog)
    sys.stdout.write(json.dumps(output))


if __name__ == "__main__":
    main()
