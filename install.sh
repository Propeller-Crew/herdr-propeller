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
