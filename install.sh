#!/bin/sh
# Sets up our Herdr on another Mac: the third-party mods we build on, our mods, layouts,
# themes and keys. Safe to run again (it is also how you update: git pull && ./install.sh).
# Needs Herdr app installed and opened once (brew install --cask herdr-app), so ~/.config/herdr-app exists.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
APP=~/.config/herdr-app
EXT=~/code/herdr-ext
[ -d "$APP/mods" ] || { echo "Open Herdr once first (from Spotlight), then run this again." >&2; exit 1; }
mkdir -p "$EXT"
# Pinned to the commits our patches are made for: their newer code can break a patch. To move
# up, check out a newer commit there, run ./sync-mods.sh, fix patches/ if needed, update these.
for pin in jankeesvw/herdr-space-folders@63a78b20d5ed30d57166a3c7165a6eb558c3ef84 CodeyPacker/herdr-mods@a90fc434e7fda602de0472d081c981ffa239cf7a wobsoriano/herdr-sim@82b51e8c1e869d497dcd38c7b68f60f879e0aa96; do
  r=${pin%@*}; c=${pin#*@}; d="$EXT/$(basename "$r")"
  [ -d "$d/.git" ] || git clone -q "https://github.com/$r.git" "$d"
  git -C "$d" fetch -q origin && git -C "$d" checkout -q "$c"
done
"$HERE/sync-mods.sh"
# Claude Code skill: tasks into new Herdr tabs and spaces.
mkdir -p ~/.claude/skills && ln -sfn "$HERE/skills/herdr-tabs" ~/.claude/skills/herdr-tabs
# Our keys (alt-up/down through the agents list) merged into the person's own keys.json.
python3 - "$HERE/keys.json" "$APP/keys.json" <<'PY'
import json, os, sys
ours, path = json.load(open(sys.argv[1])), sys.argv[2]
theirs = json.load(open(path)) if os.path.exists(path) else {}
for k, v in ours.items():
    if k.startswith("layout:propeller"): theirs[k] = v
json.dump(theirs, open(path, "w"), indent=2, ensure_ascii=False)
PY
# No anonymous telemetry.
python3 - "$APP/settings.json" <<'PY'
import json, os, sys
p = sys.argv[1]; d = json.load(open(p)) if os.path.exists(p) else {}
d["telemetry"] = False; json.dump(d, open(p, "w"), indent=2)
PY
# Reload the mods if Herdr is running (it only talks to the open window): away to main and back to
# the layout that was open; on the first install, to ours.
now=$(herdr-app status 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("layout",""))' 2>/dev/null || true)
case "$now" in propeller*) to=$now ;; *) to=propeller-glass ;; esac
if [ -n "$now" ]; then
  herdr-app do layout.switch '{"name":"main"}' >/dev/null 2>&1 || true
  herdr-app do layout.switch "{\"name\":\"$to\"}" >/dev/null 2>&1 && echo "layout: $to"
else
  echo "Open Herdr and pick the propeller-glass layout (cmd-shift-l)."
fi
echo "installed"
