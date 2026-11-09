"""Builds layout-propeller-glass.json, derived from layout-propeller.json with
see-through cards. Run by sync-mods.sh, so the glass layout follows every change to ours."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "layout-propeller.json")))
# Herdr can't make its window see-through (no transparency or blur in 0.1.x), so no picture
# behind the cards: a flat teal-tinted canvas and see-through teal cards on it.
d["background"] = "#0a171a"
d["theme"] = "propeller-dusk"
d["terminal_opacity"] = 0
d["colors"] = {
    "chrome": "#0b1e2199",      # sidebar cards and bars
    "background": "#08171a8c",  # terminal cards
    "surface": "#ffffff0d",
    "hover": "#ffffff1a",
    "selected": "#ffffff21",
    "border": "#ffffff1c",
    "canvas": "#00000000",
    "popover": "#122b30f2",     # menus stay nearly solid so they read over anything
    "foreground": "#b3bdd6",
    "muted": "#8590a8",
    "dim": "#5f6a80",
    "accent": "#d89470",
}
d["preview"] = "layouts/islands.svg"
json.dump(d, open(os.path.join(HERE, "layout-propeller-glass.json"), "w"), indent=2)
print("glass ok")
