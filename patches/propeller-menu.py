#!/usr/bin/env python3
"""propeller-menu: Herdr's shipped context menu (mods/menu, rewritten by the app on every start)
plus two items in a space's menu: move it to the other profile (Робоче/Особисте, the
propeller-agents sidebar) and put it to sleep or wake it (the propeller mod's "Сплять").
Built from the shipped file on every sync, so Herdr's own menu changes still come through."""
import sys, pathlib, shutil
src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
if dst.exists():
    for f in dst.iterdir():
        if f.is_file(): f.unlink()
dst.mkdir(parents=True, exist_ok=True)
s = (src / "main.js").read_text()

def rep(a, b):
    global s
    if a not in s:
        sys.exit(f"propeller-menu patch did not apply, the shipped menu changed near: {a[:70]}")
    s = s.replace(a, b, 1)

rep('import { run, props, closeOverlay, openOverlay, theme, keys, terminals, spaces, panes, exec } from "herdr";',
    '''import { run, props, closeOverlay, openOverlay, theme, keys, terminals, spaces, panes, exec, shared, setShared } from "herdr";

// --- Propeller: profiles and sleep (same rules as mods/propeller-agents) ---
const SLEEP = "propeller-sleep";
const localId = (s) => (s.machine ? s.id.slice(s.machine.length + 1) : s.id);
const profileOf = (s) => (shared("propeller.profile") ?? {})[s.id] ?? (/\\/ObsidianVault(\\/|$)/.test(s.folder ?? "") ? "personal" : "work");
const asleep = (s) => (shared("space-folders") ?? {})[s.machine ?? ""]?.of?.[localId(s)] === SLEEP;
function propellerItems(id) {
  const s = spaces().find((x) => x.id === id);
  if (!s) return [];
  const to = profileOf(s) === "work" ? "personal" : "work";
  return [
    [to === "work" ? "Перенести в Робоче" : "Перенести в Особисте", "propeller.profile", { id, to }],
    asleep(s) ? ["Розбудити", "propeller.sleep", { id, on: false }] : ["Приспати", "propeller.sleep", { id, on: true }],
  ];
}
const placeOf = (id) => { const s = spaces().find((x) => x.id === id); return s ? place(s) : undefined; };
function propellerRun(command, args) {
  const s = spaces().find((x) => x.id === args.id);
  if (!s) return;
  if (command === "propeller.profile") setShared("propeller.profile", { ...(shared("propeller.profile") ?? {}), [s.id]: args.to });
  if (command === "propeller.sleep") {
    // Into "Сплять" or out of it: the propeller mod sees the move and settles or wakes the space.
    const all = shared("space-folders") ?? {}, k = s.machine ?? "", cur = all[k] ?? { list: [], of: {} };
    const of = { ...cur.of };
    if (args.on) of[localId(s)] = SLEEP; else delete of[localId(s)];
    setShared("space-folders", { ...all, [k]: { ...cur, of, at: Date.now() } });
  }
}''')
rep('''        ["Rename", "space.rename", { id: tg.id }],
        ...(git''', '''        ["Rename", "space.rename", { id: tg.id }],
        ...propellerItems(tg.id),
        // A second Claude in this space, in a new tab; or one on its own branch (claude -w), in a repo.
        ["Ще один Claude", "tab.new", { space: tg.id, folder: placeOf(tg.id), argv: ["claude"] }],
        ...(git ? [["Claude в окремій гілці", "tab.new", { space: tg.id, folder: placeOf(tg.id), argv: ["claude", "-w"] }]] : []),
        ...(git''')
rep('''function menuIcon(command) {''', '''function menuIcon(command, args) {
  if (command === "propeller.profile") return `mods/propeller-art/${args.to === "work" ? "briefcase" : "house"}.svg`;
  if (command === "propeller.sleep") return `mods/propeller-art/${args.on ? "moon" : "sun"}.svg`;
  if (command === "tab.new" && args?.argv?.[0] === "claude") return args.argv[1] === "-w" ? "mods/workspace-chrome/git-branch.svg" : "icons/claude.svg";''')
rep('''.child(svg(menuIcon(it[1]))''', '''.child(svg(menuIcon(it[1], it[2]))''')
rep('''    else run(it[1], it[2]);''', '''    else if (it[1].startsWith("propeller.")) propellerRun(it[1], it[2]);
    else run(it[1], it[2]);''')
(dst / "main.js").write_text(s)
shutil.copy(src / "mod.json", dst / "mod.json")
