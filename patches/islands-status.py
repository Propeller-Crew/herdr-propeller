# islands-workspace-status (CodeyPacker/herdr-mods): the focused pane's folder after the machine,
# moved here from the pane header (patches/islands-pane.py). Click: open it in Finder.
# And the free disk space of the space's machine at the end (the Mac, or the server) (red under 10 GB, amber under 20). Click on this Mac: Storage settings.
import sys
path = sys.argv[1]
s = open(path).read()
def rep(a, b):
    global s
    if s.count(a) != 1:
        sys.exit(f"islands-workspace-status patch did not apply, upstream changed: {a[:60]}")
    s = s.replace(a, b)
rep('import { spaces, agents, theme, shared } from "herdr";',
    'import { spaces, agents, panes, theme, shared, home, exec, appHome, openOverlay, nextCommand, checking } from "herdr";')
rep('''    const label = (icon, text, color) =>''', '''    const tabs = new Set((space?.tabs ?? []).map((c) => c.id));
    const cwd = panes().find((p) => p.focused && tabs.has(p.tab))?.cwd ?? panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd;
    const h = home(), where = !cwd ? "" : cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
    const label = (icon, text, color) =>''')
rep('''      .when(Boolean(space?.branch)''', '''      .when(Boolean(where), el => el.child(label("folder", where, t.muted).id("status-folder").min_w(0).hover(s => s.text_color(t.foreground))
        .on_click(() => { if (!space?.machine) exec("open", [cwd]).catch(() => null); })))
      .when(Boolean(space?.branch)''')
rep('''export default class WorkspaceStatus extends View {
  render() {''', '''// Free space on the active space's machine, from df, once a minute: this Mac's data volume, or
// the disk holding home on a server space (Artem, 17.11: on the server it showed the Mac's).
async function freeDisk(machine) {
  const r = machine
    ? await exec("df", ["-Pk", "."], { on: machine, timeout: 8000 }).catch(() => null)
    : await exec("/bin/df", ["-k", "/System/Volumes/Data"], { timeout: 5000 }).catch(() => null);
  const kb = parseInt((r?.stdout ?? "").trim().split("\\n").pop()?.split(/\\s+/)[3], 10);
  return Number.isFinite(kb) ? kb / 1024 / 1024 : null;
}

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.free = new Map(); // machine (null = this Mac) -> GB
    this.asking = new Set();
    const ask = (cx, m) => {
      if (this.asking.has(m)) return;
      this.asking.add(m);
      cx.spawn(async (cx) => { const gb = await freeDisk(m); this.asking.delete(m); if (gb !== null) this.free.set(m, gb); cx.notify(); });
    };
    const machinesNow = () => [null, ...new Set(spaces().map(s => s.machine).filter(Boolean))];
    ask(cx, null);
    cx.timer.every(60000, (cx) => machinesNow().forEach(m => ask(cx, m)));
    // A server space opened or switched to: its number within seconds, not at the next minute.
    cx.timer.every(3000, (cx) => machinesNow().forEach(m => { if (!this.free.has(m)) ask(cx, m); }));
    // The «Диск» panel (propeller-disk, from ~/code/disk-track on Artem's Mac): the click on the free
    // space opens it when it's installed, else Storage settings. `islands-workspace-status.disk` too.
    this.diskPanel = false;
    if (checking()) return;
    cx.spawn(async (cx) => {
      this.diskPanel = (await exec("/bin/test", ["-e", `${appHome()}/mods/propeller-disk/main.js`]).catch(() => null))?.code === 0;
      for (;;) { if ((await nextCommand()) === "disk") this.openDisk(); }
    });
  }

  openDisk() {
    if (this.diskPanel) openOverlay({ mod: "propeller-disk", kind: "window", key: "propeller-disk", width: 460, height: 680 });
    else exec("open", ["x-apple.systempreferences:com.apple.settings.Storage"]).catch(() => null);
  }

  render() {''')
rep('''        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))));''',
'''        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .when(this.free.has(space?.machine ?? null), el => {
        const gb = this.free.get(space?.machine ?? null), color = gb < 10 ? t.blocked : gb < 20 ? t.working : t.muted;
        const text = `${gb < 10 ? gb.toFixed(1).replace(".", ",") : Math.round(gb)} ГБ вільно`;
        return el.child(h_flex().id("status-disk").gap(6).items_center().text_color(gb < 20 ? color : t.muted)
          .hover(s => s.text_color(t.foreground))
          .on_click(() => { if (!space?.machine) this.openDisk(); })
          .child(svg("mods/propeller-art/hard-drive.svg").size(13).text_color(color)).child(text));
      });''')
open(path, "w").write(s)
