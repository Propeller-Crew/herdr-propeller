// Propeller: what cmux-claude-sidebar gave us, on top of Herdr's own sidebar.
//
// 1. Claude comes back after a reboot. Herdr gives a lost terminal a fresh shell
//    in its folder and never re-runs the program. We remember which Claude
//    conversation each terminal had (~/.claude/sessions/<pid>.json) and, when the
//    terminal's shell changes under us without Claude, type `claude --resume <id>`.
// 2. Sleeping spaces. A space with no agent activity and no visit for a day has
//    its tabs settled and moves into a folded "Сплять" folder of the space-folders
//    mod (jankeesvw/herdr-space-folders); it goes back to its own folder when an
//    agent there needs you, starts working, or you open it.
// 3. Claude subscription limits (5 h and weekly) from ~/.claude/rate-limits.json,
//    which our Claude status line writes on every turn.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, terminals, panes, hc, exec, theme, run, home, shared, setShared } from "herdr";
import * as fs from "fs/promises";

const DAY = 24 * 3600 * 1000;
// The space-folders mod keeps each machine's folders in shared("space-folders")[machine ?? ""]
// and in ~/.config/herdr-space-folders.json on that machine: { list: [{id, name, folded}], of: {spaceId: folderId}, at }.
const SLEEP = { id: "propeller-sleep", name: "Сплять", folded: true, color: "ansi4" };
const RULES = "__rules__"; // "the space had no folder of its own": its folder came from rules
const FOLDERS_FILE = "~/.config/herdr-space-folders.json";
const localId = (s) => (s.machine ? s.id.slice(s.machine.length + 1) : s.id);
const BAR = 54;
// The cmux sidebar's pixel octopus: frames in ~/.config/herdr-app/mods/propeller-art/<mood>-<i>.png (sync-mods.sh).
const OCTO = { sleep: 1, idle: 4, work: 2, needs: 2, party: 2 };
const CLEAN_ENV = `for v in $(env | sed -nE 's/^(CLAUDECODE|CLAUDE_PID|CLAUDE_CODE_[A-Za-z0-9_]+)=.*/\\1/p' | grep -vE '^CLAUDE_CODE_(USE|SKIP|DISABLE|ENABLE|MAX|OAUTH|CLIENT|API)_'); do unset "$v"; done;`;
const ACTIVE = new Set(["blocked", "done", "working"]);

const statePath = () => `${home()}/.config/herdr-app/data/propeller-state.json`;
// Written by import-cmux.py: { resume: {terminal: session}, seen: {space: ms}, at }.
const importPath = () => `${home()}/.config/herdr-app/data/propeller-import.json`;
const machineOf = (addr) => (addr.includes("/") ? addr.split("/")[0] : null);

function left(ts) {
  const s = Math.max(0, Math.round(ts - Date.now() / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h >= 48) return `${Math.round(h / 24)} д`; // the week's reset: days are enough, and they fit
  return h >= 24 ? `1 д ${h % 24} год` : `${h}:${String(m).padStart(2, "0")}`;
}

export default class Propeller extends View {
  init(_props, cx) {
    // seen: space id -> ms of last activity or visit; claude: terminal -> {shell, session, cwd};
    // settled: space ids whose tabs we put away (we only bring back what we put away).
    // settled: space id -> the folder it had before sleeping (RULES: none of its own).
    // pending: terminal -> Claude conversation to fork into it the first time you open it
    // (from import-cmux.py); quiet: space id -> ms before which tab changes don't count as
    // activity (the import itself made them).
    // dozed: spaces you dragged into "Сплять" yourself -> "here" while you're still in them,
    // "away" once you've left; opening one again (or its agent working) wakes it.
    this.state = { seen: {}, claude: {}, settled: {}, pending: {}, quiet: {}, dozed: {} };
    this.saved = "";
    this.limits = null;
    this.busy = false;
    cx.spawn(async (cx) => {
      try { this.state = { ...this.state, ...JSON.parse(await fs.readFile(statePath(), "utf8")) }; } catch {}
      await this.tick();
      await this.readLimits();
      cx.notify();
    });
    cx.timer.every(1000, (cx) => { if (Object.keys(this.state.pending).length) this.wake(); });
    cx.timer.every(1000, (cx) => {
      const ask = shared("space.icons.ask");
      if (ask && ask !== this.asked && !shared("space.icons.busy")) {
        this.asked = ask;
        setShared("space.icons.ask", null); // handled: a reload doesn't ask again
        cx.spawn(async () => { await this.pickIcons(); });
      }
    });
    // The octopus: a new frame each second while its mood has more than one.
    cx.timer.every(1000, (cx) => { if (OCTO[this.mood()] > 1) cx.notify(); });
    cx.timer.every(15000, (cx) => cx.spawn(async (cx) => { await this.tick(); cx.notify(); }));
    cx.timer.every(30000, (cx) => cx.spawn(async (cx) => { await this.readLimits(); cx.notify(); }));
  }

  async readLimits() {
    try {
      this.limits = JSON.parse(await fs.readFile(`${home()}/.claude/rate-limits.json`, "utf8"));
    } catch { this.limits = null; }
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.takeImport();
      await this.trackClaude();
      this.trackActivity();
      await this.sleep();
      await this.save();
    } catch (e) {
      console.log("propeller tick:", e?.message ?? e);
    } finally {
      this.busy = false;
    }
  }

  // --- 0. Spaces brought over from cmux ------------------------------------------
  async takeImport() {
    let imp;
    try { imp = JSON.parse(await fs.readFile(importPath(), "utf8")); } catch { return; }
    Object.assign(this.state.pending, imp.resume ?? {});
    for (const [id, ms] of Object.entries(imp.seen ?? {})) {
      this.state.seen[id] = ms || Date.now();
      this.state.quiet[id] = (imp.at ?? Date.now()) + 60000;
    }
    await fs.unlink(importPath());
  }

  // You opened a space whose terminals wait for their Claude: start each, a fork of the cmux one.
  // The whole space at once, not only the tab you look at, so its other tabs are ready too.
  wake() {
    const space = spaces().find((s) => s.active);
    if (!space || this.state.dozed[space.id]) return; // just put to sleep by hand while you're in it
    const tabs = new Set(space.tabs.map((t) => t.id));
    for (const p of panes()) {
      if (!p.terminal || !tabs.has(p.tab) || !this.state.pending[p.terminal]) continue;
      // A string: from cmux, forked so the cmux original stays its own. {session}: put to sleep here.
      const w = this.state.pending[p.terminal];
      delete this.state.pending[p.terminal];
      const cmd = typeof w === "string" ? `claude --resume ${w} --fork-session` : `claude --resume ${w.session}`;
      hc(["send", p.terminal, `${CLEAN_ENV} ${cmd}`]).catch(() => null);
    }
  }

  // --- 4. Space icons ----------------------------------------------------------------
  // The ✨ in the Spaces header: a headless Claude picks an icon for every space without one.
  // Our own products: the app's real icon or logo from its code; a brand: its Simple Icons logo;
  // anything else: a Lucide icon. Files go
  // under ~/.config/herdr-app/space-icons (Herdr shows images only from its own folder).
  async pickIcons() {
    const icons = shared("space.icons") ?? {};
    const todo = spaces().filter((s) => !s.machine && !icons[s.id]).map((s) => ({
      id: s.id, name: s.name, folder: s.folder,
      tabs: s.tabs.filter((t) => t.named).map((t) => t.name),
    }));
    if (!todo.length) return;
    setShared("space.icons.busy", true);
    const dir = `${home()}/.config/herdr-app/space-icons`;
    const prompt = `Pick an icon for each workspace below (a list of a person's work sessions in a terminal app).

For each one, decide what it is about from its name, folder and tab names, then give it the most fitting icon, in this order:
1. An app or product whose code is in its folder: its real app icon or logo from its code (an AppIcon.appiconset PNG, icon.png, favicon, logo; the largest). Make a 64 px PNG:
     sips -s format png -Z 64 "<source>" --out "${dir}/<id>.png"
   and answer {"image": "space-icons/<id>.png"}. Look quickly; don't search the whole disk.
2. About a brand, product or service (Amazon, Home Assistant, Instagram, GitLab, Lightroom, Kindle, Obsidian, Raspberry Pi…): its logo from Simple Icons:
     curl -fsSL https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/<slug>.svg -o "${dir}/<id>.svg"
   (slug: lowercase name without spaces or dots, e.g. homeassistant, amazon, instagram). Answer {"glyph": "space-icons/<id>.svg", "color": "#<the brand's main color>"}. If curl fails (the brand isn't there), go to 3.
3. Anything else: a fitting icon from Lucide (lucide.dev names: battery-charging, hard-drive, film, music, key-round, printer, camera, piano, cpu, book-open, sticker, scissors…):
     curl -fsSL https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/<name>.svg -o "${dir}/<id>.svg"
   Answer {"glyph": "space-icons/<id>.svg"}. Try another name if curl fails.
Never draw or invent an SVG yourself.

Reply with only one JSON object: {"<id>": {"image": "…"} or {"glyph": "…", "color"?: "…"}, …}, every id below, nothing else.

${JSON.stringify(todo, null, 1)}`;
    try {
      await fs.mkdir(dir, { recursive: true });
      // zsh -ic: the app started from Spotlight has a bare PATH; claude lives where ~/.zshrc (nvm) puts it.
      const r = await exec("/bin/zsh", ["-ic", `${CLEAN_ENV} cd ~ && claude -p "$1" --model sonnet --output-format json --allowedTools "Read,Glob,Grep,Bash(sips:*),Bash(ls:*),Bash(find:*),Bash(curl:*)" < /dev/null`, "zsh", prompt], { timeout: 600000 });
      if (r.code !== 0) throw new Error(`claude exited ${r.code}: ${(r.stderr || r.stdout).slice(-300)}`);
      const text = JSON.parse(r.stdout).result ?? "";
      const picked = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      const next = { ...(shared("space.icons") ?? {}) };
      for (const [id, ic] of Object.entries(picked)) {
        if (ic?.image && await fs.exists(`${home()}/.config/herdr-app/${ic.image}`)) next[id] = { image: ic.image };
        else if (ic?.glyph && await fs.exists(`${home()}/.config/herdr-app/${ic.glyph}`))
          next[id] = { glyph: ic.glyph, ...(/^#[0-9a-fA-F]{6}$/.test(ic.color ?? "") ? { color: ic.color } : {}) };
      }
      setShared("space.icons", next);
    } catch (e) {
      console.log("propeller icons:", e?.message ?? e);
    } finally {
      setShared("space.icons.busy", false);
    }
  }

  // --- 1. Claude after a reboot -------------------------------------------------
  async trackClaude() {
    const live = new Set();
    for (const t of terminals()) {
      if (t.state !== "live") continue;
      const addr = t.address;
      live.add(addr);
      let g;
      try {
        const r = await hc(["get", addr, "--json"]);
        if (r.code !== 0) continue;
        g = JSON.parse(r.stdout);
      } catch { continue; }
      const fg = g.foreground;
      const prev = this.state.claude[addr];
      if (fg && /claude/i.test(fg.name ?? "")) {
        const machine = machineOf(addr);
        const path = machine ? `.claude/sessions/${fg.pid}.json` : `${home()}/.claude/sessions/${fg.pid}.json`;
        try {
          const r = await exec("cat", [path], { on: machine, timeout: 5000 });
          const s = JSON.parse(r.stdout);
          if (s.sessionId) this.state.claude[addr] = { shell: g.pid, session: s.sessionId, cwd: fg.cwd ?? s.cwd };
        } catch {}
      } else if (prev && prev.shell !== g.pid) {
        // The shell under this terminal changed and Claude isn't running: the core
        // lost the program (reboot, crash, logout) and gave it a fresh shell.
        // Unset a parent Claude session's markers first (same line as shepherdr's clean-env.js):
        // a core started from inside Claude Code hands them to every terminal, and Claude then
        // stops saving the conversation.
        await hc(["send", addr, `${CLEAN_ENV} claude --resume ${prev.session}`]);
        prev.shell = g.pid;
      } else if (prev) {
        // Same shell, Claude gone: the person quit it on purpose.
        delete this.state.claude[addr];
      }
    }
    // Forget terminals that are closed for good. Keep the rest while the core reports none
    // (it may still be starting after a reboot).
    if (live.size) for (const addr of Object.keys(this.state.claude)) if (!live.has(addr)) delete this.state.claude[addr];
  }

  // --- 2. Sleeping -------------------------------------------------------------
  trackActivity() {
    const now = Date.now();
    for (const s of spaces()) {
      const d = this.state.dozed[s.id];
      if (d) {
        if (!s.active) this.state.dozed[s.id] = "away";
        else if (d === "away") delete this.state.dozed[s.id];
        if (s.status === "working" || s.status === "blocked") delete this.state.dozed[s.id];
        if (this.state.dozed[s.id]) continue; // asleep by hand: being looked at doesn't wake it yet
      }
      const quiet = this.state.quiet[s.id] ?? 0;
      const changed = Math.max(0, ...s.tabs.map((t) => (t.changed_at ?? 0) > quiet ? t.changed_at : 0));
      const last = this.state.seen[s.id] ?? now;
      this.state.seen[s.id] = Math.max(last, changed, s.active || ACTIVE.has(s.status) ? now : 0);
    }
    const ids = new Set(spaces().map((s) => s.id));
    for (const id of Object.keys(this.state.seen)) if (!ids.has(id)) delete this.state.seen[id];
    for (const id of Object.keys(this.state.dozed)) if (!ids.has(id)) delete this.state.dozed[id];
    for (const id of Object.keys(this.state.quiet)) if (!ids.has(id) || this.state.quiet[id] < now - DAY) delete this.state.quiet[id];
    const live = new Set(terminals().map((t) => t.address));
    if (live.size) for (const t of Object.keys(this.state.pending)) if (!live.has(t)) delete this.state.pending[t];
  }

  sleeping(s) {
    if (this.state.dozed[s.id]) return true;
    return !ACTIVE.has(s.status) && !s.active && Date.now() - (this.state.seen[s.id] ?? Date.now()) > DAY;
  }

  async sleep() {
    let all = shared("space-folders") ?? {};
    const byMachine = new Map();
    for (const s of spaces()) {
      const k = s.machine ?? "";
      if (!byMachine.has(k)) byMachine.set(k, []);
      byMachine.get(k).push(s);
    }
    let next = all;
    for (const [k, list] of byMachine) {
      let cur = all[k];
      if (!cur) {
        // No folders here yet, or space-folders hasn't loaded them: its file on that machine decides.
        const r = await exec("sh", ["-c", `cat ${FOLDERS_FILE} 2>/dev/null || echo '{}'`], { on: k || null, timeout: 5000 }).catch(() => null);
        if (!r || r.code !== 0) continue;
        try { cur = JSON.parse(r.stdout || "{}"); } catch { continue; }
      }
      const data = { list: [...(cur.list ?? [])], of: { ...(cur.of ?? {}) } };
      let changed = false;
      for (const s of list) {
        const id = localId(s);
        if (data.of[id] !== SLEEP.id && s.id in this.state.settled) {
          // Dragged out of "Сплять" by hand: awake from now, where it was put.
          delete this.state.settled[s.id];
          delete this.state.dozed[s.id];
          this.state.seen[s.id] = Date.now();
          for (const t of s.tabs) if (t.settled) run("tab.unsettle", { id: t.id });
          continue;
        }
        if (data.of[id] === SLEEP.id && !(s.id in this.state.settled)) {
          // Dragged into "Сплять" by hand: put it to sleep now, back to its rules' folder on waking.
          this.state.settled[s.id] = RULES;
          this.state.dozed[s.id] = s.active ? "here" : "away";
          this.state.seen[s.id] = Date.now() - DAY - 1000;
        }
        if (this.sleeping(s)) {
          if (data.of[id] !== SLEEP.id) {
            this.state.settled[s.id] = id in data.of ? data.of[id] : RULES;
            data.of[id] = SLEEP.id;
            changed = true;
          }
          for (const t of s.tabs) if (!t.settled) run("tab.settle", { id: t.id });
          this.quitClaude(s);
        } else if (data.of[id] === SLEEP.id) {
          const prev = this.state.settled[s.id];
          if (prev === undefined || prev === RULES) delete data.of[id];
          else data.of[id] = prev;
          delete this.state.settled[s.id];
          for (const t of s.tabs) if (t.settled) run("tab.unsettle", { id: t.id });
          changed = true;
        }
      }
      const asleep = Object.values(data.of).includes(SLEEP.id);
      const has = data.list.some((f) => f.id === SLEEP.id);
      if (asleep && !has) { data.list.push({ ...SLEEP }); changed = true; }
      if (!asleep && has) { data.list = data.list.filter((f) => f.id !== SLEEP.id); changed = true; }
      if (changed) {
        const saved = { list: data.list, of: data.of, at: Date.now() };
        next = { ...next, [k]: saved };
        // The same write the space-folders mod does, on the machine the spaces live on.
        exec("sh", ["-c", `mkdir -p ~/.config && printf '%s\\n' "$1" > ${FOLDERS_FILE}.tmp && mv ${FOLDERS_FILE}.tmp ${FOLDERS_FILE}`, "sh", JSON.stringify(saved)], { on: k || null })
          .catch(() => null);
      }
    }
    if (next !== all) setShared("space-folders", next);
    this.orderSleeping(next);
    for (const id of Object.keys(this.state.settled)) if (!spaces().some((s) => s.id === id)) delete this.state.settled[id];
  }

  // Sleeping spaces in the order you last touched them, newest first (as the cmux sidebar had it).
  // They sit together in their folder, so moving them to the end of the list keeps everything else.
  orderSleeping(folders) {
    const all = spaces();
    const asleep = all.filter((s) => folders[s.machine ?? ""]?.of?.[localId(s)] === SLEEP.id);
    const want = [...asleep].sort((a, b) => (this.state.seen[b.id] ?? 0) - (this.state.seen[a.id] ?? 0));
    if (want.every((s, i) => s.id === asleep[i].id)) return;
    for (const s of want) run("space.move", { id: s.id, index: all.length });
  }

  // "Звільнити пам'ять": every idle Claude quits except the one in front of you, like sleeping does;
  // each comes back in the same conversation when you open its space.
  freeMemory() {
    const active = spaces().find((s) => s.active);
    const here = new Set(active ? active.tabs.map((t) => t.id) : []);
    const status = new Map(terminals().map((t) => [t.address, t.status]));
    let n = 0;
    for (const p of panes()) {
      if (!p.terminal || here.has(p.tab)) continue;
      const c = this.state.claude[p.terminal];
      if (!c || this.state.pending[p.terminal] || status.get(p.terminal) !== "idle") continue;
      this.state.pending[p.terminal] = { session: c.session };
      delete this.state.claude[p.terminal];
      hc(["send", p.terminal, "/exit"]).catch(() => null);
      n += 1;
    }
    this.freed = { n, at: Date.now() };
  }

  // What the octopus does: waves when an agent waits on you, spins its propeller while one
  // works, celebrates a fresh result, blinks if anything happened in the last half hour, else sleeps.
  mood() {
    const st = spaces().map((s) => s.status);
    if (st.includes("blocked")) return "needs";
    if (st.includes("working")) return "work";
    if (st.includes("done")) return "party";
    const last = Math.max(0, ...Object.values(this.state.seen));
    return Date.now() - last < 1800000 ? "idle" : "sleep";
  }

  // A sleeping space's idle Claudes quit (cmux did the same), so they hold no memory and leave
  // the Agents list; opening the space brings each back in the same conversation.
  quitClaude(s) {
    const tabs = new Set(s.tabs.map((t) => t.id));
    const status = new Map(terminals().map((t) => [t.address, t.status]));
    for (const p of panes()) {
      if (!p.terminal || !tabs.has(p.tab)) continue;
      const c = this.state.claude[p.terminal];
      if (!c || this.state.pending[p.terminal] || status.get(p.terminal) !== "idle") continue;
      this.state.pending[p.terminal] = { session: c.session };
      delete this.state.claude[p.terminal];
      hc(["send", p.terminal, "/exit"]).catch(() => null);
    }
  }

  async save() {
    const text = JSON.stringify(this.state);
    if (text === this.saved) return;
    await fs.mkdir(`${home()}/.config/herdr-app/data`, { recursive: true });
    await fs.writeFile(statePath(), text);
    this.saved = text;
  }

  // --- 3. The card ---------------------------------------------------------------
  limitRow(t, label, w) {
    if (!w || w.used_percentage == null) return null;
    const expired = w.resets_at && w.resets_at * 1000 < Date.now();
    const pct = expired ? 0 : Math.round(w.used_percentage);
    const color = pct >= 90 ? t.blocked : pct >= 70 ? t.done : t.accent;
    return h_flex().gap(8).items_center().text_size(11.5)
      .child(div().w(50).text_color(t.muted).child(label))
      .child(div().w(BAR).h(4).rounded(2).bg(t.border)
        .child(div().h(4).rounded(2).bg(color).w(Math.max(2, (BAR * Math.min(pct, 100)) / 100))))
      .child(div().w(30).text_color(t.foreground).child(`${pct}%`))
      .child(div().flex_1().min_w(0).text_color(t.dim).truncate().child(w.resets_at && !expired ? `↻ ${left(w.resets_at)}` : ""));
  }

  render() {
    const t = theme();
    const lim = this.limits ?? {};
    const rows = [this.limitRow(t, "5 год", lim.five_hour), this.limitRow(t, "Тиждень", lim.seven_day)].filter(Boolean);
    const mood = this.mood();
    const frame = Math.floor(Date.now() / 1000) % OCTO[mood];
    const freed = this.freed && Date.now() - this.freed.at < 4000 ? this.freed : null;
    return h_flex().id("propeller").size_full().rounded(13).overflow_hidden().pl(10).pr(12).gap(10).items_center().bg(t.chrome)
      .child(image(`mods/propeller-art/${mood}-${frame}.png`).size(44).flex_none())
      .child(v_flex().flex_1().min_w(0).gap(6)
        .child(h_flex().items_center().text_size(11)
          .child(div().flex_1().text_color(t.dim).child("Ліміти Claude"))
          .child(div().id("free-memory").flex_none().px(5).rounded(4).text_color(t.dim)
            .hover((s) => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { this.freeMemory(); cx.notify(); })
            .child(freed ? `закрито ${freed.n}` : "звільнити пам'ять")))
        .children(rows.length ? rows : [div().text_size(11.5).text_color(t.dim).child("ще нема даних")]));
  }

}
