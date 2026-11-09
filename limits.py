#!/usr/bin/env python3
"""Claude subscription limits for herdr's tab bar: "5h 35% ·2h10 · wk 4%".

Reads ~/.claude/rate-limits.json, which our Claude status line
(cmux-claude-sidebar/scripts/claude-statusline.py) writes on every turn.
"""
import json, os, time

try:
    with open(os.path.expanduser("~/.claude/rate-limits.json")) as f:
        d = json.load(f)
except (OSError, ValueError):
    raise SystemExit(0)

def left(ts):
    s = max(0, int(ts - time.time()))
    h, m = divmod(s // 60, 60)
    return f"{h // 24}d{h % 24}h" if h >= 24 else f"{h}h{m:02d}"

out = []
for key, name in (("five_hour", "5h"), ("seven_day", "wk")):
    w = d.get(key) or {}
    pct, reset = w.get("used_percentage"), w.get("resets_at")
    if pct is None:
        continue
    if reset and reset < time.time():
        pct = 0
    part = f"{name} {round(pct)}%"
    if reset and reset > time.time():
        part += f" ↻{left(reset)}"
    out.append(part)
print(" · ".join(out))
