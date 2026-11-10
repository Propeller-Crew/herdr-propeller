# islands-pane (CodeyPacker/herdr-mods): the header shows the space's name where the folder was.
# The folder moves to the status bar (patches/islands-status.py).
import sys
path = sys.argv[1]
s = open(path).read()
def rep(a, b):
    global s
    if s.count(a) != 1:
        sys.exit(f"islands-pane patch did not apply, upstream changed: {a[:60]}")
    s = s.replace(a, b)
rep('import { panes, props, run, theme, home, shared } from "herdr";',
    'import { panes, spaces, props, run, theme, home, shared } from "herdr";')
rep('.child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd)))',
    '.child(div().flex_1().truncate().text_color(t.muted).child(spaces().find((s) => (s.tabs ?? []).some((c) => c.id === p.tab))?.name ?? folder(p.cwd)))')
open(path, "w").write(s)
