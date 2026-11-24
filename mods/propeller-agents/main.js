// Propeller agents: the cmux sidebar's grouped list (cmux-agent-status), in place of Herdr's Agents card.
//
// Spaces in coloured groups, the most urgent first: Чекає на тебе (an agent asks), Нове (finished
// while you were elsewhere), В роботі, Готово (touched in the last day), Сплять (folded; the
// propeller mod's sleeping folder or a day without anything). In a group the latest on top.
// A space with more than one tab lists its tabs under it, each with its own state. Times are
// since the state began ("21m"); a working row has three running dots. Click a row to go there.
//
// Reads: spaces() for states, shared("propeller.seen") for when each space last did something
// (the propeller mod), shared("space-folders") for who sleeps, shared("space.icons"/"space.colors")
// for the same badges as the Spaces list.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, terminals, focused, run, theme, shared, setShared, layout, home, openOverlay, nextCommand } from "herdr";
import * as fs from "fs/promises";

const DAY = 24 * 3600 * 1000;
const ART = "mods/propeller-art";
// The cmux sidebar's section colours.
// When a request was left: its id starts with the UTC time (bin/mac-ask, Content Studio).
const askedAt = (a) => {
  const at = /^(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)/.exec(a.id ?? "");
  return at ? Date.UTC(+at[1], at[2] - 1, +at[3], +at[4], +at[5], +at[6]) : null;
};
const SECTIONS = [
  { id: "needs", name: "Чекає на тебе", color: "#F5A524", icon: "hand" },
  { id: "unread", name: "Нове", color: "#4C9EEB", icon: "dot" },
  { id: "working", name: "В роботі", color: "#9B7BFF", icon: "zap" },
  { id: "done", name: "Готово", color: "#34C759", icon: "badge-check" },
  { id: "inactive", name: "Сплять", color: "#8E8E93", icon: "moon" },
];
const SLEEP = "propeller-sleep";
// Profiles, like Dia's spaces: one sidebar shows one of them. A space belongs to the one its
// folder says (under one of the config's personalFolders: personal, everything else: work)
// unless moved by hand
// (shared "propeller.profile": {spaceId: "work" | "personal"}).
const PROFILES = [
  { id: "work", name: "Робоче", icon: "briefcase", color: "#22a99a" },
  { id: "personal", name: "Особисте", icon: "house", color: "#8b7cf6" },
];
// The folders come from ~/.config/herdr-propeller.json, via the propeller mod.
const config = () => shared("propeller.config") ?? {};
const under = (f, dir) => f === dir || (f ?? "").startsWith(dir + "/");
const profileOf = (s) => (shared("propeller.profile") ?? {})[s.id] ?? ((config().personalFolders ?? []).some((d) => under(s.folder, d)) ? "personal" : "work");
const folderOf = (pid) => (pid === "personal" ? config().personalFolders?.[0] : config().workFolder) ?? home();
const SLEEPING_PREVIEW = 12;
// A space on the server that belongs to a space here: {server space id: space id here}. It shows
// as tabs with a server chip under that space instead of a row of its own (Artem, 18.11: the
// server half of a project read as a separate project). Written by dropping the server space's row
// onto a space here, or by skills/herdr-tabs/nest.py when a Claude moves its work to the server.
// Dropping its tab on a group's pill puts it back on its own.
const nestPath = () => `${home()}/.config/herdr-app/data/propeller-nest.json`;
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const DOTS = ["●∙∙", "∙●∙", "∙∙●"];
// How a working row shows it works (right-click a group's pill to pick). All run natively in
// GPUI, only while drawn (frames / spin / loop), so none costs the CPU anything to speak of.
const SPINNERS = [
  { id: "herdr", name: "Кружечок Herdr" },
  { id: "dots", name: "Три крапки (cmux)" },
  { id: "pulse", name: "Пульс (cmux)" },
  { id: "braille", name: "Брайль ⠋⠙⠹" },
  { id: "moon", name: "Півмісяць ◐◓◑◒" },
  { id: "bars", name: "Еквалайзер ▁▃▅▇" },
];
const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const MOON = ["◐", "◓", "◑", "◒"];
const BARS = ["▁", "▂", "▃", "▅", "▇", "▅", "▃", "▂"];
function spinner(kind, color, size = 12) {
  if (kind === "herdr") return svg("mods/workspace-chrome/spinner.svg").size(size).flex_none().text_color(color).spin(900);
  if (kind === "pulse") return div().size(size * 0.6).flex_none().rounded(size).bg(color).loop("opacity", { from: 0.25, to: 1, period: 1200 });
  if (kind === "braille") return div().text_size(size + 1).text_color(color).frames(BRAILLE, 90).child(BRAILLE[0]);
  if (kind === "moon") return div().text_size(size).text_color(color).frames(MOON, 160).child(MOON[0]);
  if (kind === "bars") return div().text_size(size).text_color(color).frames(BARS, 110).child(BARS[0]);
  return div().text_size(size - 2).text_color(color).frames(DOTS, 260).child(DOTS[0]);
}

const find = (n, id) => n?.id === id ? n : (n?.children ?? []).reduce((r, c) => r ?? find(c, id), null);
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
const localId = (s) => (s.machine ? s.id.slice(s.machine.length + 1) : s.id);

// Orchestrator tabs (Перрі): a terminal labelled propeller.role=orchestrator (the space menu's
// «Покликати Перрі»), or one that other tabs' terminals name as their propeller.parent (herdr-tabs).
function bossTabs() {
  const tabOf = new Map(panes().filter((p) => p.terminal).map((p) => [p.terminal, p.tab]));
  const out = new Set();
  for (const t of terminals()) {
    if (t.state !== "live") continue;
    const own = tabOf.get(t.address);
    if (own && t.labels?.["propeller.role"] === "orchestrator") out.add(own);
    const p = t.labels?.["propeller.parent"];
    const m = t.address.includes("/") ? t.address.split("/")[0] : null;
    const boss = tabOf.get(p && m && !p.includes("/") ? `${m}/${p}` : p);
    if (boss && boss !== own) out.add(boss);
  }
  return out;
}

function ago(ms) {
  if (!ms) return "";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Same badge as the Spaces list: the picked icon, else the first letter on the space's colour.
// A space on another machine (the server) wears a small server chip on the corner, the same as
// in space-folders, so it reads at a glance (Artem, 17.11).
function badge(w, t, size = 18) {
  if (!w.machine) return face(w, t, size);
  return div().relative().size(size).flex_none().child(face(w, t, size))
    .child(h_flex().absolute().right(-4).bottom(-4).size(12).rounded(6).bg(t.chrome).items_center().justify_center()
      .child(svg("mods/workspace-chrome/server.svg").size(9).text_color(t.working)));
}
function face(w, t, size) {
  const ic = (shared("space.icons") ?? {})[w.id];
  const c = (shared("space.colors") ?? {})[w.id] ?? "ansi6";
  const fill = c.startsWith("#") ? c : (MARK[c] ?? t[c]);
  if (ic?.image) return image(ic.image).size(size).flex_none().rounded(5);
  if (ic?.glyph) return h_flex().size(size).flex_none().rounded(5).bg(ic.color ?? fill).items_center().justify_center().child(svg(ic.glyph).size(size * 0.66).text_color("#ffffff"));
  return h_flex().size(size).flex_none().rounded(5).bg(fill).items_center().justify_center().text_size(size * 0.58).font_bold().text_color("#ffffff").child([...w.name][0]?.toUpperCase() ?? "?");
}

// A tab's name as it reads: Claude's live title when the tab wasn't named (like Herdr's own list).
function tabTitle(tab, all) {
  const p = all.find((p) => p.tab === tab.id && p.program?.agent) ?? all.find((p) => p.tab === tab.id);
  const live = (p?.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const telling = live && !/^[~/]/.test(live) && !live.includes("@") && live !== p?.program?.name;
  return !tab.named && telling ? live : tab.name;
}

// An unnamed space is called after its folder's path; the last folder says enough.
const spaceName = (s) => (/^[~/]/.test(s.name) ? s.name.split("/").filter(Boolean).pop() ?? s.name : s.name);

// A tab whose Claude never reported to Herdr (see the propeller mod's trackClaude): its state
// from Claude's session file instead, so it still lights up as working or waiting.
function withClaude(tab) {
  if (tab.status) return tab;
  const quiet = shared("propeller.claudeStatus") ?? {};
  const q = panes().filter((p) => p.tab === tab.id && p.terminal).map((p) => quiet[p.terminal]).find(Boolean);
  if (!q) return tab;
  const status = q.status === "busy" ? "working" : q.status === "waiting" ? "blocked" : "idle";
  return { ...tab, status, changed_at: q.at ?? tab.changed_at, working_since: status === "working" ? q.at : null };
}

function tabState(tab) {
  tab = withClaude(tab);
  if (tab.status === "blocked") return { kind: "needs", since: tab.changed_at };
  if (tab.status === "working") return { kind: "working", since: tab.working_since ?? tab.changed_at };
  if (tab.status === "done") return { kind: "unread", since: tab.changed_at };
  return { kind: tab.status === "idle" ? "done" : "none", since: tab.changed_at };
}

export default class PropellerAgents extends View {
  init(_props, cx) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem("folded") ?? "{}"); } catch {}
    this.folded = { inactive: true, ...saved };
    this.allSleeping = false;
    this.spin = localStorage.getItem("spinner") ?? "herdr";
    this.picking = false;
    this.profile = localStorage.getItem("profile") ?? "work";
    this.lastActive = null;
    this.order = []; // space ids as shown, for alt-up/down
    this.rowsOrder = []; // [space id, tab id | null] as shown, for cmd-alt-up/down
    // Spaces whose tab list is folded (the chevron on the row's mark, on hover): {space id: true}.
    try { this.collapsed = JSON.parse(localStorage.getItem("collapsedTabs") ?? "{}"); } catch { this.collapsed = {}; }
    this.hoverRow = null;
    this.closing = null; // what Cmd+W is closing, until those tabs are gone (closed() commits it)
    cx.spawn(async (cx) => {
      for (;;) {
        const c = String(await nextCommand()).split(".").pop();
        if (c === "next" || c === "prev") this.step(c === "next" ? 1 : -1);
        if (c === "work" || c === "personal") this.setProfile(c);
        if (c === "new") this.newSpace();
        if (c === "close") await this.closeTab();
        if (c === "reopen") this.reopen();
        if (c === "down" || c === "up") this.walk(c === "down" ? 1 : -1);
        cx.notify();
      }
    });
    this.nest = {};
    this.nestText = null;
    cx.spawn(async (cx) => { await this.loadNest(); cx.notify(); });
    // Times ("21m") move on: once every 30 s is enough. The dots animate natively.
    // The nest file too (nest.py writes it from outside).
    cx.timer.every(30000, (cx) => { cx.notify(); cx.spawn(async (cx) => { await this.loadNest(); cx.notify(); }); });
  }

  // Cmd+W. A tab whose Claude opened worker tabs (herdr-tabs labels them propeller.parent, or
  // Herdr's own parent) asks first: close them too, or only this one. Any other tab just closes.
  async closeTab() {
    const tab = focused()?.tab;
    if (!tab) return;
    const tabOf = new Map(panes().filter((p) => p.terminal).map((p) => [p.terminal, p.tab]));
    const mine = new Set([...tabOf].filter(([, t]) => t === tab).map(([a]) => a));
    const workers = new Set();
    for (const t of terminals()) {
      if (t.state !== "live") continue;
      const boss = t.labels?.["propeller.parent"] ?? t.parent;
      const wt = tabOf.get(t.address);
      if (boss && mine.has(boss) && wt && wt !== tab) workers.add(wt);
    }
    this.closing = { at: Date.now(), tabs: await this.snapshot([tab, ...workers]) };
    if (!workers.size) return run("tab.close", { id: tab });
    openOverlay({ mod: "propeller-menu", kind: "dialog", width: 280, height: 116,
      props: { tab: "close", target: { id: tab, workers: [...workers] } } });
  }

  // Cmd+Shift+T brings back what Cmd+W closed: each tab in its space (a new space in the same
  // folder when that one is gone), with its name, and its Claude conversation resumed. The
  // conversation comes from the propeller mod's state file, read before the tab closes.
  async snapshot(ids) {
    let claude = {};
    try { claude = JSON.parse(await fs.readFile(`${home()}/.config/herdr-app/data/propeller-state.json`, "utf8")).claude ?? {}; } catch {}
    const cwd = Object.fromEntries(terminals().map((t) => [t.address, t.cwd]));
    const out = [];
    for (const id of ids) {
      const s = spaces().find((x) => x.tabs.some((t) => t.id === id));
      const tab = s?.tabs.find((t) => t.id === id);
      const addr = panes().find((p) => p.tab === id && p.terminal)?.terminal;
      if (!s || !addr) continue;
      out.push({ id, space: s.id, machine: s.machine ?? "", spaceName: s.named ? s.name : "", name: tab.named ? tab.name : "",
        folder: claude[addr]?.cwd ?? cwd[addr] ?? null, session: claude[addr]?.session ?? null });
    }
    return out;
  }

  // Called on every render: the tabs Cmd+W asked about that are now gone go on the reopen stack.
  closed() {
    const c = this.closing;
    if (!c) return;
    const live = new Set(spaces().flatMap((s) => s.tabs.map((t) => t.id)));
    const gone = c.tabs.filter((t) => !live.has(t.id));
    if (!gone.length) { if (Date.now() - c.at > 120000) this.closing = null; return; }
    this.closing = null;
    let stack = [];
    try { stack = JSON.parse(localStorage.getItem("closed") ?? "[]"); } catch {}
    stack.push(gone);
    try { localStorage.setItem("closed", JSON.stringify(stack.slice(-20))); } catch {}
  }

  reopen() {
    let stack = [];
    try { stack = JSON.parse(localStorage.getItem("closed") ?? "[]"); } catch {}
    const group = stack.pop();
    if (!group) return;
    try { localStorage.setItem("closed", JSON.stringify(stack)); } catch {}
    let into = null; // a space made for tabs whose own space is gone: the rest go there too
    for (const t of group) {
      const args = {};
      if (t.name) args.name = t.name;
      if (t.folder) args.folder = t.folder;
      if (t.session) args.argv = ["claude", "--resume", t.session];
      if (spaces().some((s) => s.id === t.space)) run("tab.new", { ...args, space: t.space });
      else if (into) run("tab.new", args);
      else { const { name, ...rest } = args; run("space.new", { ...rest, ...(name ? { tab: name } : {}), name: t.spaceName ?? "", machine: t.machine }); into = true; }
    }
  }

  // Cmd+Alt+Down/Up: the next or previous row of the sidebar, tabs included, round the ends.
  walk(dir) {
    const rows = this.rowsOrder, len = rows.length;
    if (!len) return;
    const f = focused(), sp = spaces().find((s) => s.active)?.id;
    let at = rows.findIndex(([s, t]) => s === sp && (t === null || t === f?.tab));
    const [s, t] = rows[at < 0 ? 0 : (at + dir + len) % len];
    run("space.select", { id: s });
    if (t) run("tab.select", { id: t });
  }

  state(s, seen, asleep) {
    const tabs = s.tabs.map(tabState);
    const pick = (k) => tabs.filter((x) => x.kind === k);
    const latest = (xs) => Math.max(0, ...xs.map((x) => x.since ?? 0)) || null;
    if (pick("needs").length) return { kind: "needs", since: latest(pick("needs")) };
    if (pick("working").length) return { kind: "working", since: Math.min(...pick("working").map((x) => x.since ?? Date.now())) };
    const last = seen[s.id] ?? latest(tabs);
    if (asleep.has(`${s.machine ?? ""}|${localId(s)}`)) return { kind: "inactive", since: last };
    if (pick("unread").length) return { kind: "unread", since: latest(pick("unread")) };
    if (!last || Date.now() - last > DAY) return { kind: "inactive", since: last };
    return { kind: "done", since: last };
  }

  setProfile(id) {
    this.profile = id;
    localStorage.setItem("profile", id);
  }

  // One row down or up from the space in front, round the ends (alt-down / alt-up).
  step(dir) {
    const ids = this.order, len = ids.length;
    if (!len) return;
    const at = ids.indexOf(spaces().find((s) => s.active)?.id);
    run("space.select", { id: ids[at < 0 ? 0 : (at + dir + len) % len] });
  }

  // Dragging a space (pressed on its row, released elsewhere): onto a group's pill puts it to sleep
  // ("Сплять") or wakes it (any other group); onto a profile moves it there.
  drop(target) {
    const s = spaces().find((x) => x.id === this.dragging);
    if (!s) return;
    if (this.nest[s.id]) { const { [s.id]: _, ...rest } = this.nest; this.nest = rest; this.saveNest(); }
    if (target === "inactive") this.setAsleep(s, true);
    else if (SECTIONS.some((x) => x.id === target)) this.setAsleep(s, false);
    else if (PROFILES.some((p) => p.id === target)) setShared("propeller.profile", { ...(shared("propeller.profile") ?? {}), [s.id]: target });
  }

  async loadNest() {
    let text = "{}";
    try { text = await fs.readFile(nestPath(), "utf8"); } catch {}
    if (text === this.nestText) return;
    this.nestText = text;
    try { this.nest = JSON.parse(text) ?? {}; } catch { this.nest = {}; }
  }

  saveNest() {
    this.nestText = JSON.stringify(this.nest);
    fs.writeFile(nestPath(), this.nestText).catch(() => null);
  }

  // A server space dropped onto a space here goes under it; anything else dropped on a space does nothing.
  nestUnder(childId, parent) {
    const child = spaces().find((x) => x.id === childId);
    if (!child?.machine || parent.machine || this.nest[child.id] === parent.id) return;
    this.nest = { ...this.nest, [child.id]: parent.id };
    this.saveNest();
  }

  // Into "Сплять" or out of it: the propeller mod sees the move and settles or wakes the space.
  setAsleep(s, on) {
    const all = shared("space-folders") ?? {}, k = s.machine ?? "", cur = all[k] ?? { list: [], of: {} };
    const of = { ...cur.of };
    if ((of[localId(s)] === SLEEP) === on) return;
    if (on) of[localId(s)] = SLEEP; else delete of[localId(s)];
    setShared("space-folders", { ...all, [k]: { ...cur, of, at: Date.now() } });
  }

  // A drop target: highlighted while a space is dragged over it.
  target(el, id, t) {
    return el
      .on_mouse_move((_e, cx) => { if (this.dragging && this.over !== id) { this.over = id; cx.notify(); } })
      .on_mouse_up("left", (_e, cx) => { if (this.dragging && this.moved) { this.drop(id); this.dragging = null; this.over = null; cx.notify(); } })
      .when(Boolean(this.dragging && this.moved && this.over === id), (x) => x.border(1).border_color(t.accent));
  }

  // The indicator picker (right-click a pill): each option live, the chosen one marked.
  picker(t) {
    return v_flex().flex_none().mx(4).mb(6).p(4).gap(1).rounded(9).border(1).border_color(t.border).bg(t.popover ?? t.chrome)
      .child(div().px(6).py(2).text_size(11).text_color(t.dim).child("Як показувати «В роботі»"))
      .children(SPINNERS.map((o) => h_flex().id(`sp-${o.id}`).h(26).px(6).gap(10).items_center().rounded(6)
        .when(o.id === this.spin, (el) => el.bg(t.selected))
        .hover((x) => x.bg(t.hover))
        .on_click((_e, cx) => { this.spin = o.id; this.picking = false; localStorage.setItem("spinner", o.id); cx.notify(); })
        .child(h_flex().w(22).flex_none().justify_center().child(spinner(o.id, "#9B7BFF")))
        .child(div().flex_1().text_size(12).text_color(t.foreground).child(o.name))
        .when(o.id === this.spin, (el) => el.child(svg(`${ART}/check.svg`).size(12).text_color(t.muted)))));
  }

  toggle(id, cx) {
    this.folded = { ...this.folded, [id]: !this.folded[id] };
    if (id === "inactive") this.allSleeping = false;
    localStorage.setItem("folded", JSON.stringify(this.folded));
    cx.notify();
  }

  mark(kind, t, size = 13) {
    const box = h_flex().w(22).h(16).flex_none().items_center().justify_end();
    if (kind === "working") return box.child(spinner(this.spin, "#9B7BFF", size - 1));
    if (kind === "needs") return box.child(svg(`${ART}/circle-dot.svg`).size(size).text_color("#F5A524"));
    if (kind === "unread") return box.child(svg(`${ART}/dot.svg`).size(size).text_color("#4C9EEB"));
    if (kind === "done") return box.child(svg(`${ART}/check.svg`).size(size - 2).text_color(t.muted));
    if (kind === "inactive") return box.child(svg(`${ART}/moon.svg`).size(size - 3).text_color(t.dim));
    return box;
  }

  header(sec, n, t) {
    const folded = this.folded[sec.id];
    return this.target(h_flex().id(`h-${sec.id}`).h(28).flex_none().px(4).items_center().cursor_pointer().rounded(8), sec.id, t)
      .on_click((_e, cx) => { if (!this.moved) this.toggle(sec.id, cx); })
      .on_mouse_down("right", (_e, cx) => { this.picking = !this.picking; cx.notify(); })
      .child(h_flex().gap(5).px(9).py(3).rounded(11).bg(sec.color + "33").items_center()
        .child(svg(`${ART}/${sec.icon}.svg`).size(11).text_color(sec.color))
        .child(div().text_size(12).font_semibold().text_color(sec.color).child(sec.name))
        .child(div().text_size(11).font_bold().text_color(sec.color).opacity(0.7).child(String(n))))
      .child(div().flex_1())
      .child(svg(`${ART}/chevron-${folded ? "right" : "down"}.svg`).size(12).text_color(t.dim));
  }

  // n: how many tab rows the space has under it (0: none, so no chevron).
  spaceRow(s, st, t, n = 0) {
    const on = s.active;
    const asleep = st.kind === "inactive";
    const label = ago(st.since);
    const folded = n > 0 && this.collapsed[s.id];
    // On hover the state mark of a space with tabs turns into a chevron: a click there folds or
    // unfolds its tabs, a click anywhere else on the row still opens the space.
    const chevron = n > 0 && this.hoverRow === s.id;
    return h_flex().id(`s-${s.id}`).h(30).flex_none().px(8).gap(8).items_center().rounded(8)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((x) => x.bg(t.hover)))
      .when(st.kind === "unread" && !on, (el) => el.bg("#4C9EEB24"))
      .when(this.dragging === s.id && this.moved, (el) => el.opacity(0.5))
      .on_mouse_down("left", () => { this.dragging = s.id; this.moved = false; this.over = null; this.pressed = true; })
      .on_mouse_move((_e, cx) => {
        if (this.dragging && this.dragging !== s.id && !this.moved) { this.moved = true; cx.notify(); }
        if (this.dragging && this.dragging !== s.id && this.over !== `s:${s.id}`) { this.over = `s:${s.id}`; cx.notify(); }
      })
      .on_hover((h, cx) => { if (h) this.hoverRow = s.id; else if (this.hoverRow === s.id) this.hoverRow = null; cx.notify(); })
      .on_mouse_up("left", (_e, cx) => {
        if (this.toggling === s.id) {
          this.toggling = null;
          if (!this.moved) {
            this.collapsed = { ...this.collapsed, [s.id]: !this.collapsed[s.id] };
            if (!this.collapsed[s.id]) delete this.collapsed[s.id];
            localStorage.setItem("collapsedTabs", JSON.stringify(this.collapsed));
            cx.notify();
            return;
          }
        }
        if (this.dragging === s.id && !this.moved) run("space.select", { id: s.id });
        else if (this.dragging && this.dragging !== s.id && this.moved) this.nestUnder(this.dragging, s);
      })
      .when(Boolean(!s.machine && this.dragging && this.moved && this.over === `s:${s.id}` && spaces().find((x) => x.id === this.dragging)?.machine),
        (el) => el.border(1).border_color(t.accent))
      // Herdr's space menu with our items (patches/propeller-menu.py): move to the other profile, sleep.
      .on_mouse_down("right", () => openOverlay({ mod: "propeller-menu", kind: "popup", width: 220, height: 340, props: { tab: "space", target: { id: s.id } } }))
      .child(badge(s, t))
      .child(div().flex_1().min_w(0).truncate().text_size(13)
        .when(st.kind === "unread", (el) => el.font_semibold())
        .text_color(asleep && !on ? t.muted : t.foreground).child(spaceName(s)))
      .when(Boolean(folded), (el) => el.child(div().flex_none().px(5).rounded(6).bg(t.hover).text_size(10.5).text_color(t.dim).child(String(n))))
      .child(div().flex_none().text_size(11.5).text_color(st.kind === "needs" ? "#F5A524" : st.kind === "unread" ? "#4C9EEB" : t.dim).child(label))
      .child(chevron
        ? h_flex().id(`fold-${s.id}`).w(22).h(18).flex_none().items_center().justify_end()
          .on_mouse_down("left", () => { this.toggling = s.id; })
          .child(h_flex().size(18).rounded(5).items_center().justify_center().hover((x) => x.bg(t.hover))
            .child(svg(`${ART}/chevron-${folded ? "right" : "down"}.svg`).size(13).text_color(t.foreground)))
        : this.mark(st.kind, t));
  }

  // A request from the server: click opens a Mac tab with Claude and its brief; right-click declines.
  // under: drawn under its own space, indented like a tab and without the "Мак:" prefix.
  askRow(a, t, under = false) {
    const since = askedAt(a);
    return h_flex().id(`ask-${a.machine}-${a.id}`).h(30).flex_none().px(8).gap(8).items_center().rounded(8)
      .when(under, (el) => el.ml(18))
      .bg("#F5A52414").hover((x) => x.bg("#F5A52430"))
      .on_click(() => setShared("propeller.macAsk.take", { id: a.id, machine: a.machine, at: Date.now() }))
      .on_mouse_down("right", () => setShared("propeller.macAsk.decline", { id: a.id, machine: a.machine, at: Date.now() }))
      .child(h_flex().size(18).flex_none().rounded(5).bg("#F5A52433").items_center().justify_center()
        .child(svg(`${ART}/laptop.svg`).size(12).text_color("#F5A524")))
      .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.foreground).child(under ? a.title : `Мак: ${a.title}`))
      .child(div().flex_none().text_size(11.5).text_color("#F5A524").child(ago(since)))
      .child(this.mark("needs", t));
  }

  // Top of the panel: the profile switcher, a new space in this profile's folder, ✨ icons.
  top(groups, t) {
    const urgent = (pid) => ["needs", "unread"].some((k) => groups[k].some(({ s }) => profileOf(s) === pid));
    const tab = (p) => {
      const on = p.id === this.profile;
      return this.target(h_flex().id(`p-${p.id}`).flex_1().h(26).gap(6).items_center().justify_center().rounded(7), p.id, t)
        .when(on, (el) => el.bg(p.color + "2e"))
        .when(!on, (el) => el.hover((x) => x.bg(t.hover)))
        .on_click((_e, cx) => { if (!this.moved) { this.setProfile(p.id); cx.notify(); } })
        .child(svg(`${ART}/${p.icon}.svg`).size(13).text_color(on ? p.color : t.dim))
        .child(div().text_size(12).font_semibold().text_color(on ? t.foreground : t.muted).child(p.name))
        .when(!on && urgent(p.id), (el) => el.child(div().size(6).rounded(3).bg("#F5A524")));
    };
    const icon = (id, art, act, extra) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(7)
      .text_color(t.dim).hover((x) => x.bg(t.hover).text_color(t.foreground)).on_click(act).child(extra ?? svg(`${ART}/${art}.svg`).size(14));
    const prof = PROFILES.find((p) => p.id === this.profile);
    const busy = shared("space.icons.busy");
    return h_flex().flex_none().gap(4).px(2).pb(6).items_center()
      .child(h_flex().flex_1().p(2).gap(2).rounded(9).bg(t.surface ?? t.hover).children(PROFILES.map(tab)))
      .child(icon("new-space", "plus", () => this.newSpace()))
      .child(icon("icons", "sparkles", () => { if (!busy) setShared("space.icons.ask", Date.now()); },
        busy ? svg("mods/workspace-chrome/spinner.svg").size(13).spin(900) : null));
  }

  // remote: the tab is in a server space nested under the row above (this.nest); it wears the
  // server chip, and dragging it to a group's pill takes the server space out again.
  tabRow(s, tab, all, t, remote = false) {
    const st = tabState(tab);
    const on = s.active && tab.active;
    const boss = this.bosses?.has(tab.id);
    const go = () => { run("space.select", { id: s.id }); run("tab.select", { id: tab.id }); };
    const server = svg("mods/workspace-chrome/server.svg");
    // Перрі on any tab, a server one too (its server chip then sits on his corner).
    const lead = boss
      ? (remote
        ? div().relative().size(16).flex_none().ml(-8).child(image(`${ART}/perry.png`).size(16))
          .child(h_flex().absolute().right(-4).bottom(-3).size(10).rounded(5).bg(t.chrome).items_center().justify_center()
            .child(server.size(8).text_color(t.working)))
        : image(`${ART}/perry.png`).size(16).flex_none().ml(-8))
      : remote ? server.size(12).flex_none().ml(-6).text_color(t.working) : div().w(1).h(14).flex_none().bg(t.border);
    // Pressed and released here: go there. Dragged onto another tab of its space: moved to its place
    // (tab.move). A server tab dragged to a group's pill takes its server space out again (drop()).
    const over = Boolean(this.draggingTab && this.moved && this.draggingTab.id !== tab.id && this.draggingTab.space === s.id && this.over === `t:${tab.id}`);
    return h_flex().id(`t-${tab.id}`).h(24).flex_none().pl(26).pr(8).gap(8).items_center().rounded(6)
      .when(on, (el) => el.bg(t.hover))
      .when(!on, (el) => el.hover((x) => x.bg(t.hover)))
      .when(over, (el) => el.border(1).border_color(t.accent))
      .when(this.draggingTab?.id === tab.id && this.moved, (el) => el.opacity(0.5))
      .on_mouse_down("left", () => {
        this.draggingTab = { id: tab.id, space: s.id };
        this.pressed = true;
        if (remote) this.dragging = s.id;
        this.moved = false; this.over = null;
      })
      .on_mouse_move((_e, cx) => {
        if (this.draggingTab && this.draggingTab.id !== tab.id && !this.moved) { this.moved = true; cx.notify(); }
        // Only another tab is a drop target: a jitter inside the pressed row stays a click (19.11:
        // with it counted as a drag, a tab opened only on the second click).
        if (this.draggingTab && this.draggingTab.id !== tab.id && this.over !== `t:${tab.id}`) { this.over = `t:${tab.id}`; cx.notify(); }
      })
      .on_mouse_up("left", () => {
        const d = this.draggingTab;
        if (d?.id === tab.id && !this.moved) go();
        else if (d && this.moved && d.space === s.id && d.id !== tab.id) run("tab.move", { id: d.id, index: tab.index });
        if (d && this.moved && d.space === s.id) this.dragging = null; // a reorder, not a drop on a pill
      })
      .on_mouse_down("right", () => openOverlay({ mod: "propeller-menu", kind: "popup", width: 220, height: 180, props: { tab: "tab", target: { id: tab.id, space: s.id } } }))
      .child(lead)
      .child(div().flex_1().min_w(0).truncate().text_size(12)
        .when(st.kind === "unread", (el) => el.font_semibold())
        .text_color(on ? t.foreground : t.muted).child(tabTitle(tab, all)))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(st.kind === "none" ? "" : ago(st.since)))
      .child(this.mark(st.kind, t, 12));
  }

  // The folded rail: badges only, the urgent ones first, each with its state under it.
  rail(groups, t) {
    const rows = PROFILES.map((p) => div().id(`rp-${p.id}`).size(30).flex_none().flex().items_center().justify_center().rounded(7)
      .when(p.id === this.profile, (el) => el.bg(p.color + "2e"))
      .hover((x) => x.bg(t.hover))
      .on_click((_e, cx) => { this.setProfile(p.id); cx.notify(); })
      .child(svg(`${ART}/${p.icon}.svg`).size(14).text_color(p.id === this.profile ? p.color : t.dim)));
    rows.push(div().h(1).w(30).flex_none().my(4).bg(t.border));
    for (const sec of SECTIONS) {
      if (sec.id === "inactive") continue;
      for (const { s, st } of groups[sec.id]) {
        rows.push(v_flex().id(`r-${s.id}`).flex_none().py(4).items_center().gap(2).rounded(6)
          .when(s.active, (el) => el.bg(t.selected)).hover((x) => x.bg(t.hover))
          .on_click(() => run("space.select", { id: s.id }))
          .child(badge(s, t, 20))
          .child(st.kind === "working"
            ? spinner(this.spin, sec.color, 9)
            : div().size(5).rounded(3).bg(sec.color)));
      }
    }
    return v_flex().id("propeller-agents").size_full().rounded(13).overflow_hidden().bg(t.chrome).py(8).px(6).gap(2).overflow_y_scroll().children(rows);
  }

  // A new space in the shown profile's folder, with Claude already running (cmd-n and the +).
  // Claude runs in the interactive shell, which stays open after it quits.
  newSpace() {
    run("space.new", { name: "", folder: folderOf(this.profile), machine: "", argv: ["claude"] });
  }

  render() {
    this.closed();
    const t = theme();
    const seen = shared("propeller.seen") ?? {};
    // Each machine keeps its own folders (space-folders: {machine: {of}}), the server's too: a
    // server space put to sleep stayed in «Готово» while only this Mac's were read (19.11).
    const asleep = new Set(Object.entries(shared("space-folders") ?? {})
      .flatMap(([m, d]) => Object.entries(d?.of ?? {}).filter(([, f]) => f === SLEEP).map(([id]) => `${m}|${id}`)));
    const byProfile = Object.fromEntries(PROFILES.map((p) => [p.id, Object.fromEntries(SECTIONS.map((x) => [x.id, []]))]));
    // Opening a space of the other profile (a key, a notification) switches the sidebar to it.
    // A server space nested under one here goes by that space's profile, not its own folder
    // (24.11: «Розбір треків» under «Bloom-мелодія» flipped the sidebar to «Робоче»).
    const active = spaces().find((s) => s.active);
    if (active && active.id !== this.lastActive) {
      this.lastActive = active.id;
      const home = (active.machine && spaces().find((x) => x.id === this.nest[active.id])) || active;
      if (profileOf(home) !== this.profile) this.setProfile(profileOf(home));
    }
    const everywhere = Object.fromEntries(SECTIONS.map((x) => [x.id, []]));
    const ids = new Set(spaces().map((s) => s.id));
    this.kids = new Map();
    // Closing the Mac half (its last tab) leaves the server half as a project of its own, in the
    // profile the Mac half had (24.11: closing «Bloom-мелодія» dropped «Розбір треків» into «Робоче»).
    this.nestProfile ??= {};
    for (const s of spaces()) {
      const p = this.nest[s.id];
      if (!s.machine || !p) continue;
      const parent = spaces().find((x) => x.id === p);
      if (parent) { this.nestProfile[s.id] = profileOf(parent); continue; }
      const was = this.nestProfile[s.id];
      if (!was) continue; // not seen together this run: maybe the Mac half isn't loaded yet
      const { [s.id]: _, ...rest } = this.nest; this.nest = rest; this.saveNest();
      setShared("propeller.profile", { ...(shared("propeller.profile") ?? {}), [s.id]: was });
    }
    for (const s of spaces()) {
      const p = this.nest[s.id];
      if (!s.machine || !p || !ids.has(p)) continue;
      if (!this.kids.has(p)) this.kids.set(p, []);
      this.kids.get(p).push(s);
    }
    for (const s of spaces()) {
      if (s.machine && ids.has(this.nest[s.id])) continue; // drawn under its space here
      const kids = this.kids.get(s.id) ?? [];
      // The space and its server half are one project: the most urgent state of either, the latest activity.
      let st = kids.length
        ? this.state({ ...s, tabs: [...s.tabs, ...kids.flatMap((k) => k.tabs)] },
          { ...seen, [s.id]: Math.max(seen[s.id] ?? 0, ...kids.map((k) => seen[k.id] ?? 0)) || undefined }, asleep)
        : this.state(s, seen, asleep);
      // A request for this space (Content Studio's «В Herdr»): the space waits on you until it's taken.
      const asked = (shared("propeller.macAsks") ?? []).filter((a) => a.space === s.id).map(askedAt);
      if (asked.length) st = { ...st, kind: "needs", since: Math.max(...asked.map((x) => x ?? 0)) || st.since };
      everywhere[st.kind].push({ s, st });
      byProfile[profileOf(s)][st.kind].push({ s, st });
    }
    for (const gs of Object.values(byProfile)) for (const g of Object.values(gs)) g.sort((a, b) => (b.st.since ?? 0) - (a.st.since ?? 0));
    const groups = byProfile[this.profile];
    if (narrow()) return this.rail(groups, t);

    const all = panes();
    this.bosses = bossTabs();
    // Each profile is a page; the pages lie side by side and slide like the iPhone's home
    // screens: during a swipe they follow the fingers, then spring to the chosen one.
    const W = this.w ?? (shared("sidebar.width") ?? 268);
    const at = PROFILES.findIndex((p) => p.id === this.profile);
    const pages = PROFILES.map((p, i) => {
      const { rows, order, flat } = this.page(byProfile[p.id], all, t);
      if (p.id === this.profile) { this.order = order; this.rowsOrder = flat; }
      return v_flex().id(`page-${p.id}`).absolute().top(0).bottom(0).w_full().left((i - at) * W + (this.drag ?? 0))
        .spring("left", { response: 340, damping: 1 })
        .px(6).pb(8).overflow_y_scroll()
        // Inside the scroll area, so a sideways swipe (and the momentum after it) can be kept from
        // scrolling the list up or down (19.11: right after a swipe the new page jumped).
        .child(v_flex().w_full().gap(1).on_scroll_wheel((e, cx) => {
          if (this.swiped(e, cx, true)) cx.stop_propagation(); else this.innerSaw = true;
        }).children(rows));
    });
    return v_flex().id("propeller-agents").size_full().rounded(13).overflow_hidden().bg(t.chrome).pt(8)
      // A press that didn't start a drag here ends any older one: a release outside the panel never
      // reached us, and a later click on «Сплять» put that old space to sleep (Recap, Ekforce, Herdr, 19.11).
      .on_mouse_down("left", () => {
        if (!this.pressed) { this.dragging = null; this.draggingTab = null; this.over = null; }
        if (!this.dragging) this.moved = false;
        this.pressed = false;
      })
      .on_scroll_wheel((e, cx) => { if (this.innerSaw) this.innerSaw = false; else this.swiped(e, cx); })
      // Any release ends a drag; one that left its row turns on "moved" for the targets above.
      .on_mouse_move((_e, cx) => { if ((this.dragging || this.draggingTab) && !this.moved && this.over) { this.moved = true; cx.notify(); } })
      .on_mouse_up("left", (_e, cx) => {
        if (this.dragging || this.draggingTab) { this.dragging = null; this.draggingTab = null; this.moved = false; this.over = null; cx.notify(); }
      })
      .child(v_flex().px(6).gap(1).flex_none().child(this.top(everywhere, t)).children(this.picking ? [this.picker(t)] : []))
      .child(div().flex_1().min_h(0).relative().overflow_hidden().children(pages));
  }

  // One profile's list: its groups, rows and tabs; order is the rows' space ids for alt-up/down.
  page(groups, all, t) {
    const rows = [], order = [], flat = [];
    for (const sec of SECTIONS) {
      const list = groups[sec.id];
      // Requests from a Claude on another machine that needs this Mac (bin/mac-ask, the propeller mod).
      // Those that name one of this Mac's spaces sit under it instead.
      const macAsks = shared("propeller.macAsks") ?? [];
      const asks = sec.id === "needs" ? macAsks.filter((a) => !a.space) : [];
      if (!list.length && !asks.length) continue;
      rows.push(this.header(sec, list.length + asks.length, t));
      if (this.folded[sec.id]) continue;
      for (const a of asks) rows.push(this.askRow(a, t));
      const capped = sec.id === "inactive" && !this.allSleeping && list.length > SLEEPING_PREVIEW;
      for (const { s, st } of capped ? list.slice(0, SLEEPING_PREVIEW) : list) {
        const kids = this.kids?.get(s.id) ?? [];
        const n = sec.id !== "inactive" && (s.tabs.length > 1 || kids.length) ? s.tabs.length + kids.reduce((a, k) => a + k.tabs.length, 0) : 0;
        rows.push(this.spaceRow(s, st, t, n));
        for (const a of macAsks.filter((x) => x.space === s.id)) rows.push(this.askRow(a, t, true));
        order.push(s.id);
        if (n && !this.collapsed[s.id]) {
          // Перрі on top of the project's tabs, here or on the server; the rest in their spaces' order.
          const list = [...s.tabs.map((tab) => [s, tab, false]), ...kids.flatMap((k) => k.tabs.map((tab) => [k, tab, true]))];
          const boss = (x) => (this.bosses?.has(x[1].id) ? 0 : 1);
          list.sort((a, b) => boss(a) - boss(b));
          for (const [sp, tab, remote] of list) { rows.push(this.tabRow(sp, tab, all, t, remote)); flat.push([sp.id, tab.id]); }
        } else flat.push([s.id, null]);
      }
      if (capped) rows.push(div().id("more").h(24).flex_none().px(10).flex().items_center().text_size(12).text_color(t.dim)
        .rounded(6).hover((x) => x.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => { this.allSleeping = true; cx.notify(); })
        .child(`ще ${list.length - SLEEPING_PREVIEW}`));
      rows.push(div().h(6).flex_none());
    }
    if (!rows.length) rows.push(div().px(10).py(6).text_size(12).text_color(t.dim).child("Тут поки порожньо"));
    return { rows, order, flat };
  }

  // A two-finger sideways swipe: the pages follow it, and on release they go to the next
  // profile if it went far enough (a quarter of the panel), else back. Only a clearly
  // sideways gesture counts, so scrolling the list never moves the pages.
  // inner: from inside the scroll area, whose width isn't the page's.
  swiped(e, cx, inner = false) {
    if (!inner && e.bounds?.width) this.w = e.bounds.width;
    const W = this.w ?? 268, now = Date.now();
    if (this.lock && now < this.lock) return true;
    // A trackpad keeps sending scroll after the fingers lift (macOS momentum). Once a gesture
    // with phases has been seen, only events inside a touch (started..ended) move the pages.
    if (e.touch_phase === "started") { this.trackpad = true; this.touching = true; this.sideways = false; }
    else if (this.trackpad && !this.touching) return this.sideways; // momentum: a sideways swipe's is swallowed
    const fresh = e.touch_phase === "started" || !this.swipe || now - this.swipe.at > 400;
    if (fresh) this.swipe = { x: 0, y: 0, axis: null, touch: e.touch_phase === "started" };
    const sw = this.swipe;
    sw.at = now;
    const end = e.touch_phase === "ended" || e.touch_phase === "cancelled";
    if (end) this.touching = false;
    if (!end) { sw.x += e.delta.x; sw.y += e.delta.y; }
    if (!sw.axis && Math.abs(sw.x) + Math.abs(sw.y) > 8) sw.axis = Math.abs(sw.x) > 2 * Math.abs(sw.y) ? "x" : "y";
    if (sw.axis !== "x") { if (end) this.swipe = null; return false; }
    this.sideways = true;
    const at = PROFILES.findIndex((p) => p.id === this.profile);
    const dir = sw.x < 0 ? 1 : -1, edge = at + dir < 0 || at + dir >= PROFILES.length;
    // A mouse wheel (no "started"): it switches as soon as it is far enough.
    if (end || (!sw.touch && Math.abs(sw.x) > 60)) {
      if (!edge && Math.abs(sw.x) > (end ? W / 4 : 60)) this.setProfile(PROFILES[at + dir].id);
      this.drag = 0;
      this.swipe = null;
      this.lock = now + 450;
    } else {
      this.drag = edge ? sw.x / 3 : Math.max(-W, Math.min(W, sw.x)); // past the last page it only gives a little
    }
    cx.notify();
    return true;
  }
}
