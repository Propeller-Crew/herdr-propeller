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

link() { ln -sfn "$1" "$APP/mods/$(basename "$1")"; }
link "$HERE/mods/propeller"
link "$HERE/mods/space-folders"
for m in "$EXT"/herdr-mods/islands/mods/islands-*; do link "$m"; done
# herdr-sim as a pane only (its tab-bar clone is left out).
link "$EXT/herdr-sim/mods/herdr-sim"
link "$EXT/herdr-sim/mods/herdr-sim-screen"
for t in "$HERE"/themes/*.json; do ln -sfn "$t" "$APP/themes/$(basename "$t")"; done
echo ok
