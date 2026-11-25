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
for name in ("focused", "terminals"):
    m = re.search(r'import \{([^}]*)\} from "herdr";', s)
    if name not in m.group(1): s = s[:m.start()] + 'import {' + m.group(1).rstrip() + f', {name} }} from "herdr";' + s[m.end():]

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

# 4. Calmer tabs: the active one a solid card in the terminal's own color with normal text (not
#    yellow), the rest without a frame, just text; an agent's icon only when it isn't Claude
#    everywhere (the state dot or spinner already says it's an agent).
swap('''        .border(1).border_color(t.border).bg(islandFill(t.surface)).text_color(c.active ? t.ansi3 : t.muted) // every tab is a pill, the active one in the theme's yellow (ansi3), like the branch pill
        .hover(s => s.bg(t.hover))''',
     '''        .border(1).border_color(c.active ? t.border : "#00000000").bg(c.active ? t.background : "#00000000")
        .text_color(c.active ? t.foreground : t.muted).when(c.active, el => el.font_medium())
        .hover(s => s.bg(c.active ? t.background : t.hover).text_color(t.foreground))''')
swap('''        .when(Boolean(program?.icon), el =>''', '''        .when(Boolean(program?.icon) && !program?.agent, el =>''')
swap('''program.tint ? svg(program.icon).size(14).text_color(c.active ? t.ansi3 : t.muted)''', '''program.tint ? svg(program.icon).size(14).text_color(c.active ? t.foreground : t.muted)''')
swap('''.child(div().max_w(170).truncate()''', '''.child(div().max_w(200).truncate()''')

# 6. An orchestrator tab (Перрі) shows Perry before its name: same rule as propeller-agents' bossTabs.
swap('''    const item = (c, i) => {''', '''    const tabOf = new Map(panes().filter(p => p.terminal).map(p => [p.terminal, p.tab]));
    const bosses = new Set();
    for (const x of terminals()) {
      if (x.state !== "live") continue;
      const own = tabOf.get(x.address), boss = tabOf.get(x.labels?.["propeller.parent"]);
      if (own && x.labels?.["propeller.role"] === "orchestrator") bosses.add(own);
      if (boss && boss !== own) bosses.add(boss);
    }
    for (const x of terminals()) { const own = tabOf.get(x.address); if (own && x.state === "live" && x.labels?.["propeller.parent"] && x.labels?.["propeller.role"] !== "orchestrator") bosses.delete(own); } // a worker's worker doesn't make it Перрі
    const item = (c, i) => {''')
swap('''.child(div().max_w(200).truncate()''', '''.when(bosses.has(c.id), el => el.child(image("mods/propeller-art/perry.png").size(16).flex_none()))
        .child(div().max_w(200).truncate()''')

# 5. Right-click a tab: our menu (patches/propeller-menu.py), with «Оновити назву» on top.
swap('''openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab",''', '''openOverlay({ mod: "propeller-menu", kind: "popup", width: 220, props: { tab: "tab",''')

# 6. Scrolling over the bar only scrolls it. Upstream switched tabs on every wheel event with any
#    vertical delta, so a two-finger horizontal swipe on a trackpad (a few px of y in each of its
#    dozens of events) flipped through the tabs while scrolling. Cmd+Opt+←/→ switches tabs.
s = re.sub(r'\n *\.on_scroll_wheel\(e => \{[^\n]*run\(e\.delta\.y > 0 \? "tab\.prev" : "tab\.next"\);? \}\)', '', s, count=1)
if 'run(e.delta.y > 0 ? "tab.prev"' in s: sys.exit("islands-tabs patch: upstream changed the wheel handler")

# 7. «План» (mods/propeller-plan): a pill for the side panel's plan block, in every space when this
#    Mac has a Propeller Tasks token (shared propeller.planReady, set by the propeller mod; a space
#    without a plan says how to start one). Not only where a plan exists: the plan mod runs only
#    while the panel is open, so it couldn't tell the bar beforehand (23.11).
swap('''const enabled = shared("workspace.panels") ?? ["files", "changes"];''',
     '''const enabled = [...(shared("workspace.panels") ?? ["files", "changes"]), "plan"];''')
swap('''        .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))''',
     '''        .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
        .when(Boolean(shared("propeller.planReady")), el => el.child(actionPill("tab-plan", svg("mods/propeller-art/list-checks.svg").size(15), () => {
          if (panel && !panel.hidden && body?.active === "plan") run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: "plan" }); run("layout.show", { id: "panel" }); }
        }, Boolean(panel && !panel.hidden && body?.active === "plan"))))''')

# 8. The side panel stays as you left it across spaces. Upstream restored it per space, so going
#    between a space with it open and one without changed the terminal's width each time, and
#    Claude Code redrew its screen into the scrollback: the same answer stacked up again and
#    again (23.11, once «План» lived there).
swap('''  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;''', '''  syncPanel(space, panel, body, enabled) {
    return; // one panel for every space (patch 8)
    if (!space || !panel) return;''')

open(path, "w").write(s)
