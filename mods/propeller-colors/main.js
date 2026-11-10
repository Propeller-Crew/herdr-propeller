// The colour picker for our glass theme, from the octopus card's menu ("Кольори…").
// A hue wheel and ready palettes; the propeller mod repaints the theme files from the choice
// (shared "propeller.colors.pick" -> it writes themes/propeller-glass-*.json and keeps it).

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, shared, setShared, props, closeOverlay } from "herdr";
import { PRESETS, swatch } from "./palette.js";

const W = 220, RING = 30, DOT = 16, BAR = 196;
// The sliders: saturation 0..1.6 (1 = the palette's own), lightness -1..1 (0 = as made).
const SLIDERS = [
  { key: "c", label: "Насиченість", min: 0, max: 1.6, def: 1 },
  { key: "l", label: "Яскравість", min: -1, max: 1, def: 0 },
];
const same = (a, b) => a.h === b.h && a.c === b.c && (a.l ?? 0) === (b.l ?? 0);

export default class Colors extends View {
  init(_p, cx) {
    this.pick = { l: 0, ...(shared("propeller.colors") ?? PRESETS[0]) };
    this.dragging = false;
    this.sliding = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  choose(p, cx) {
    this.pick = p;
    setShared("propeller.colors.pick", { ...p, at: Date.now() });
    cx.notify();
  }

  // A press or drag on the ring: the angle from the top, clockwise, is the hue.
  hueAt(pos) {
    if (!pos) return null;
    const dx = pos.x - W / 2, dy = pos.y - W / 2, r = Math.hypot(dx, dy);
    if (!this.dragging && (r < W / 2 - RING - 6 || r > W / 2 + 2)) return null;
    return Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);
  }

  render(cx) {
    const t = theme();
    const p = this.pick;
    const ang = (p.h * Math.PI) / 180, rr = W / 2 - RING / 2;
    const named = PRESETS.find((x) => same(x, p))?.name ?? `Свій · ${p.h}°`;
    const wheel = div().id("wheel").relative().size(W).flex_none()
      .child(image("mods/propeller-art/hue-wheel.png").absolute().top(0).left(0).size(W).when(!p.c, (el) => el.opacity(0.35)))
      .child(div().absolute().top(RING + 14).left(RING + 14).size(W - 2 * RING - 28).rounded_full().bg(swatch(p))
        .flex().items_center().justify_center().text_color("#ffffff").text_size(13).font_medium().child(named))
      .when(!!p.c, (el) => el.child(div().absolute().size(DOT).rounded_full().border(2).border_color("#ffffff").bg(swatch(p))
        .left(W / 2 + rr * Math.sin(ang) - DOT / 2).top(W / 2 - rr * Math.cos(ang) - DOT / 2)))
      .on_mouse_down("left", (e, cx) => {
        const h = this.hueAt(e.local_position);
        if (h == null) return;
        this.dragging = true;
        this.pick = { ...p, h, c: p.c || 1 };
        cx.notify();
      })
      .on_mouse_move((e, cx) => {
        if (!this.dragging) return;
        const h = this.hueAt(e.local_position);
        if (h != null) { this.pick = { ...this.pick, h }; cx.notify(); }
      })
      .on_mouse_up("left", (_e, cx) => {
        if (!this.dragging) return;
        this.dragging = false;
        this.choose(this.pick, cx);
      });
    const dot = (x, i) => v_flex().id(`preset-${i}`).w(56).gap(4).items_center().py(4).rounded(8)
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.choose({ h: x.h, c: x.c, l: p.l ?? 0 }, cx))
      .child(div().size(22).rounded_full().bg(swatch(x))
        .when(x.h === p.h && x.c === p.c, (el) => el.border(2).border_color(t.foreground)))
      .child(div().text_size(11).text_color(x.h === p.h && x.c === p.c ? t.foreground : t.muted).child(x.name));
    // A slider: press or drag along the bar; double-click puts it back.
    const at = (sl, pos) => {
      const f = Math.max(0, Math.min(1, (pos?.x ?? 0) / BAR));
      return Math.round((sl.min + f * (sl.max - sl.min)) * 20) / 20;
    };
    const slider = (sl) => {
      const v = p[sl.key] ?? sl.def, f = (v - sl.min) / (sl.max - sl.min);
      return v_flex().w(BAR + 40).gap(5)
        .child(h_flex().justify_between().text_size(11)
          .child(div().text_color(t.muted).child(sl.label))
          .child(div().text_color(t.dim).child(sl.key === "c" ? `${Math.round(v * 100)}%` : `${v > 0 ? "+" : ""}${Math.round(v * 100)}`)))
        .child(div().id(`sl-${sl.key}`).relative().w(BAR).h(16).mx(20)
          .child(div().absolute().left(0).top(6).w(BAR).h(4).rounded_full().bg(t.border))
          .child(div().absolute().left(0).top(6).w(BAR * f).h(4).rounded_full().bg(swatch(p)))
          .child(div().absolute().top(0).left(BAR * f - 8).size(16).rounded_full().border(2).border_color("#ffffff").bg(swatch(p)))
          .on_mouse_down("left", (e, cx) => {
            if (e.click_count === 2) { this.sliding = null; return this.choose({ ...p, [sl.key]: sl.def }, cx); }
            this.sliding = sl.key;
            this.pick = { ...p, [sl.key]: at(sl, e.local_position) };
            cx.notify();
          })
          .on_mouse_move((e, cx) => {
            if (this.sliding !== sl.key) return;
            this.pick = { ...this.pick, [sl.key]: at(sl, e.local_position) };
            cx.notify();
          })
          .on_mouse_up("left", (_e, cx) => {
            if (this.sliding !== sl.key) return;
            this.sliding = null;
            this.choose(this.pick, cx);
          }));
    };
    return v_flex().id("colors").track_focus(this.handle).size_full().p(16).gap(14).items_center().bg(t.popover).text_color(t.foreground)
      .on_key_down((e) => { if (e.key === "escape") closeOverlay(props()?.overlay); })
      .child(h_flex().w_full().justify_between().items_center()
        .child(div().text_size(14).font_medium().child("Кольори"))
        .child(div().text_size(11).text_color(t.dim).child("світла й темна разом")))
      .child(wheel)
      .child(v_flex().gap(10).items_center().children(SLIDERS.map(slider)))
      .child(h_flex().flex_wrap().justify_center().gap(2).children(PRESETS.map(dot)));
  }
}
