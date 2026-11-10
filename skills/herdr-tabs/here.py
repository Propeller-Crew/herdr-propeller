#!/usr/bin/env python3
"""Prints the Herdr space and tab this Claude runs in, as JSON {"space", "tab", "terminal"}:
the terminal whose foreground program is one of this process's ancestors. Empty when none."""
import json, os, subprocess

def parent(pid):
    out = subprocess.run(["ps", "-o", "ppid=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
    return int(out) if out.isdigit() else 0

up, p = set(), os.getpid()
while p > 1:
    up.add(p)
    p = parent(p)
ls = json.loads(subprocess.run(["hc", "ls", "--json"], capture_output=True, text=True).stdout or "{}")
for t in ls.get("terminals", []):
    if t.get("state") != "live" or "/" in t["address"]:
        continue
    g = json.loads(subprocess.run(["hc", "get", t["address"], "--json"], capture_output=True, text=True).stdout or "{}")
    if (g.get("foreground") or {}).get("pid") in up or g.get("pid") in up:
        lab = g.get("labels") or {}
        print(json.dumps({"space": lab.get("herdr.space"), "tab": lab.get("herdr.tab"), "terminal": t["address"]}))
        break
