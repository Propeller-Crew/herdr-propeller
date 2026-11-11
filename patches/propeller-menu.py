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
const under = (f, dir) => f === dir || (f ?? "").startsWith(dir + "/");
const profileOf = (s) => (shared("propeller.profile") ?? {})[s.id] ?? ((shared("propeller.config")?.personalFolders ?? []).some((d) => under(s.folder, d)) ? "personal" : "work");
const asleep = (s) => (shared("space-folders") ?? {})[s.machine ?? ""]?.of?.[localId(s)] === SLEEP;
function propellerItems(id) {
  const s = spaces().find((x) => x.id === id);
  if (!s) return [];
  const to = profileOf(s) === "work" ? "personal" : "work";
  return [
    [to === "work" ? "Перенести в Робоче" : "Перенести в Особисте", "propeller.profile", { id, to }],
    asleep(s) ? ["Розбудити", "propeller.sleep", { id, on: false }] : ["Приспати", "propeller.sleep", { id, on: true }],
    ["Оновити іконку й назву", "propeller.refresh", { id }],
  ];
}
const placeOf = (id) => { const s = spaces().find((x) => x.id === id); return s ? place(s) : undefined; };
function propellerRun(command, args) {
  if (command === "propeller.free") return setShared("propeller.free", Date.now());
  if (command === "propeller.colors") return openOverlay({ mod: "propeller-colors", kind: "dialog", width: 300, height: 500 });
  if (command === "propeller.update") return setShared("propeller.updateNow", Date.now());
  const s = spaces().find((x) => x.id === args.id);
  if (!s) return;
  if (command === "propeller.refresh") setShared("propeller.refresh", { id: s.id, at: Date.now() });
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
rep('''    case "tab":''', '''    case "propeller":
      return [
        ...(shared("propeller.update") ? [["Оновити herdr-propeller", "propeller.update", {}]] : []),
        ["Кольори…", "propeller.colors", {}],
        ["Звільнити RAM", "propeller.free", {}],
      ];
    case "tab":''')
rep('''  if (command === "propeller.sleep") return''', '''  if (command === "propeller.free") return "mods/propeller-art/moon.svg";
  if (command === "propeller.refresh") return "mods/propeller-art/sparkles.svg";
  if (command === "propeller.colors") return "mods/propeller-art/palette.svg";
  if (command === "propeller.update") return "mods/propeller-art/arrow-down-to-line.svg";
  if (command === "propeller.sleep") return''')
# cmd-t opens a plain tab, not our Claude ones: no shortcut hint on them.
rep('''child(shortcut(it[1], it[2]))''', '''child(it[2]?.argv ? "" : shortcut(it[1], it[2]))''')
# A new space starts with Claude, like cmd-n and the sidebar's +.
rep('''["New space", "space.new", {}],''', '''["New space", "propeller-agents.new", {}],''')
(dst / "main.js").write_text(s)
shutil.copy(src / "mod.json", dst / "mod.json")
