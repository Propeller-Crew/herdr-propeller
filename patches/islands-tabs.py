"""Our changes to the Islands tab bar (CodeyPacker/herdr-mods islands-tabs), applied by sync-mods.sh.

1. The right-hand actions are separate pills, each the full height of the bar, so hover fills
   the whole pill (the original put 26 px buttons inside one card: a button in a button).
2. A Simulator pill (herdr-sim) that opens the simulator beside the panes, or closes it.
3. Files and Changes stay off (we set shared "workspace.panels" to []), so their pills don't show.
"""
import sys

path = sys.argv[1]
s = open(path).read()

def swap(old, new):
    global s
    if old not in s:
        sys.exit(f"islands-tabs patch: upstream changed, can't find:\n{old}")
    s = s.replace(old, new, 1)

# Add focused to the herdr import, whatever else upstream imports there.
import re
m = re.search(r'import \{([^}]*)\} from "herdr";', s)
if not m: sys.exit("islands-tabs patch: upstream changed, no herdr import")
if "focused" not in m.group(1): s = s[:m.start()] + 'import {' + m.group(1).rstrip() + ', focused } from "herdr";' + s[m.end():]

swap('''      .child(h_flex().id("tab-actions").flex_none().h_full().px(10).gap(2).items_center().rounded(14).bg(islandFill(t.chrome)).border(1).border_color(t.border)
        .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))''',
     '''      .child(h_flex().id("tab-actions").flex_none().h_full().gap(8).items_center()
        .child(actionPill("tab-sim", svg("mods/herdr-sim/icons/smartphone.svg").size(15), toggleSim, simOpen))
        .child(actionPill("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))''')

swap('''    const item = (c, i) => {''',
     '''    // A whole-height pill: hover and the open state fill all of it.
    const actionPill = (id, label, action, on = false) => div().id(id).h_full().w(46).flex_none().flex().items_center().justify_center()
      .rounded(14).border(1).border_color(on ? t.accent : t.border).bg(islandFill(t.chrome)).text_color(on ? t.accent : t.muted).text_size(16)
      .hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const simPane = panes().find(p => p.mod === "herdr-sim" && shown.some(c => c.active && c.id === p.tab));
    const simOpen = Boolean(simPane);
    const toggleSim = () => simPane ? run("pane.close", { pane: simPane.pane }) : run("pane.split", { direction: "right", mod: "herdr-sim" });
    const item = (c, i) => {''')

open(path, "w").write(s)
