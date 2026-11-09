#!/bin/sh
# Builds our copies of third-party Herdr mods from their upstream clones in ~/code/herdr-ext
# and links everything into ~/.config/herdr-app. Run after `git -C ~/code/herdr-ext/<repo> pull`.
set -eu
EXT=~/code/herdr-ext
APP=~/.config/herdr-app
HERE=$(cd "$(dirname "$0")" && pwd)

# space-folders (jankeesvw/herdr-space-folders) with the Islands card look: the list rounds
# its own corners inside the 14 px card (Herdr doesn't clip a mod to its node's radius).
rm -rf "$HERE/mods/space-folders"
cp -R "$EXT/herdr-space-folders/mods/space-folders" "$HERE/mods/space-folders"
sed -i '' 's/return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)/return v_flex().size_full().min_h(0).rounded(13).overflow_hidden().bg(t.chrome).text_size(13)/' "$HERE/mods/space-folders/main.js"
grep -q 'rounded(13).overflow_hidden().bg(t.chrome).text_size(13)' "$HERE/mods/space-folders/main.js" || { echo "space-folders patch did not apply: upstream changed, look at main.js root" >&2; exit 1; }

# islands-tabs with our changes (patches/islands-tabs.py).
rm -rf "$HERE/mods/islands-tabs"
cp -R "$EXT/herdr-mods/islands/mods/islands-tabs" "$HERE/mods/islands-tabs"
python3 "$HERE/patches/islands-tabs.py" "$HERE/mods/islands-tabs/main.js"

link() { ln -sfn "$1" "$APP/mods/$(basename "$1")"; }
# Herdr doesn't load a mod's icons (svg/png) through a symlinked folder, so mods with icons are copied.
# rsync into the same folder (not rm + cp): Herdr watches the folder it loaded and misses a replaced one.
copy() { d="$APP/mods/$(basename "$1")"; [ -L "$d" ] && rm "$d"; mkdir -p "$d"; rsync -a --delete --exclude jsconfig.json --exclude "*.d.ts" "$1/" "$d/"; }
link "$HERE/mods/propeller"
copy "$HERE/mods/space-folders"
for m in "$EXT"/herdr-mods/islands/mods/islands-*; do [ "$(basename "$m")" = islands-tabs ] || copy "$m"; done
copy "$HERE/mods/islands-tabs"
# herdr-sim as a pane only (its tab-bar clone is left out).
copy "$EXT/herdr-sim/mods/herdr-sim"
copy "$EXT/herdr-sim/mods/herdr-sim-screen"
for t in "$HERE"/themes/*.json; do rm -f "$APP/themes/$(basename "$t")"; cp "$t" "$APP/themes/"; done
# Layouts: ours and the glass variant built from it.
python3 "$HERE/make-glass.py"
cp "$HERE/layout-propeller.json" "$APP/layouts/propeller.json"
cp "$HERE/layout-propeller-glass.json" "$APP/layouts/propeller-glass.json"
echo ok
