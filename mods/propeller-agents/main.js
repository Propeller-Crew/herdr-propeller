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
import { spaces, panes, run, theme, shared, setShared, layout, home, openOverlay, nextCommand } from "herdr";

const DAY = 24 * 3600 * 1000;
const ART = "mods/propeller-art";
// The cmux sidebar's section colours.
const SECTIONS = [
  { id: "needs", name: "Чекає на тебе", color: "#F5A524", icon: "hand" },
  { id: "unread", name: "Нове", color: "#4C9EEB", icon: "sparkles" },
  { id: "working", name: "В роботі", color: "#9B7BFF", icon: "zap" },
  { id: "done", name: "Готово", color: "#34C759", icon: "badge-check" },
  { id: "inactive", name: "Сплять", color: "#8E8E93", icon: "moon" },
];
const SLEEP = "propeller-sleep";
// Profiles, like Dia's spaces: one sidebar shows one of them. A space belongs to the one its
// folder says (ObsidianVault: personal, everything else: work) unless moved by hand
// (shared "propeller.profile": {spaceId: "work" | "personal"}).
const PROFILES = [
  { id: "work", name: "Робоче", icon: "briefcase", color: "#22a99a", folder: "Documents/Propeller_OS" },
  { id: "personal", name: "Особисте", icon: "house", color: "#8b7cf6", folder: "Documents/ObsidianVault" },
];
const profileOf = (s) => (shared("propeller.profile") ?? {})[s.id] ?? (/\/ObsidianVault(\/|$)/.test(s.folder ?? "") ? "personal" : "work");
const SLEEPING_PREVIEW = 12;
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const DOTS = ["●∙∙", "∙●∙", "∙∙●"];

const find = (n, id) => n?.id === id ? n : (n?.children ?? []).reduce((r, c) => r ?? find(c, id), null);
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
const localId = (s) => (s.machine ? s.id.slice(s.machine.length + 1) : s.id);

function ago(ms) {
  if (!ms) return "";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Same badge as the Spaces list: the picked icon, else the first letter on the space's colour.
function badge(w, t, size = 18) {
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

function tabState(tab) {
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
    this.profile = localStorage.getItem("profile") ?? "work";
    this.lastActive = null;
    this.menuFor = null; // space id whose actions show under its row (right-click)
    this.order = []; // space ids as shown, for alt-up/down
    cx.spawn(async (cx) => {
      for (;;) {
        const c = String(await nextCommand()).split(".").pop();
        if (c === "next" || c === "prev") this.step(c === "next" ? 1 : -1);
        if (c === "work" || c === "personal") this.setProfile(c);
        cx.notify();
      }
    });
    // Times ("21m") move on: once every 30 s is enough. The dots animate natively.
    cx.timer.every(30000, (cx) => cx.notify());
  }

  state(s, seen, asleep) {
    const tabs = s.tabs.map(tabState);
    const pick = (k) => tabs.filter((x) => x.kind === k);
    const latest = (xs) => Math.max(0, ...xs.map((x) => x.since ?? 0)) || null;
    if (pick("needs").length) return { kind: "needs", since: latest(pick("needs")) };
    if (pick("working").length) return { kind: "working", since: Math.min(...pick("working").map((x) => x.since ?? Date.now())) };
    const last = seen[s.id] ?? latest(tabs);
    if (asleep.has(localId(s))) return { kind: "inactive", since: last };
    if (pick("unread").length) return { kind: "unread", since: latest(pick("unread")) };
    if (!last || Date.now() - last > DAY) return { kind: "inactive", since: last };
    return { kind: "done", since: last };
  }

  setProfile(id) {
    this.profile = id;
    this.menuFor = null;
    localStorage.setItem("profile", id);
  }

  // One row down or up from the space in front, round the ends (alt-down / alt-up).
  step(dir) {
    const ids = this.order, len = ids.length;
    if (!len) return;
    const at = ids.indexOf(spaces().find((s) => s.active)?.id);
    run("space.select", { id: ids[at < 0 ? 0 : (at + dir + len) % len] });
  }

  // Into "Сплять" or out of it: the propeller mod sees the move and puts the space to sleep or wakes it.
  setAsleep(s, on) {
    const all = shared("space-folders") ?? {};
    const k = s.machine ?? "";
    const cur = all[k] ?? { list: [], of: {} };
    const of = { ...cur.of };
    if (on) of[localId(s)] = SLEEP; else delete of[localId(s)];
    setShared("space-folders", { ...all, [k]: { ...cur, of, at: Date.now() } });
  }

  toggle(id, cx) {
    this.folded = { ...this.folded, [id]: !this.folded[id] };
    if (id === "inactive") this.allSleeping = false;
    localStorage.setItem("folded", JSON.stringify(this.folded));
    cx.notify();
  }

  mark(kind, t, size = 13) {
    const box = h_flex().w(22).h(16).flex_none().items_center().justify_end();
    if (kind === "working") return box.child(div().text_size(10).text_color("#9B7BFF").frames(DOTS, 260).child(DOTS[0]));
    if (kind === "needs") return box.child(svg(`${ART}/circle-dot.svg`).size(size).text_color("#F5A524"));
    if (kind === "unread") return box.child(svg(`${ART}/sparkles.svg`).size(size).text_color("#4C9EEB"));
    if (kind === "done") return box.child(svg(`${ART}/check.svg`).size(size - 2).text_color(t.muted));
    if (kind === "inactive") return box.child(svg(`${ART}/moon.svg`).size(size - 3).text_color(t.dim));
    return box;
  }

  header(sec, n, t) {
    const folded = this.folded[sec.id];
    return h_flex().id(`h-${sec.id}`).h(28).flex_none().px(4).items_center().cursor_pointer().rounded(8)
      .on_click((_e, cx) => this.toggle(sec.id, cx))
      .child(h_flex().gap(5).px(9).py(3).rounded(11).bg(sec.color + "33").items_center()
        .child(svg(`${ART}/${sec.icon}.svg`).size(11).text_color(sec.color))
        .child(div().text_size(12).font_semibold().text_color(sec.color).child(sec.name))
        .child(div().text_size(11).font_bold().text_color(sec.color).opacity(0.7).child(String(n))))
      .child(div().flex_1())
      .child(svg(`${ART}/chevron-${folded ? "right" : "down"}.svg`).size(12).text_color(t.dim));
  }

  spaceRow(s, st, t) {
    const on = s.active;
    const asleep = st.kind === "inactive";
    const label = ago(st.since);
    return h_flex().id(`s-${s.id}`).h(30).flex_none().px(8).gap(8).items_center().rounded(8)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((x) => x.bg(t.hover)))
      .when(st.kind === "unread" && !on, (el) => el.bg("#4C9EEB24"))
      .on_click(() => { this.menuFor = null; run("space.select", { id: s.id }); })
      .on_mouse_down("right", (_e, cx) => { this.menuFor = this.menuFor === s.id ? null : s.id; cx.notify(); })
      .child(badge(s, t))
      .child(div().flex_1().min_w(0).truncate().text_size(13)
        .when(st.kind === "unread", (el) => el.font_semibold())
        .text_color(asleep && !on ? t.muted : t.foreground).child(spaceName(s)))
      .child(div().flex_none().text_size(11.5).text_color(st.kind === "needs" ? "#F5A524" : st.kind === "unread" ? "#4C9EEB" : t.dim).child(label))
      .child(this.mark(st.kind, t));
  }

  // Right-click on a space: its actions in a strip under the row.
  actions(s, st, t) {
    const other = PROFILES.find((p) => p.id !== profileOf(s));
    const btn = (id, label, act) => div().id(id).flex_none().px(8).py(2).rounded(6).border(1).border_color(t.border)
      .text_size(11).text_color(t.muted).hover((x) => x.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { act(); this.menuFor = null; cx.notify(); }).child(label);
    return h_flex().id(`a-${s.id}`).flex_none().flex_wrap().gap(4).pl(34).pr(8).py(4)
      .child(btn("a-profile", `→ ${other.name}`, () => setShared("propeller.profile", { ...(shared("propeller.profile") ?? {}), [s.id]: other.id })))
      .child(btn("a-sleep", st.kind === "inactive" ? "Розбудити" : "Приспати", () => this.setAsleep(s, st.kind !== "inactive")))
      .child(btn("a-more", "Ще…", () => openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } })));
  }

  // Top of the panel: the profile switcher, a new space in this profile's folder, ✨ icons.
  top(groups, t) {
    const urgent = (pid) => ["needs", "unread"].some((k) => groups[k].some(({ s }) => profileOf(s) === pid));
    const tab = (p) => {
      const on = p.id === this.profile;
      return h_flex().id(`p-${p.id}`).flex_1().h(26).gap(6).items_center().justify_center().rounded(7)
        .when(on, (el) => el.bg(p.color + "2e"))
        .when(!on, (el) => el.hover((x) => x.bg(t.hover)))
        .on_click((_e, cx) => { this.setProfile(p.id); cx.notify(); })
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
      .child(icon("new-space", "plus", () => run("space.new", { name: "", folder: `${home()}/${prof.folder}`, machine: "" })))
      .child(icon("icons", "sparkles", () => { if (!busy) setShared("space.icons.ask", Date.now()); },
        busy ? svg("mods/workspace-chrome/spinner.svg").size(13).spin(900) : null));
  }

  tabRow(s, tab, all, t) {
    const st = tabState(tab);
    const on = s.active && tab.active;
    return h_flex().id(`t-${tab.id}`).h(24).flex_none().pl(26).pr(8).gap(8).items_center().rounded(6)
      .when(on, (el) => el.bg(t.hover))
      .when(!on, (el) => el.hover((x) => x.bg(t.hover)))
      .on_click(() => { run("space.select", { id: s.id }); run("tab.select", { id: tab.id }); })
      .child(div().w(1).h(14).flex_none().bg(t.border))
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
            ? div().text_size(8).text_color(sec.color).frames(DOTS, 260).child(DOTS[0])
            : div().size(5).rounded(3).bg(sec.color)));
      }
    }
    return v_flex().id("propeller-agents").size_full().rounded(13).overflow_hidden().bg(t.chrome).py(8).px(6).gap(2).overflow_y_scroll().children(rows);
  }

  render() {
    const t = theme();
    const seen = shared("propeller.seen") ?? {};
    const of = (shared("space-folders") ?? {})[""]?.of ?? {};
    const asleep = new Set(Object.entries(of).filter(([, f]) => f === SLEEP).map(([id]) => id));
    const groups = Object.fromEntries(SECTIONS.map((x) => [x.id, []]));
    // Opening a space of the other profile (a key, a notification) switches the sidebar to it.
    const active = spaces().find((s) => s.active);
    if (active && active.id !== this.lastActive) {
      this.lastActive = active.id;
      if (profileOf(active) !== this.profile) this.setProfile(profileOf(active));
    }
    const everywhere = Object.fromEntries(SECTIONS.map((x) => [x.id, []]));
    for (const s of spaces()) {
      const st = this.state(s, seen, asleep);
      everywhere[st.kind].push({ s, st });
      if (profileOf(s) !== this.profile) continue;
      groups[st.kind].push({ s, st });
    }
    for (const g of Object.values(groups)) g.sort((a, b) => (b.st.since ?? 0) - (a.st.since ?? 0));
    if (narrow()) return this.rail(groups, t);

    const all = panes();
    const body = [this.top(everywhere, t)];
    const order = [];
    for (const sec of SECTIONS) {
      const rows = groups[sec.id];
      if (!rows.length) continue;
      body.push(this.header(sec, rows.length, t));
      if (this.folded[sec.id]) continue;
      const capped = sec.id === "inactive" && !this.allSleeping && rows.length > SLEEPING_PREVIEW;
      for (const { s, st } of capped ? rows.slice(0, SLEEPING_PREVIEW) : rows) {
        body.push(this.spaceRow(s, st, t));
        order.push(s.id);
        if (this.menuFor === s.id) body.push(this.actions(s, st, t));
        if (sec.id !== "inactive" && s.tabs.length > 1) for (const tab of s.tabs) body.push(this.tabRow(s, tab, all, t));
      }
      if (capped) body.push(div().id("more").h(24).flex_none().px(10).flex().items_center().text_size(12).text_color(t.dim)
        .rounded(6).hover((x) => x.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => { this.allSleeping = true; cx.notify(); })
        .child(`ще ${rows.length - SLEEPING_PREVIEW}`));
      body.push(div().h(6).flex_none());
    }
    this.order = order;
    return v_flex().id("propeller-agents").size_full().rounded(13).overflow_hidden().bg(t.chrome).px(6).py(8).gap(1).overflow_y_scroll()
      .children(body.length > 1 ? body : [...body, div().px(10).py(6).text_size(12).text_color(t.dim).child("Тут поки порожньо")]);
  }
}
