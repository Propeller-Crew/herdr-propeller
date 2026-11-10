#!/usr/bin/env python3
"""Copies cmux workspaces into Herdr app as spaces, one tab per cmux tab, in the same folders.

Nothing starts right away: each tab is a shell, and the propeller mod types
`claude --resume <id> --fork-session` when you first open it. A fork, so the cmux
original keeps its own conversation and both apps can run side by side.

Which Claude conversation a cmux tab had:
1. cmux's hook record for that tab (~/.cmuxterm/claude-hook-sessions.json);
2. else cmux's agent journal (the newest session that started in that tab), when its
   transcript still exists;
3. else the workspace's "last prompt @<epoch>" (our cmux sidebar writes it) matched to
   the transcript that has a user message at that second.

Run it from anywhere while Herdr is open (it only talks to the window; terminals start
in herdr-core, whose environment stays clean). --dry: print what it would make.
"""
import datetime, glob, json, os, re, sqlite3, subprocess, sys, time

H = os.path.expanduser("~")
DRY = "--dry" in sys.argv
IMPORT = f"{H}/.config/herdr-app/data/propeller-import.json"


def sh(*a):
    return subprocess.run(a, capture_output=True, text=True).stdout


def herdr(cmd, **args):
    r = subprocess.run(["herdr-app", "do", cmd, json.dumps(args, ensure_ascii=False)], capture_output=True, text=True)
    out = json.loads(r.stdout or r.stderr or "{}")
    if "error" in out:
        raise SystemExit(f"{cmd} {args}: {out['error']}")
    return out


def walk(o):
    if isinstance(o, dict):
        if "panels" in o and "workspaceId" in o:
            yield o
        for v in o.values():
            yield from walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from walk(v)


slug = lambda p: re.sub(r"[^A-Za-z0-9]", "-", p)


def transcript_cwd(sid):
    for f in glob.glob(f"{H}/.claude/projects/*/{sid}.jsonl"):
        with open(f, errors="ignore") as fh:
            for line in fh:
                m = re.search(r'"cwd":"([^"]+)"', line)
                if m:
                    return m.group(1)
    return None


def by_time(epoch, taken):
    iso = datetime.datetime.fromtimestamp(epoch, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    hits = []
    for f in glob.glob(f"{H}/.claude/projects/*/*.jsonl"):
        sid = os.path.basename(f)[:-6]
        if sid in taken or os.path.getmtime(f) < epoch - 5:
            continue
        with open(f, errors="ignore") as fh:
            for line in fh:
                if iso in line and '"type":"user"' in line:
                    hits.append(sid)
                    break
    return hits[0] if len(hits) == 1 else None


tree = json.loads(sh("cmux", "tree", "--json", "--all", "--id-format", "both"))
recs = json.loads(sh("cmux", "sessions", "list", "--agent", "claude", "--json", "--all"))["sessions"]
saved = {w["workspaceId"]: w for w in walk(json.load(open(f"{H}/Library/Application Support/cmux/session-com.cmuxterm.app.json")))}

JOURNAL = f"{H}/Library/Application Support/cmux/agent-journal-com.cmuxterm.app.sqlite3"
db = sqlite3.connect(f"file:{JOURNAL}?mode=ro", uri=True) if os.path.exists(JOURNAL) else None


def by_journal(surface):
    if not db or not surface:
        return None
    rows = db.execute("select session_id from agent_journal where surface_id=? and session_id is not null and is_subagent=0 "
                      "group by session_id order by max(occurred_at_ms) desc", (surface,)).fetchall()
    for (sid,) in rows:
        if glob.glob(f"{H}/.claude/projects/*/{sid}.jsonl"):
            return sid
    return None


plan, taken = [], set()
for win in tree["windows"]:
    for ws in win["workspaces"]:
        m = re.search(r"last prompt @(\d+)", ws.get("description") or "")
        hooks = {}
        for r in sorted(recs, key=lambda r: r["updated_at_unix"]):
            if r.get("workspace_id") == ws["id"] and r.get("transcript_path") and os.path.exists(r["transcript_path"]):
                hooks[r["surface_id"]] = r
        tabs = []
        for p in saved.get(ws["id"], {}).get("panels", []):
            cwd = (p.get("terminal") or {}).get("workingDirectory") or p.get("directory") or H
            r = hooks.get(p.get("stableSurfaceId")) or hooks.get(p["id"])
            title = p.get("customTitle") or p.get("title") or ""
            sid = (r and r["session_id"]) or by_journal(p.get("stableSurfaceId")) or by_journal(p["id"])
            tabs.append({"name": "" if re.match(r"^[~/…]", title) else title, "cwd": cwd, "session": sid})
        if not tabs:
            continue
        wname = ws.get("customTitle") or ws.get("title")
        for t in tabs:
            if t["name"] == wname:
                t["name"] = ""
        if m and not any(t["session"] for t in tabs):
            tabs[0]["session"] = by_time(int(m.group(1)), taken)
        for t in tabs:
            if t["session"]:
                taken.add(t["session"])
                t["cwd"] = transcript_cwd(t["session"]) or t["cwd"]
        plan.append({"name": wname, "last": int(m.group(1)) * 1000 if m else 0, "tabs": tabs})

for w in plan:
    print(w["name"], "|", ", ".join(f"{t['name'] or '·'} {t['session'][:8] if t['session'] else 'shell'}" for t in w["tabs"]))
print(f"{len(plan)} spaces, {sum(1 for w in plan for t in w['tabs'] if t['session'])} Claude conversations")
if DRY:
    sys.exit()

made = {"resume": {}, "seen": {}, "at": int(time.time() * 1000)}
for w in plan:
    first, rest = w["tabs"][0], w["tabs"][1:]
    r = herdr("space.new", name=w["name"], folder=first["cwd"], machine="")
    space = r["space"]
    if first["name"]:
        herdr("tab.rename", id=r["tab"], name=first["name"])
    if first["session"]:
        made["resume"][r["terminal"]] = first["session"]
    for t in rest:
        args = {"space": space, "folder": t["cwd"]}
        if t["name"]:
            args["name"] = t["name"]
        rt = herdr("tab.new", **args)
        if t["session"]:
            made["resume"][rt["terminal"]] = t["session"]
    made["seen"][space] = w["last"]
os.makedirs(os.path.dirname(IMPORT), exist_ok=True)
json.dump(made, open(IMPORT, "w"))
print("done:", IMPORT)
