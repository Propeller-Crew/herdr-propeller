// Our glass theme in any hue: the teal one (hue 175) is the reference, every colour is that
// teal turned to the chosen hue. c scales the saturation: 1 coloured, 0 graphite.
// The accent sits opposite the canvas on the wheel (orange for teal), and stays orange for graphite.

const hex = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
export function hsl(h, s, l, a) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, f = (n) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${hex(f(0) * 255)}${hex(f(8) * 255)}${hex(f(4) * 255)}${a ?? ""}`;
}

export const PRESETS = [
  { name: "Бірюза", h: 175, c: 1 },
  { name: "Небо", h: 205, c: 1 },
  { name: "Індиго", h: 235, c: 0.9 },
  { name: "Фіалка", h: 270, c: 0.8 },
  { name: "Троянда", h: 335, c: 0.8 },
  { name: "Пісок", h: 35, c: 0.8 },
  { name: "Мох", h: 110, c: 0.7 },
  { name: "Графіт", h: 210, c: 0 },
];

// What the picker shows for a choice: a mid-tone of its canvas.
export const swatch = ({ h, c }) => hsl(h, 10 + 45 * c, 50);

export function colors({ h, c }, dark) {
  const d = h - 175, s = (x) => x * c;
  const accent = c ? (dark ? hsl(h + 206, 57, 64) : hsl(h + 202, 55, 52)) : dark ? "#d89470" : "#c8663f";
  if (dark) {
    const ink = h + 48; // the text's cool grey, turned with the rest
    return {
      canvas: hsl(191 + d, s(44), 7),
      chrome: hsl(190 + d, s(41), 12, "99"),
      background: hsl(188 + d, s(44), 10, "8f"),
      surface: "#ffffff0d", hover: "#ffffff1a", selected: "#ffffff21", border: "#ffffff1f",
      popover: hsl(190 + d, s(45), 13, "f2"),
      foreground: hsl(ink, 10 + s(20), 77),
      muted: hsl(ink - 2, 6 + s(11), 59),
      dim: hsl(ink - 3, 5 + s(10), 44),
      accent,
    };
  }
  const tint = hsl(180 + d, s(66), 17);
  return {
    canvas: hsl(173 + d, 6 + s(24), 84),
    chrome: "#ffffff9e",
    background: hsl(180 + d, s(33), 99, "c7"),
    surface: tint + "0a", hover: tint + "12", selected: tint + "1f", border: tint + "1f",
    popover: hsl(165 + d, s(40), 98, "f5"),
    foreground: hsl(198 + d, 5 + s(16), 19),
    muted: hsl(196 + d, 3 + s(8), 38),
    dim: hsl(195 + d, 3 + s(6), 56),
    accent,
  };
}
