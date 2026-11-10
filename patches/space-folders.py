#!/usr/bin/env python3
"""Space icons for space-folders: a space's badge shows its picked icon (a full-color image, or a glyph drawn white on a color, both files
under ~/.config/herdr-app) from shared("space.icons") instead of its first letter, and the
"This computer" header gets a ✨ button that asks the propeller mod to pick the missing ones
(shared "space.icons.ask"; it shows a spinner while "space.icons.busy")."""
import sys, pathlib
p = pathlib.Path(sys.argv[1]) / "main.js"
s = p.read_text()

def rep(a, b):
    global s
    if a not in s:
        sys.exit(f"space-folders patch did not apply, upstream changed near: {a[:70]}")
    s = s.replace(a, b, 1)

rep('import { View, div, svg } from "gpui-kit";', 'import { View, div, svg, image } from "gpui-kit";')
rep('const MARK = {', '''// A space's badge: its picked icon, else the first letter of its name on its color.
function badge(w, fill) {
  const ic = (shared("space.icons") ?? {})[w.id];
  if (ic?.image) return image(ic.image).size(18).flex_none().rounded(5);
  if (ic?.glyph) return h_flex().size(18).flex_none().rounded(5).bg(ic.color ?? fill).items_center().justify_center().child(svg(ic.glyph).size(12).text_color("#ffffff"));
  return h_flex().size(18).flex_none().rounded(5).bg(fill).items_center().justify_center().text_size(10.5).font_bold().text_color("#ffffff").child([...w.name][0]?.toUpperCase() ?? "?");
}

const MARK = {''')
rep('''.when(!tree, el => el.child(h_flex().size(18).flex_none().rounded(5).bg(fill).items_center().justify_center().text_size(10.5).font_bold().text_color("#ffffff").child([...w.name][0]?.toUpperCase() ?? "?")))''',
    '''.when(!tree, el => el.child(badge(w, fill)))''')
rep('''          .on_click((_e, cx) => { cx.stop_propagation(); this.newFolder(m); }).child(svg("mods/workspace-chrome/folder-plus.svg").size(12))))''',
    '''          .on_click((_e, cx) => { cx.stop_propagation(); this.newFolder(m); }).child(svg("mods/workspace-chrome/folder-plus.svg").size(12))))
        .when(connected && !m, el => el.child(div().id("space-icons-ask").flex_none().px(3).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => { cx.stop_propagation(); if (!shared("space.icons.busy")) setShared("space.icons.ask", Date.now()); })
          .child(shared("space.icons.busy") ? svg("mods/workspace-chrome/spinner.svg").size(12).spin(900) : svg("mods/space-folders/sparkles.svg").size(12))))''')
# The folded rail shows the same badge instead of the space's number.
rep('''      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))''',
    '''      .child(badge(w, (() => { const c = (shared("space.colors") ?? {})[w.id] ?? "ansi6"; return c.startsWith("#") ? c : (MARK[c] ?? t[c]); })()))''')
p.write_text(s)
(pathlib.Path(sys.argv[1]) / "sparkles.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    '<path d="M10 3 L11.8 8.2 L17 10 L11.8 11.8 L10 17 L8.2 11.8 L3 10 L8.2 8.2 Z"/><path d="M18 14 L18.9 16.1 L21 17 L18.9 17.9 L18 20 L17.1 17.9 L15 17 L17.1 16.1 Z"/></svg>\n')
