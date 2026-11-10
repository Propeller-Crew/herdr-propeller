// The colour picker for our glass theme, from the octopus card's menu ("Кольори…").
// A hue wheel and ready palettes; the propeller mod repaints the theme files from the choice
// (shared "propeller.colors.pick" -> it writes themes/propeller-glass-*.json and keeps it).

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, shared, setShared, props, closeOverlay } from "herdr";
import { PRESETS, swatch } from "./palette.js";

const W = 220, RING = 30, DOT = 16;

export default class Colors extends View {
  init(_p, cx) {
    this.pick = shared("propeller.colors") ?? PRESETS[0];
    this.dragging = false;
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
    const named = PRESETS.find((x) => x.h === p.h && x.c === p.c)?.name ?? `Свій · ${p.h}°`;
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
        this.pick = { h, c: p.c || 1 };
        cx.notify();
      })
      .on_mouse_move((e, cx) => {
        if (!this.dragging) return;
        const h = this.hueAt(e.local_position);
        if (h != null) { this.pick = { h, c: this.pick.c }; cx.notify(); }
      })
      .on_mouse_up("left", (_e, cx) => {
        if (!this.dragging) return;
        this.dragging = false;
        this.choose(this.pick, cx);
      });
    const dot = (x, i) => v_flex().id(`preset-${i}`).w(56).gap(4).items_center().py(4).rounded(8)
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.choose({ h: x.h, c: x.c }, cx))
      .child(div().size(22).rounded_full().bg(swatch(x))
        .when(x.h === p.h && x.c === p.c, (el) => el.border(2).border_color(t.foreground)))
      .child(div().text_size(11).text_color(x.h === p.h && x.c === p.c ? t.foreground : t.muted).child(x.name));
    return v_flex().id("colors").track_focus(this.handle).size_full().p(16).gap(14).items_center().bg(t.popover).text_color(t.foreground)
      .on_key_down((e) => { if (e.key === "escape") closeOverlay(props()?.overlay); })
      .child(h_flex().w_full().justify_between().items_center()
        .child(div().text_size(14).font_medium().child("Кольори"))
        .child(div().text_size(11).text_color(t.dim).child("світла й темна разом")))
      .child(wheel)
      .child(h_flex().flex_wrap().justify_center().gap(2).children(PRESETS.map(dot)));
  }
}
