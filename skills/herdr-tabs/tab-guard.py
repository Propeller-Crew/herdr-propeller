#!/usr/bin/env python3
"""Claude Code PreToolUse hook (Bash): stops `herdr-app do tab.new` without a space.

Without "space", Herdr opens the tab in the space the person is looking at, not in the one this
Claude runs in (Herdr's own `herdr-app --skill` shows it that way). So a worker tab of the
Контент-тул orchestrator landed in NotchAlert because Artem was reading NotchAlert (16–17.11).
Inline args without a space are denied with the fix; args from a file ("$(cat spec.json)") pass,
there's no telling what's inside."""
import json, re, sys

try:
    cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")
except Exception:
    sys.exit(0)
for m in re.finditer(r"herdr-app\s+do\s+tab\.new\b([^\n;|&]*)", cmd):
    args = m.group(1)
    if "space" in args or re.match(r"""\s*["']?\$\(cat\b""", args) or re.match(r"""\s*["']?\$\w+""", args):
        continue
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason":
            "herdr-app do tab.new without a space opens the tab in the space the user is looking at, "
            "not in yours. Add the space this Claude runs in: --space \"$(python3 ~/.claude/skills/herdr-tabs/here.py "
            "| python3 -c 'import json,sys; print(json.load(sys.stdin)[\"space\"])')\" "
            "(or the id of the space the user named, from herdr-app ls). See the herdr-tabs skill.",
    }}, ensure_ascii=False))
    break
