"""Builds layout-propeller-glass.json, derived from layout-propeller.json with
see-through cards. Run by sync-mods.sh, so the glass layout follows every change to ours."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "layout-propeller.json")))
# Herdr can't make its window see-through (no transparency or blur in 0.1.x), so no picture
# behind the cards: a flat teal-tinted canvas and see-through teal cards on it.
d["background"] = "#0f2226"
d["theme"] = "propeller-dusk"
d["terminal_opacity"] = 0
d["colors"] = {
    "chrome": "#0e2a2e8c",      # sidebar cards and bars
    "background": "#0b1f2380",  # terminal cards
    "surface": "#ffffff14",
    "hover": "#ffffff24",
    "selected": "#ffffff2e",
    "border": "#ffffff30",
    "canvas": "#00000000",
    "popover": "#16343af2",     # menus stay nearly solid so they read over anything
}
d["preview"] = "layouts/islands.svg"
json.dump(d, open(os.path.join(HERE, "layout-propeller-glass.json"), "w"), indent=2)
print("glass ok")
