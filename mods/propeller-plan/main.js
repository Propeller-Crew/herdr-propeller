// Propeller plan: the side panel «План» — the plan Перрі keeps for this space in Propeller Tasks.
//
// Перрі (skills/herdr-tabs/perry.md) keeps one board project per space, sections «Чекає на тебе»,
// «В роботі», «На рев'ю», «Готово», and labels his terminal propeller.plan=<project id>. This panel
// finds that label in the space on screen (and in a server space nested under it,
// propeller-nest.json), reads the project over the REST API every 15 s, and shows it with what
// waits for Artem on top. A task opens in place: its description, its comments, and a field
// whose comment goes into the task and, as a note, to Перрі's terminal, so the talk about one task
// stays in its card instead of the orchestrator's chat (Artem, 23.11).
//
// The token (read, write) sits in ~/.config/herdr-app/data/plan-auth-header as a curl header
// file (600), so it never shows in a process list.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, terminals, theme, home, exec, checking } from "herdr";
import * as fs from "fs/promises";

const BASE = "https://tasks.propellercrew.com";
const API = `${BASE}/api/v1`;
const ART = "mods/propeller-art";
const ORDER = ["Чекає на тебе", "В роботі", "На рев'ю", "Готово"];
const COLOR = { "Чекає на тебе": "#F5A524", "В роботі": "#9B7BFF", "На рев'ю": "#4C9EEB", "Готово": "#34C759" };
const header = () => `${home()}/.config/herdr-app/data/plan-auth-header`;

async function api(path, body) {
  const args = ["-s", "-m", "12", "-H", `@${header()}`];
  if (body) args.push("-X", "POST", "-H", "Content-Type: application/json", "--data-binary", JSON.stringify(body));
  const r = await exec("curl", [...args, `${API}${path}`], { timeout: 15000 });
  if (r.code !== 0) throw new Error(`curl ${r.code}`);
  const d = JSON.parse(r.stdout || "null");
  if (d && d.error) throw new Error(String(d.error));
  return d;
}

async function all(path) {
  const out = [];
  let cursor = null;
  for (let i = 0; i < 10; i++) {
    const d = await api(`${path}${path.includes("?") ? "&" : "?"}limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    out.push(...(d?.results ?? []));
    cursor = d?.next_cursor;
    if (!cursor) break;
  }
  return out;
}

export default class PropellerPlan extends View {
  init(_props, cx) {
    this.plan = null;      // { project, boss } for the space on screen
    this.data = null;      // { project, sections, tasks }
    this.err = null;
    this.open = null;      // expanded task id
    this.comments = {};    // task id -> comments
    this.doneOpen = false;
    this.view = "plan";    // "plan": the queue; "report": what got done (project comments + «Готово»)
    this.sending = false;
    this.input = InputState.new({ placeholder: "Коментар у картку (Enter — надіслати)" });
    this.input.on("submit", (_e, cx) => { cx.spawn(async (cx) => { await this.comment(); cx.notify(); }); });
    if (checking()) return;
    cx.spawn(async (cx) => { await this.refresh(true); cx.notify(); });
    // The space on screen changes often: look for its plan every 2 s (cheap, no network), reload every 15 s.
    cx.timer.every(2000, (cx) => cx.spawn(async (cx) => { if (await this.refresh(false)) cx.notify(); }));
    cx.timer.every(15000, (cx) => cx.spawn(async (cx) => { await this.refresh(true); cx.notify(); }));
  }

  // The plan of the space on screen: Перрі's label there or in a server space nested under it.
  async find() {
    const active = spaces().find((s) => s.active);
    if (!active) return null;
    let nest = {};
    try { nest = JSON.parse(await fs.readFile(`${home()}/.config/herdr-app/data/propeller-nest.json`, "utf8")); } catch {}
    const ids = new Set([active.id]);
    for (const [kid, parent] of Object.entries(nest)) if (parent === active.id) ids.add(kid);
    // A server space on screen whose parent is here: the same project.
    if (nest[active.id]) { ids.add(nest[active.id]); for (const [kid, p] of Object.entries(nest)) if (p === nest[active.id]) ids.add(kid); }
    const tabs = new Set(spaces().filter((s) => ids.has(s.id)).flatMap((s) => s.tabs.map((t) => t.id)));
    const mine = new Set(panes().filter((p) => p.terminal && tabs.has(p.tab)).map((p) => p.terminal));
    const t = terminals().find((t) => t.state === "live" && mine.has(t.address) && t.labels?.["propeller.plan"]);
    return t ? { project: t.labels["propeller.plan"], boss: t.address } : null;
  }

  // full: reload the project from the API; otherwise only notice a different plan. True when something changed.
  async refresh(full) {
    const p = await this.find();
    const changed = (p?.project ?? null) !== (this.plan?.project ?? null);
    this.plan = p;
    if (changed) { this.data = null; this.open = null; this.comments = {}; this.err = null; }
    if (!p || (!full && !changed)) return changed;
    try {
      const [project, sections, tasks, report] = await Promise.all([
        api(`/projects/${p.project}`), all(`/sections?project_id=${p.project}`), all(`/tasks?project_id=${p.project}`),
        all(`/comments?project_id=${p.project}`)]);
      if (this.plan?.project !== p.project) return true;
      this.data = { project, sections, tasks, report };
      this.err = null;
      if (this.open) await this.loadComments(this.open);
    } catch (e) {
      this.err = e?.message ?? String(e);
    }
    return true;
  }

  async loadComments(id) {
    try { this.comments[id] = await all(`/comments?task_id=${id}`); } catch { this.comments[id] = this.comments[id] ?? []; }
  }

  async comment() {
    const text = this.input.value().trim(), id = this.open;
    if (!text || !id || this.sending) return;
    this.sending = true;
    try {
      await api("/comments", { task_id: id, content: text });
      this.input.set_value("");
      await this.loadComments(id);
      // Перрі hears it at once; the comment itself stays in the card.
      const task = this.data?.tasks.find((x) => x.id === id);
      if (this.plan?.boss) exec(`${home()}/.local/bin/hc`, ["send", this.plan.boss,
        `Коментар Артема до «${task?.content ?? id}» (задача ${id}) у плані: ${text}`], { timeout: 15000 }).catch(() => null);
    } catch (e) {
      this.err = `не надіслано: ${e?.message ?? e}`;
    }
    this.sending = false;
  }

  toggle(id, cx) {
    this.open = this.open === id ? null : id;
    if (this.open) cx.spawn(async (cx) => { await this.loadComments(id); cx.notify(); });
    cx.notify();
  }

  row(task, t, color) {
    const on = this.open === task.id;
    const first = (task.description ?? "").split("\n").find((l) => l.trim()) ?? "";
    const card = v_flex().id(`task-${task.id}`).flex_none().px(10).py(7).gap(3).rounded(9)
      .bg(on ? t.selected ?? t.hover : "#00000000").hover((x) => x.bg(t.hover))
      .on_click((_e, cx) => this.toggle(task.id, cx))
      .child(h_flex().gap(8).items_start()
        .child(div().mt(5).size(7).flex_none().rounded(4).bg(color))
        .child(div().flex_1().min_w(0).text_size(13).text_color(t.foreground).child(task.content)))
      .when(Boolean(first) && !on, (el) => el.child(div().pl(15).truncate().text_size(11.5).text_color(t.dim).child(first)));
    if (!on) return card;
    const comments = this.comments[task.id];
    return card
      .child(div().pl(15).pt(2).text_size(12).text_color(t.muted).child((task.description ?? "").slice(0, 1200) || "Без опису"))
      .child(v_flex().pl(15).pt(4).gap(4)
        .children((comments ?? []).slice(-6).map((c) => v_flex().gap(1).p(6).rounded(7).bg(t.hover)
          .child(div().text_size(10.5).text_color(t.dim).child((c.posted_at ?? "").slice(0, 16).replace("T", " ")))
          .child(div().text_size(12).text_color(t.foreground).child((c.content ?? "").slice(0, 800)))))
        .when(comments === undefined, (el) => el.child(div().text_size(11).text_color(t.dim).child("Коментарі…"))))
      .child(div().id(`input-${task.id}`).ml(15).mt(4).h(30).px(8).flex().items_center().rounded(7).border(1).border_color(t.border)
        .cursor_text().on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.input.focus(); })
        .on_click((_e, cx) => cx.stop_propagation())
        .child(Input.new(this.input).h_full().w_full().text_size(12).text_color(t.foreground)));
  }

  // «Звіт»: Перрі's results, one project comment each, newest first by day; then the closed cards.
  reportRows(t) {
    const { sections, tasks, report } = this.data;
    const rows = [];
    const day = (iso) => {
      const d = new Date(iso);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
      return diff === 0 ? "Сьогодні" : diff === 1 ? "Вчора" : `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
    };
    const items = [...(report ?? [])].sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));
    let last = null;
    for (const c of items) {
      const d = day(c.posted_at);
      if (d !== last) { rows.push(div().mt(10).mb(2).px(6).text_size(11.5).font_semibold().text_color(t.dim).child(d)); last = d; }
      const time = new Date(c.posted_at);
      rows.push(h_flex().flex_none().px(8).py(5).gap(8).items_start()
        .child(div().flex_none().w(34).pt(1).text_size(11).text_color(t.dim)
          .child(`${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`))
        .child(div().flex_1().min_w(0).text_size(12.5).text_color(t.foreground).child((c.content ?? "").slice(0, 1500))));
    }
    if (!items.length) rows.push(div().px(10).py(8).text_size(12).text_color(t.dim)
      .child("Звіту ще немає. Перрі пише сюди коментар до проєкту на кожен готовий результат."));
    const doneId = sections.find((x) => x.name === "Готово")?.id;
    const done = tasks.filter((x) => !x.is_deleted && (x.checked || (doneId && x.section_id === doneId)));
    if (done.length) {
      rows.push(div().mt(14).mb(2).px(6).text_size(11.5).font_semibold().text_color(t.dim).child(`Закриті картки · ${done.length}`));
      for (const x of done) rows.push(this.row(x, t, "#34C759"));
    }
    return rows;
  }

  render() {
    const t = theme();
    const box = v_flex().id("propeller-plan").size_full().bg(t.chrome).rounded(13).overflow_hidden();
    const note = (text) => box.child(div().p(14).text_size(12.5).text_color(t.muted).child(text));
    if (!this.plan) return note("У цьому просторі плану ще немає. Його веде Перрі: правий клік по простору → «Покликати Перрі», і він заведе дошку в Propeller Tasks. Уже є Перрі — попроси його «заведи план».");
    if (!this.data) return note(this.err ? `План не завантажився: ${this.err}` : "Завантажую план…");
    const { project, sections, tasks } = this.data;
    const open = tasks.filter((x) => !x.checked && !x.is_deleted);
    const byName = new Map(sections.map((s) => [s.id, s.name]));
    const groups = new Map();
    for (const x of open) {
      const name = byName.get(x.section_id) ?? "Без розділу";
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(x);
    }
    const names = [...ORDER.filter((n) => groups.has(n)), ...[...groups.keys()].filter((n) => !ORDER.includes(n))];
    const rows = [];
    for (const name of names) {
      const list = groups.get(name).sort((a, b) => (a.child_order ?? 0) - (b.child_order ?? 0));
      const color = COLOR[name] ?? t.dim;
      const folded = name === "Готово" && !this.doneOpen;
      rows.push(h_flex().id(`sec-${name}`).flex_none().mt(8).mb(2).px(4).gap(6).items_center()
        .when(name === "Готово", (el) => el.cursor_pointer().on_click((_e, cx) => { this.doneOpen = !this.doneOpen; cx.notify(); }))
        .child(h_flex().gap(5).px(9).py(3).rounded(11).bg(color + "33").items_center()
          .child(div().text_size(12).font_semibold().text_color(color).child(name))
          .child(div().text_size(11).font_bold().text_color(color).opacity(0.7).child(String(list.length))))
        .when(name === "Готово", (el) => el.child(div().flex_1()).child(svg(`${ART}/chevron-${folded ? "right" : "down"}.svg`).size(12).text_color(t.dim))));
      if (!folded) for (const x of list) rows.push(this.row(x, t, color));
    }
    if (!rows.length) rows.push(div().px(10).py(8).text_size(12).text_color(t.dim).child("Відкритих задач немає"));
    const pill = (id, label) => div().id(`view-${id}`).px(9).py(3).rounded(7).text_size(12)
      .bg(this.view === id ? t.hover : "#00000000").text_color(this.view === id ? t.foreground : t.muted)
      .hover((x) => x.text_color(t.foreground)).on_click((_e, cx) => { this.view = id; this.open = null; cx.notify(); }).child(label);
    return box
      .child(h_flex().flex_none().h(38).px(12).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(13).font_semibold().text_color(t.foreground).child(project?.name ?? "План"))
        .child(h_flex().flex_none().gap(2).child(pill("plan", "Черга")).child(pill("report", "Звіт")))
        .when(Boolean(this.err), (el) => el.child(div().text_size(11).text_color("#F5A524").child("!")))
        .child(div().id("plan-web").px(7).py(3).rounded(6).text_size(11.5).text_color(t.muted).hover((x) => x.bg(t.hover).text_color(t.foreground))
          .on_click(() => exec("open", [`${BASE}/project/${this.plan.project}`]).catch(() => null))
          .child("у вебі ↗")))
      .child(v_flex().id("plan-list").flex_1().min_h(0).px(6).pb(10).overflow_y_scroll().children(this.view === "report" ? this.reportRows(t) : rows));
  }
}
