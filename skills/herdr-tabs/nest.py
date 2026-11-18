#!/usr/bin/env python3
"""Show a server space under a space on this Mac in the Propeller sidebar (propeller-agents).

    nest.py <server space id>            under the space this Claude runs in
    nest.py <server space id> <space id> under that space
    nest.py --off <server space id>      on its own again

Run it after `herdr-app do space.new ... "machine":"propeller"` when the work moved there from a
space here, so the project reads as one: the server tabs sit under it with a server chip.
The id is the "id" space.new prints, with or without its "propeller/" prefix."""
import json, os, subprocess, sys

PATH = os.path.expanduser("~/.config/herdr-app/data/propeller-nest.json")
args = sys.argv[1:]
off = "--off" in args
args = [a for a in args if a != "--off"]
if not args:
    sys.exit(__doc__)
ls = json.loads(subprocess.run(["herdr-app", "ls"], capture_output=True, text=True).stdout or "{}")
spaces = {s["id"]: s for s in ls.get("spaces", [])}
child = args[0]
if child not in spaces:
    child = next((i for i, s in spaces.items() if s.get("machine") and i.split("/", 1)[-1] == child), child)
if child not in spaces or not spaces[child].get("machine"):
    sys.exit(f"{args[0]}: not a space on another machine (herdr-app ls)")
try:
    nest = json.load(open(PATH))
except Exception:
    nest = {}
if off:
    nest.pop(child, None)
else:
    if len(args) > 1:
        parent = args[1]
    else:
        here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "here.py")
        parent = json.loads(subprocess.run([sys.executable, here], capture_output=True, text=True).stdout)["space"]
    if parent not in spaces or spaces[parent].get("machine"):
        sys.exit(f"{parent}: not a space on this Mac")
    nest[child] = parent
os.makedirs(os.path.dirname(PATH), exist_ok=True)
with open(PATH + ".tmp", "w") as f:
    json.dump(nest, f, ensure_ascii=False)
os.replace(PATH + ".tmp", PATH)
print(json.dumps({"nested": child, "under": None if off else nest[child]}))
