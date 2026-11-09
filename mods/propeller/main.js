// Propeller: what cmux-claude-sidebar gave us, on top of Herdr's own sidebar.
//
// 1. Claude comes back after a reboot. Herdr gives a lost terminal a fresh shell
//    in its folder and never re-runs the program. We remember which Claude
//    conversation each terminal had (~/.claude/sessions/<pid>.json) and, when the
//    terminal's shell changes under us without Claude, type `claude --resume <id>`.
// 2. Sleeping spaces. A space with no agent activity and no visit for a day has
//    its tabs settled and sinks to the bottom; it wakes when an agent there
//    needs you, starts working, or you open it.
// 3. Attention order. Spaces sort blocked > done > working > idle > sleeping,
//    keeping their current order inside each group.
// 4. Claude subscription limits (5 h and weekly) from ~/.claude/rate-limits.json,
//    which our Claude status line writes on every turn.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, terminals, hc, exec, theme, run, home } from "herdr";
import * as fs from "fs/promises";

const DAY = 24 * 3600 * 1000;
const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };
const SLEEP_RANK = 4;
const BAR = 70;
const ACTIVE = new Set(["blocked", "done", "working"]);

const statePath = () => `${home()}/.config/herdr-app/data/propeller-state.json`;
const machineOf = (addr) => (addr.includes("/") ? addr.split("/")[0] : null);

function left(ts) {
  const s = Math.max(0, Math.round(ts - Date.now() / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h >= 24 ? `${Math.floor(h / 24)} д ${h % 24} год` : `${h}:${String(m).padStart(2, "0")}`;
}

export default class Propeller extends View {
  init(_props, cx) {
    // seen: space id -> ms of last activity or visit; claude: terminal -> {shell, session, cwd};
    // settled: space ids whose tabs we put away (we only bring back what we put away).
    this.state = { seen: {}, claude: {}, settled: {} };
    this.saved = "";
    this.limits = null;
    this.open = false;
    this.busy = false;
    cx.spawn(async (cx) => {
      try { this.state = { ...this.state, ...JSON.parse(await fs.readFile(statePath(), "utf8")) }; } catch {}
      await this.tick();
      await this.readLimits();
      cx.notify();
    });
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
      await this.trackClaude();
      this.trackActivity();
      this.sleepAndSort();
      await this.save();
    } catch (e) {
      console.log("propeller tick:", e?.message ?? e);
    } finally {
      this.busy = false;
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
        await hc(["send", addr, `claude --resume ${prev.session}`]);
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

  // --- 2 and 3. Sleeping and attention order -------------------------------------
  trackActivity() {
    const now = Date.now();
    for (const s of spaces()) {
      const changed = Math.max(0, ...s.tabs.map((t) => t.changed_at ?? 0));
      const last = this.state.seen[s.id] ?? now;
      this.state.seen[s.id] = Math.max(last, changed, s.active || ACTIVE.has(s.status) ? now : 0);
    }
    const ids = new Set(spaces().map((s) => s.id));
    for (const id of Object.keys(this.state.seen)) if (!ids.has(id)) delete this.state.seen[id];
  }

  sleeping(s) {
    return !ACTIVE.has(s.status) && !s.active && Date.now() - (this.state.seen[s.id] ?? Date.now()) > DAY;
  }

  rank(s) {
    return this.sleeping(s) ? SLEEP_RANK : RANK[s.status] ?? RANK.idle;
  }

  sleepAndSort() {
    for (const s of spaces()) {
      if (this.sleeping(s)) {
        for (const t of s.tabs) if (!t.settled) run("tab.settle", { id: t.id });
        this.state.settled[s.id] = true;
      } else if (this.state.settled[s.id]) {
        for (const t of s.tabs) if (t.settled) run("tab.unsettle", { id: t.id });
        delete this.state.settled[s.id];
      }
    }
    // One move at a time, re-reading the order after each: space.move stays inside
    // its machine's block, so each machine sorts on its own.
    for (let i = 0; i < 30; i++) {
      const move = this.nextMove();
      if (!move) break;
      run("space.move", move);
    }
  }

  nextMove() {
    const groups = new Map();
    for (const s of spaces()) {
      const k = s.machine ?? "";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
    }
    for (const list of groups.values()) {
      const want = list.map((s, i) => ({ s, i })).sort((a, b) => this.rank(a.s) - this.rank(b.s) || a.i - b.i).map((x) => x.s);
      for (let i = 0; i < list.length; i++) {
        if (list[i].id !== want[i].id) return { id: want[i].id, index: list[i].index };
      }
    }
    return null;
  }

  async save() {
    const text = JSON.stringify(this.state);
    if (text === this.saved) return;
    await fs.mkdir(`${home()}/.config/herdr-app/data`, { recursive: true });
    await fs.writeFile(statePath(), text);
    this.saved = text;
  }

  wake(s) {
    this.state.seen[s.id] = Date.now();
    run("space.select", { id: s.id });
  }

  // --- 4. The card ---------------------------------------------------------------
  limitRow(t, label, w) {
    if (!w || w.used_percentage == null) return null;
    const expired = w.resets_at && w.resets_at * 1000 < Date.now();
    const pct = expired ? 0 : Math.round(w.used_percentage);
    const color = pct >= 90 ? t.blocked : pct >= 70 ? t.done : t.accent;
    return h_flex().gap(8).items_center().text_size(11.5)
      .child(div().w(52).text_color(t.muted).child(label))
      .child(div().w(BAR).h(4).rounded(2).bg(t.border)
        .child(div().h(4).rounded(2).bg(color).w(Math.max(2, (BAR * Math.min(pct, 100)) / 100))))
      .child(div().w(34).text_color(t.foreground).child(`${pct}%`))
      .child(div().w(70).text_color(t.dim).truncate().child(w.resets_at && !expired ? `↻ ${left(w.resets_at)}` : ""));
  }

  render() {
    const t = theme();
    const sleepers = spaces().filter((s) => this.sleeping(s));
    const lim = this.limits ?? {};
    const rows = [this.limitRow(t, "5 год", lim.five_hour), this.limitRow(t, "Тиждень", lim.seven_day)].filter(Boolean);
    return v_flex().id("propeller").size_full().px(14).py(8).gap(6).bg(t.chrome).border_t(1).border_color(t.border)
      .child(div().text_size(11).text_color(t.dim).child("Ліміти Claude"))
      .children(rows.length ? rows : [div().text_size(11.5).text_color(t.dim).child("ще нема даних")])
      .child(h_flex().id("sleep-toggle").mt(2).gap(6).items_center().text_size(11.5)
        .text_color(sleepers.length ? t.muted : t.dim)
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { this.open = !this.open; cx.notify(); })
        .child(`${this.open ? "▾" : "▸"} Сплять · ${sleepers.length}`))
      .when(this.open, (el) => el.child(v_flex().id("sleepers").gap(2).overflow_y_scrollbar()
        .children(sleepers.map((s) => h_flex().id(`sl-${s.id}`).px(6).py(2).rounded(4).gap(6).text_size(11.5)
          .text_color(t.muted).hover((x) => x.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => { this.wake(s); cx.notify(); })
          .child(div().truncate().child(`${s.machine ? s.machine + " · " : ""}${s.name}`))))));
  }
}
