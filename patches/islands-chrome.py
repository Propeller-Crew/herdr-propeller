# islands-workspace-chrome (CodeyPacker/herdr-mods): "main_opacity" writes the theme's background,
# faded, into the layout as a hex colour. Our glass themes already have a see-through background,
# and a hex frozen there keeps the old palette when the colours change: keep the theme's name then.
import sys
path = sys.argv[1]
s = open(path).read()
a = 'const want = typeof o === "number" && o < 1 ? fade(theme().background, o) : "background";'
if s.count(a) != 1:
    sys.exit("islands-workspace-chrome patch did not apply, upstream changed: applyMainOpacity")
s = s.replace(a, 'const want = typeof o === "number" && o < 1 && /^#[0-9a-f]{6}$/i.test(theme().background) ? fade(theme().background, o) : "background";')
open(path, "w").write(s)
