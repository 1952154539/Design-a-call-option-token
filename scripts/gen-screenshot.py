#!/usr/bin/env python3
"""Generate terminal-style screenshot from demo output log."""

from PIL import Image, ImageDraw, ImageFont
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(BASE, "blockchain", "demo-output.log")
OUT = os.path.join(BASE, "blockchain", "demo-screenshot.png")

with open(LOG) as f:
    lines = f.readlines()

# Config
FONT_SIZE = 13
PADDING_H = 24
PADDING_V = 20
LINE_HEIGHT = 19
TITLE_BAR_HEIGHT = 32
COL_BG = "#1e1e2e"        # terminal background
COL_TITLE_BG = "#2d2d3f"
COL_TEXT = "#cdd6f4"
COL_GREEN = "#a6e3a1"
COL_YELLOW = "#f9e2af"
COL_CYAN = "#89dceb"
COL_DIM = "#6c7086"
COL_RED = "#f38ba8"
COL_WHITE = "#ffffff"
COL_BLUE = "#89b4fa"

# Try to load a monospace font
font = None
for name in [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    "/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf",
    "/usr/share/fonts/truetype/firacode/FiraCode-Regular.ttf",
]:
    if os.path.exists(name):
        font = ImageFont.truetype(name, FONT_SIZE)
        break

if font is None:
    font = ImageFont.load_default()

# Measure
dummy_img = Image.new("RGB", (1, 1))
d = ImageDraw.Draw(dummy_img)
max_w = 0
for line in lines:
    line = line.rstrip("\n\r")
    bbox = d.textbbox((0, 0), line, font=font)
    w = bbox[2] - bbox[0]
    if w > max_w:
        max_w = w

img_w = max_w + PADDING_H * 2
img_h = TITLE_BAR_HEIGHT + len(lines) * LINE_HEIGHT + PADDING_V * 2

img = Image.new("RGB", (img_w, img_h), COL_BG)
draw = ImageDraw.Draw(img)

# Title bar background
draw.rectangle([(0, 0), (img_w, TITLE_BAR_HEIGHT)], fill=COL_TITLE_BG)
# Title bar dots
for i, clr in enumerate(["#f38ba8", "#fab387", "#a6e3a1"]):
    draw.ellipse([(PADDING_H + i * 18, 10), (PADDING_H + i * 18 + 12, 22)], fill=clr)
# Title text
title = "Terminal — npx hardhat run scripts/demo.js"
draw.text((PADDING_H + 60, 8), title, fill=COL_DIM, font=font)

# Draw each line with syntax highlighting
y = TITLE_BAR_HEIGHT + PADDING_V
for line in lines:
    line = line.rstrip("\n\r")
    x = PADDING_H

    # Determine color based on content
    if line.startswith("="):
        color = COL_CYAN
    elif line.startswith("---"):
        color = COL_DIM
    elif "Error" in line or "error" in line:
        color = COL_RED
    elif line.startswith("  ") and ("部署" in line or "部署" in line or "余额" in line or "获得" in line):
        color = COL_WHITE
    elif "ETH" in line and ("余额" in line or "收益" in line or "回款" in line):
        color = COL_GREEN
    elif "USDT" in line:
        color = COL_YELLOW
    elif "✓" in line or "成功" in line or "收益" in line:
        color = COL_GREEN
    elif "0x" in line:
        color = COL_BLUE
    elif line.startswith("行权价格") or line.startswith("标的"):
        color = COL_WHITE
    elif line.startswith("初始") or line.startswith("池子"):
        color = COL_YELLOW
    elif line.startswith("到期"):
        color = COL_CYAN
    elif "【" in line:
        color = COL_WHITE
    elif "提示" in line or ">" in line:
        color = COL_DIM
    elif line.strip() == "":
        color = COL_BG  # skip empty lines visually
    else:
        color = COL_TEXT

    draw.text((x, y), line, fill=color, font=font)
    y += LINE_HEIGHT

img.save(OUT)
print(f"Screenshot saved to: {OUT}  ({img_w}x{img_h})")
