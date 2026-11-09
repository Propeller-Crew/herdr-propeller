"""Blurs the current macOS wallpaper and tints it teal for the glass layout. Run again after
changing the wallpaper: python3 make-glass-desktop.py && ./sync-mods.sh"""
import os, subprocess
from PIL import Image, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
src = subprocess.run(["osascript", "-e", 'tell application "System Events" to get picture of desktop 1'],
                     capture_output=True, text=True).stdout.strip()
im = Image.open(src).convert("RGB")
W = 2880
im = im.resize((W, int(im.size[1] * W / im.size[0])))
im = im.filter(ImageFilter.GaussianBlur(60))
im = Image.blend(im, Image.new("RGB", im.size, (18, 92, 96)), 0.38)   # teal tint
im = Image.blend(im, Image.new("RGB", im.size, (10, 22, 28)), 0.30)   # dark veil for text
im.save(os.path.join(HERE, "backgrounds", "glass-desktop.png"), optimize=True)
print("ok:", src)
