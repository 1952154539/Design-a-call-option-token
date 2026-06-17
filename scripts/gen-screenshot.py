#!/usr/bin/env python3
"""Generate terminal-style screenshot PNG from demo output log."""

from PIL import Image, ImageDraw, ImageFont
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(BASE, "blockchain", "demo-output.log")
OUT = os.path.join(BASE, "blockchain", "demo-screenshot.png")

with open(LOG) as f:
    lines = f.readlines()

# ====== Font setup ======
FONT_SIZE = 13
LINE_HEIGHT = 19
FONT_MONO = None
FONT_BOLD = None

# Prefer Noto Sans Mono CJK SC (monospace + Chinese)
cjk_regular = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
cjk_bold = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

if os.path.exists(cjk_regular):
    FONT_MONO = ImageFont.truetype(cjk_regular, FONT_SIZE, index=2)  # SC
if os.path.exists(cjk_bold):
    FONT_BOLD = ImageFont.truetype(cjk_bold, FONT_SIZE, index=2)     # SC Bold

# Fallback to DejaVu Sans Mono if CJK not found
if FONT_MONO is None:
    djv = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
    if os.path.exists(djv):
        FONT_MONO = ImageFont.truetype(djv, FONT_SIZE)
    else:
        FONT_MONO = ImageFont.load_default()

if FONT_BOLD is None:
    FONT_BOLD = FONT_MONO

# ====== Color palette (Catppuccin Mocha) ======
COL_BG        = "#1e1e2e"
COL_TITLE_BG  = "#181825"
COL_TEXT      = "#cdd6f4"
COL_GREEN     = "#a6e3a1"
COL_YELLOW    = "#f9e2af"
COL_CYAN      = "#89dceb"
COL_DIM       = "#6c7086"
COL_RED       = "#f38ba8"
COL_WHITE     = "#ffffff"
COL_BLUE      = "#89b4fa"
COL_MAGENTA   = "#cba6f7"

def pick_color(line):
    """Syntax-highlight a line based on its content."""
    s = line.strip()
    if s.startswith("=" * 10):
        return COL_CYAN
    if s.startswith("【") or s.startswith("Step"):
        return COL_MAGENTA
    if s.startswith("行权价格") or s.startswith("标的存入") or s.startswith("共需支付"):
        return COL_WHITE
    if s.startswith("池子") or "USDT" in s:
        return COL_YELLOW
    if s.startswith("到期") or "时间戳" in s:
        return COL_CYAN
    if s.startswith("用户") or s.startswith("项目方") or s.startswith("合约"):
        return COL_TEXT
    if s.startswith("0x"):
        return COL_BLUE
    if "收益" in s or "获得" in s or "利润" in s:
        return COL_GREEN
    if "✓" in s or "成功" in s or "收益" in s:
        return COL_GREEN
    if "Gas" in s or "消耗" in s:
        return COL_DIM
    if s.startswith(">") or s.startswith("提示"):
        return COL_DIM
    if "行权" in s and "余额" in s or "枚" in s:
        return COL_GREEN
    return COL_TEXT

# ====== Measure layout ======
dummy_img = Image.new("RGB", (1, 1))
d = ImageDraw.Draw(dummy_img)
max_w = 0
for line in lines:
    line = line.rstrip("\n\r")
    bbox = d.textbbox((0, 0), line, font=FONT_MONO)
    w = bbox[2] - bbox[0]
    if w > max_w:
        max_w = w

PADDING_H = 28
PADDING_V = 22
TITLE_H   = 34
img_w = max_w + PADDING_H * 2
img_h = TITLE_H + PADDING_V * 2 + len(lines) * LINE_HEIGHT + 10

# ====== Draw ======
img = Image.new("RGB", (img_w, img_h), COL_BG)
draw = ImageDraw.Draw(img)

# Title bar
draw.rectangle([(0, 0), (img_w, TITLE_H)], fill=COL_TITLE_BG)
dot_y = 10
for i, clr in enumerate(["#f38ba8", "#fab387", "#a6e3a1"]):
    draw.ellipse(
        [(PADDING_H + i * 18, dot_y), (PADDING_H + i * 18 + 12, dot_y + 12)],
        fill=clr,
    )
title = "Terminal — npx hardhat run scripts/demo.js"
draw.text((PADDING_H + 60, dot_y - 2), title, fill=COL_DIM, font=FONT_MONO)

# Render lines
y = TITLE_H + PADDING_V
for line in lines:
    line = line.rstrip("\n\r")
    color = pick_color(line)
    if line.strip():
        draw.text((PADDING_H, y), line, fill=color, font=FONT_MONO)
    y += LINE_HEIGHT

img.save(OUT)
print(f"Screenshot saved: {OUT}  ({img_w}x{img_h})")
