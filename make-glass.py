"""Builds the glass look: a pre-blurred wallpaper (Herdr can't blur what's behind a card, so the
wallpaper comes blurred) and layout-propeller-glass.json, derived from layout-propeller.json with
see-through cards. Run by sync-mods.sh, so the glass layout follows every change to ours."""
import json, os, random
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
bg = os.path.join(HERE, "backgrounds", "glass-dusk.png")
if not os.path.exists(bg):
    W, H = 2880, 1800
    im = Image.new("RGB", (W, H), (22, 24, 38))
    d = ImageDraw.Draw(im)
    random.seed(7)
    for (x, y, r, c) in [(0.15, 0.20, 0.42, (232, 132, 92)), (0.85, 0.15, 0.38, (140, 110, 230)),
                         (0.70, 0.85, 0.45, (70, 140, 230)), (0.25, 0.90, 0.30, (220, 90, 150)),
                         (0.50, 0.45, 0.25, (90, 200, 190))]:
        R = int(r * W)
        d.ellipse([x * W - R, y * H - R, x * W + R, y * H + R], fill=c)
    im = im.filter(ImageFilter.GaussianBlur(260))
    # A dark veil keeps terminal text readable over the bright spots.
    im = Image.blend(im, Image.new("RGB", (W, H), (18, 20, 32)), 0.35)
    im.save(bg, optimize=True)

d = json.load(open(os.path.join(HERE, "layout-propeller.json")))
d["background"] = {"image": "backgrounds/glass-dusk.png", "fit": "cover"}
d["theme"] = "propeller-dusk"
d["terminal_opacity"] = 0
d["colors"] = {
    "chrome": "#1a1c2a99",      # sidebar cards and bars
    "background": "#1418247a",  # terminal cards
    "surface": "#ffffff14",
    "hover": "#ffffff24",
    "selected": "#ffffff2e",
    "border": "#ffffff30",
    "canvas": "#00000000",
    "popover": "#262a3af2",     # menus stay nearly solid so they read over anything
}
d["preview"] = "layouts/islands.svg"
json.dump(d, open(os.path.join(HERE, "layout-propeller-glass.json"), "w"), indent=2)
print("glass ok")
