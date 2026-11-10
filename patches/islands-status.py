# islands-workspace-status (CodeyPacker/herdr-mods): the focused pane's folder after the machine,
# moved here from the pane header (patches/islands-pane.py). Click: open it in Finder.
import sys
path = sys.argv[1]
s = open(path).read()
def rep(a, b):
    global s
    if s.count(a) != 1:
        sys.exit(f"islands-workspace-status patch did not apply, upstream changed: {a[:60]}")
    s = s.replace(a, b)
rep('import { spaces, agents, theme, shared } from "herdr";',
    'import { spaces, agents, panes, theme, shared, home, exec } from "herdr";')
rep('''    const label = (icon, text, color) =>''', '''    const tabs = new Set((space?.tabs ?? []).map((c) => c.id));
    const cwd = panes().find((p) => p.focused && tabs.has(p.tab))?.cwd ?? panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd;
    const h = home(), where = !cwd ? "" : cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
    const label = (icon, text, color) =>''')
rep('''      .when(Boolean(space?.branch)''', '''      .when(Boolean(where), el => el.child(label("folder", where, t.muted).id("status-folder").min_w(0).hover(s => s.text_color(t.foreground))
        .on_click(() => { if (!space?.machine) exec("open", [cwd]).catch(() => null); })))
      .when(Boolean(space?.branch)''')
open(path, "w").write(s)
