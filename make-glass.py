"""Builds layout-propeller-glass.json, derived from layout-propeller.json with
see-through cards. Run by sync-mods.sh, so the glass layout follows every change to ours."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "layout-propeller.json")))
# Herdr can't make its window see-through (no transparency or blur in 0.1.x), so no picture
# behind the cards: a flat teal-tinted canvas and see-through cards on it. The glass colors live
# in the two themes (colors in a layout apply to both appearances), so it follows the system.
d.pop("background", None)
d.pop("colors", None)
d["theme"] = {"light": "propeller-glass-light", "dark": "propeller-glass-dark"}
d["terminal_opacity"] = 0
d["preview"] = "layouts/islands.svg"
json.dump(d, open(os.path.join(HERE, "layout-propeller-glass.json"), "w"), indent=2)
print("glass ok")
