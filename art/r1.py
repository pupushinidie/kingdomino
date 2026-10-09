"""多米诺王国美术第一轮。结果在 out/r1/（不进仓库）。

- 6 种地形格：/generate-image-v2，32×32，一次 64 个候选。俯视、SNES 时代 RPG 大地图风格。
  皇冠不让模型画（数量要准），网页里用代码画的像素皇冠叠上去。
- 城堡格：/generate-image-v2 32×32；红屋顶红旗，之后按色相蒙版换成粉 / 黄 / 绿 / 蓝。
- 国王棋子：/generate-image-v2 32×32 透明底；红袍，同样换色。
- 场景（牌桌背景、首页主图）：/create-image-pixen 512×288，夜间、白天各 4 个种子。
PixelLab 同一时间只跑一个任务，按顺序来。

用法：python art/r1.py [名字 ...]（不写就全跑；已经出过的跳过）
"""
from __future__ import annotations

import sys

import pixellab

OUT = pixellab.ART / "out" / "r1"

TILE = (
    "top-down pixel art terrain tile for a fantasy kingdom map, {}, the scene fills the entire square edge to edge, "
    "16-bit SNES JRPG overworld style, rich colors, clean pixels, no border, no frame, no text, no people"
)

SPRITES: dict[str, tuple[str, int, int, bool]] = {
    "t-wheat": (TILE.format("a golden wheat field with neat rows of ripe wheat stalks"), 32, 32, False),
    "t-forest": (TILE.format("a dense green pine and oak forest, round tree crowns seen from above"), 32, 32, False),
    "t-lake": (TILE.format("clear blue lake water with gentle ripples and a few green lily pads"), 32, 32, False),
    "t-grass": (TILE.format("a bright green meadow pasture with grass tufts, tiny white flowers and one fluffy white sheep"), 32, 32, False),
    "t-swamp": (TILE.format("a murky swamp marsh, dark olive water, brown reeds and cattails, small mud islands"), 32, 32, False),
    "t-mine": (TILE.format("a dark grey rocky mountain with a small mine entrance supported by wooden beams"), 32, 32, False),
    # 第一版矿山是正面看的山、背后是灰色天空，不像俯视的地块；补一版俯视的岩石山地
    "t-mine2": (TILE.format("rugged grey rocky mountains and boulders seen from above covering the whole tile, a small dark mine entrance with wooden beams and a little mine cart track, no sky"), 32, 32, False),
    # 第一版草地每张都有一只羊，补一版没有动物的，混着用
    "t-grass2": (TILE.format("a bright green meadow pasture with tall grass tufts and a few tiny white and yellow flowers, no animals"), 32, 32, False),
    "castle": (
        "pixel art game tile, a small medieval stone castle keep with a bright red pointed roof and a red pennant flag, "
        "three-quarter top-down view, standing on a small green lawn that fills the square, 16-bit fantasy RPG style, no text",
        32,
        32,
        False,
    ),
    "king": (
        "pixel art board game piece, a small chubby king figurine wearing a golden crown and a bright red royal robe with white fur trim, "
        "front view, full body, bold dark outline, 16-bit style",
        32,
        32,
        True,
    ),
}

SCENES: dict[str, tuple[str, tuple[int, ...]]] = {
    "scene-night": (
        "a medieval fantasy kingdom at night seen from a castle balcony: patchwork of wheat fields, forests, lakes, meadows, swamps "
        "and rocky mountains under a starry sky and a full moon, warm torch light on stone battlements in the foreground, "
        "cozy, no people, no text, wide view",
        (11, 12, 13, 14),
    ),
    "scene-day": (
        "a medieval fantasy kingdom on a sunny morning seen from a castle balcony: patchwork of golden wheat fields, green forests, "
        "blue lakes, meadows with sheep, swamps and grey mountains, colorful banners on stone battlements in the foreground, "
        "blue sky with white clouds, cheerful, no people, no text, wide view",
        (21, 22, 23, 24),
    ),
}


def sprite(name: str) -> None:
    prompt, width, height, transparent = SPRITES[name]
    folder = OUT / name
    if folder.exists() and any(folder.glob("*.png")):
        print(name, "已有，跳过", flush=True)
        return
    pixellab.generate_async(name, {
        "description": prompt,
        "image_size": {"width": width, "height": height},
        "no_background": transparent,
        "seed": 901,
    }, folder, endpoint="/generate-image-v2")


def scene(name: str) -> None:
    prompt, seeds = SCENES[name]
    for seed in seeds:
        target = f"{name}-s{seed}"
        if (OUT / f"{target}.png").exists():
            continue
        pixellab.generate_image(target, {
            "description": prompt,
            "image_size": {"width": 512, "height": 288},
            "detail": "highly detailed",
            "seed": seed,
        }, OUT, endpoint="/create-image-pixen")
        print(target, "ok; spent", round(pixellab.spent_usd(), 4), flush=True)


if __name__ == "__main__":
    names = sys.argv[1:] or [*SPRITES, *SCENES]
    for name in names:
        try:
            if name in SPRITES:
                sprite(name)
            else:
                scene(name)
        except Exception as error:  # 一项失败不影响后面的
            print(name, "失败：", error, flush=True)
            continue
        print(name, "done; spent", round(pixellab.spent_usd(), 4), flush=True)
