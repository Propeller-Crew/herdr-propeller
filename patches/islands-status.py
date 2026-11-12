# islands-workspace-status (CodeyPacker/herdr-mods): the focused pane's folder after the machine,
# moved here from the pane header (patches/islands-pane.py). Click: open it in Finder.
# And the Mac's free disk space at the end (red under 10 GB, amber under 20). Click: Storage settings.
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
rep('''export default class WorkspaceStatus extends View {
  render() {''', '''// Free space on this Mac's data volume, from df, once a minute.
async function freeDisk() {
  const r = await exec("/bin/df", ["-k", "/System/Volumes/Data"], { timeout: 5000 }).catch(() => null);
  const kb = parseInt((r?.stdout ?? "").trim().split("\\n").pop()?.split(/\\s+/)[3], 10);
  return Number.isFinite(kb) ? kb / 1024 / 1024 : null;
}

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.free = null;
    const look = (cx) => cx.spawn(async (cx) => { this.free = await freeDisk(); cx.notify(); });
    look(cx);
    cx.timer.every(60000, look);
  }

  render() {''')
rep('''        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))));''',
'''        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .when(this.free !== null, el => {
        const gb = this.free, color = gb < 10 ? t.blocked : gb < 20 ? t.working : t.muted;
        const text = `${gb < 10 ? gb.toFixed(1).replace(".", ",") : Math.round(gb)} ГБ вільно`;
        return el.child(h_flex().id("status-disk").gap(6).items_center().text_color(gb < 20 ? color : t.muted)
          .hover(s => s.text_color(t.foreground))
          .on_click(() => exec("open", ["x-apple.systempreferences:com.apple.settings.Storage"]).catch(() => null))
          .child(svg("mods/propeller-art/hard-drive.svg").size(13).text_color(color)).child(text));
      });''')
open(path, "w").write(s)
