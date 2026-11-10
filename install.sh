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
for r in jankeesvw/herdr-space-folders CodeyPacker/herdr-mods wobsoriano/herdr-sim; do
  d="$EXT/$(basename "$r")"
  if [ -d "$d/.git" ]; then git -C "$d" pull -q; else git clone -q "https://github.com/$r.git" "$d"; fi
done
"$HERE/sync-mods.sh"
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
# Switch to our layout if Herdr is running (it only talks to the open window).
herdr-app do layout.switch '{"name":"propeller-glass"}' >/dev/null 2>&1 && echo "layout: propeller-glass" || echo "Open Herdr and pick the propeller-glass layout (cmd-shift-l)."
echo "installed"
