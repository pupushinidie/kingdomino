"""把选中的候选导出成网页用的正式文件（apps/web/public/art）。

- terrain/{W,F,L,G,S,M}-{0,1,2}.png：32×32 地形格，每种 3 张变体（selection.json 里的候选编号）。
- terrain16/：同样的图缩成 16×16（每 2×2 取出现最多的颜色），给 48 / 80 / 112 这些中间尺寸用。
- terrain/castle-{颜色}.png、terrain16/castle-{颜色}.png：城堡格，红屋顶按色相蒙版换成粉 / 黄 / 绿 / 蓝。
- ui/king-{颜色}.png：国王棋子，红袍同样换色，裁掉四周透明边后放回 32×32 正中。
- ui/crown.png：代码画的 9×8 皇冠（数量要准，不让模型画）。
- ui/scene-night.png、ui/scene-day.png：512×288 场景。ui/icon.png：网页图标（城堡格放大）。

用法：python art/export.py
"""
from __future__ import annotations

import colorsys
import json
import pathlib
from collections import Counter

from PIL import Image

ART = pathlib.Path(__file__).resolve().parent
OUT = ART / "out" / "r1"
PUBLIC = ART.parent / "apps" / "web" / "public" / "art"
SELECTION = json.loads((ART / "selection.json").read_text())

TERRAIN_DIRS = {"W": "t-wheat", "F": "t-forest", "L": "t-lake", "G": "t-grass", "S": "t-swamp", "M": "t-mine"}

# 目标颜色：色相（0–1）、饱和度倍数、亮度倍数
COLORS = {
    "pink": (0.90, 0.85, 1.12),
    "yellow": (0.13, 1.05, 1.32),
    "green": (0.33, 0.85, 0.95),
    "blue": (0.60, 0.95, 1.05),
}


def candidate(folder: str, index: int) -> Image.Image:
    name = f"{folder}.png" if index == 0 else f"{folder}-{index}.png"
    return Image.open(OUT / folder / name).convert("RGBA")


def half(image: Image.Image) -> Image.Image:
    """2× 缩小：每 2×2 取出现最多的颜色（并列取左上），像素画缩小后不糊。"""
    w, h = image.size
    small = Image.new("RGBA", (w // 2, h // 2))
    src = image.load()
    dst = small.load()
    for y in range(h // 2):
        for x in range(w // 2):
            block = [src[2 * x, 2 * y], src[2 * x + 1, 2 * y], src[2 * x, 2 * y + 1], src[2 * x + 1, 2 * y + 1]]
            counts = Counter(block)
            best = max(block, key=lambda color: (counts[color], -block.index(color)))
            dst[x, y] = best
    return small


def fill_background(image: Image.Image, colors: list[tuple[int, int, int]]) -> Image.Image:
    """把从四边连进来的「天空」（和左上角完全同色的一片）换成地面：colors 按棋盘格交替铺，有一点纹理。"""
    out = image.copy()
    px = out.load()
    w, h = out.size
    bg = px[0, 0]
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    seen = set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h) or px[x, y] != bg:
            continue
        seen.add((x, y))
        stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    for x, y in seen:
        # 稀疏的纹理：大部分是第一种颜色，少量第二、三种
        pick = 0 if (x * 7 + y * 13) % 9 else (1 if (x + y) % 2 else len(colors) - 1)
        px[x, y] = (*colors[pick], 255)
    return out


LAWN = [(71, 147, 61), (77, 143, 68), (64, 132, 56)]
ROCK = [(52, 58, 64), (63, 70, 74), (40, 43, 54)]


def is_red(r: int, g: int, b: int) -> bool:
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return (h < 0.045 or h > 0.94) and s > 0.45 and v > 0.25


def recolor(image: Image.Image, target: tuple[float, float, float], mask=None) -> Image.Image:
    """红色区域换成目标色：色相换掉，饱和度、亮度按倍数调。mask(x, y) 限定区域（可选）。"""
    hue, sat_k, val_k = target
    out = image.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or not is_red(r, g, b) or (mask and not mask(x, y)):
                continue
            _, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            nr, ng, nb = colorsys.hsv_to_rgb(hue, min(1.0, s * sat_k), min(1.0, v * val_k))
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return out


def trim_center(image: Image.Image, size: int = 32) -> Image.Image:
    """裁掉四周透明边，放回 size × size 的正中（底部对齐，留 1px）。"""
    box = image.getchannel("A").getbbox()
    if not box:
        return image
    cropped = image.crop(box)
    canvas = Image.new("RGBA", (size, size))
    x = (size - cropped.width) // 2
    y = size - 1 - cropped.height
    canvas.alpha_composite(cropped, (max(0, x), max(0, y)))
    return canvas


# 皇冠形状（7×5，Y 金、H 高光、S 箍、R 宝石），外面一圈深色描边，共 9×7，放进 9×8。
CROWN_SHAPE = [
    "Y..Y..Y",
    "HY.R.YY",
    "HYYYYYY",
    "HYYYYYY",
    "SSSRSSS",
]
CROWN_COLORS = {"Y": (246, 196, 52, 255), "H": (255, 238, 150, 255), "S": (184, 118, 22, 255), "R": (220, 48, 60, 255)}
OUTLINE = (58, 36, 8, 255)


def crown() -> Image.Image:
    image = Image.new("RGBA", (9, 8))
    px = image.load()
    filled = set()
    for y, row in enumerate(CROWN_SHAPE):
        for x, ch in enumerate(row):
            if ch in CROWN_COLORS:
                px[x + 1, y + 1] = CROWN_COLORS[ch]
                filled.add((x + 1, y + 1))
    for x in range(9):
        for y in range(8):
            if (x, y) in filled:
                continue
            if any((x + dx, y + dy) in filled for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = OUTLINE
    return image


def main() -> None:
    (PUBLIC / "terrain").mkdir(parents=True, exist_ok=True)
    (PUBLIC / "terrain16").mkdir(parents=True, exist_ok=True)
    (PUBLIC / "ui").mkdir(parents=True, exist_ok=True)
    for terrain, folder in TERRAIN_DIRS.items():
        for variant, pick in enumerate(SELECTION["terrain"][terrain]):
            # 编号可以写成 "t-mine2:5" 表示另一个文件夹里的候选
            source, index = (pick.split(":")[0], int(pick.split(":")[1])) if isinstance(pick, str) else (folder, pick)
            image = candidate(source, index)
            if terrain == "M" and image.getpixel((0, 0))[:3] == (171, 171, 171):
                image = fill_background(image, ROCK)
            image.save(PUBLIC / "terrain" / f"{terrain}-{variant}.png")
            half(image).save(PUBLIC / "terrain16" / f"{terrain}-{variant}.png")
    castle = fill_background(candidate("castle", SELECTION["castle"]), LAWN)
    king = trim_center(candidate("king", SELECTION["king"]))
    for name, target in COLORS.items():
        tinted = recolor(castle, target)
        tinted.save(PUBLIC / "terrain" / f"castle-{name}.png")
        half(tinted).save(PUBLIC / "terrain16" / f"castle-{name}.png")
        recolor(king, target).save(PUBLIC / "ui" / f"king-{name}.png")
    crown().save(PUBLIC / "ui" / "crown.png")
    for scene in ("night", "day"):
        source = OUT / f"scene-{scene}-s{SELECTION['scene'][scene]}.png"
        if source.exists():
            Image.open(source).convert("RGB").save(PUBLIC / "ui" / f"scene-{scene}.png")
        else:
            print("还没有", source.name)
    recolor(castle, COLORS["blue"]).resize((64, 64), Image.NEAREST).save(PUBLIC / "ui" / "icon.png")
    print("exported to", PUBLIC)


if __name__ == "__main__":
    main()
