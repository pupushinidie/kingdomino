"""多米诺王国 · 第一轮选图画廊。python art/gallery_r1.py 生成 art/out/gallery/（可以反复运行）。
本地查看：python -m http.server 8770 --directory art/out/gallery，然后打开 http://localhost:8770/gallery.html
页面（gallery.html，和斗地主同一个模板）：选择存 localStorage，每 30 秒重读 gallery.json，底部汇总成一段可复制的文字。
"""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

from PIL import Image, ImageDraw

import export
import pixellab

ART = Path(__file__).resolve().parent
OUT = ART / "out" / "gallery"
R1 = ART / "out" / "r1"
COVERS = Path.home() / "projects/game-center/art/out/covers"
SELECTION = json.loads((ART / "selection.json").read_text())

TERRAINS = [
    ("W", "麦田", "t-wheat"),
    ("F", "森林", "t-forest"),
    ("L", "湖泊", "t-lake"),
    ("G", "草地", "t-grass"),
    ("S", "沼泽", "t-swamp"),
    ("M", "矿山", "t-mine"),
]


def tile(pick) -> Image.Image:
    folder, index = (pick.split(":")[0], int(pick.split(":")[1])) if isinstance(pick, str) else (None, pick)
    return folder, index


def load(terrain: str, folder: str, pick) -> Image.Image:
    source, index = (pick.split(":")[0], int(pick.split(":")[1])) if isinstance(pick, str) else (folder, pick)
    image = export.candidate(source, index)
    if terrain == "M" and image.getpixel((0, 0))[:3] == (171, 171, 171):
        image = export.fill_background(image, export.ROCK)
    return export.strip_ring(image)


def patch(terrain: str, folder: str, picks: list, name: str) -> str:
    """一片 4×3 的同种地形（按网页里挑变体的办法交替），放大 2 倍：看连成一片的样子。"""
    images = [load(terrain, folder, pick) for pick in picks]
    canvas = Image.new("RGBA", (4 * 32, 3 * 32))
    for y in range(3):
        for x in range(4):
            canvas.alpha_composite(images[(x * 7 + y * 3) % len(images)], (x * 32, y * 32))
    canvas = canvas.resize((canvas.width * 2, canvas.height * 2), Image.NEAREST)
    target = OUT / "terrain" / f"{name}.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target)
    return target.relative_to(OUT).as_posix()


def numbered_sheet(folder: str, scale: int = 2) -> str:
    files = sorted((R1 / folder).glob("*.png"), key=lambda p: 0 if p.stem == folder else int(p.stem.split("-")[-1]))
    cell = 32 * scale
    cols = 16
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cell + 6) + 6, rows * (cell + 18) + 6), (40, 40, 40))
    draw = ImageDraw.Draw(sheet)
    for i, path in enumerate(files):
        number = 0 if path.stem == folder else int(path.stem.split("-")[-1])
        image = Image.open(path).convert("RGBA").resize((cell, cell), Image.NEAREST)
        x = 6 + (i % cols) * (cell + 6)
        y = 6 + (i // cols) * (cell + 18)
        sheet.paste(image, (x, y + 12), image)
        draw.text((x, y), str(number), fill=(255, 220, 0))
    target = OUT / "sheets" / f"{folder}.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target)
    return target.relative_to(OUT).as_posix()


def copy_in(path: Path, folder: str, scale: int = 1) -> str:
    target = OUT / folder / path.name
    target.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(path)
    if scale != 1:
        image = image.resize((image.width * scale, image.height * scale), Image.NEAREST)
    image.save(target)
    return target.relative_to(OUT).as_posix()


def four_colors(kind: str, index: int) -> str:
    """城堡格或国王换成粉黄绿蓝四色，放大 3 倍排一行。"""
    if kind == "castle":
        base = export.strip_ring(export.fill_background(export.candidate("castle", index), export.LAWN))
    else:
        base = export.trim_center(export.candidate("king", index))
    strip = Image.new("RGBA", (4 * 36 - 4, 32), (0, 0, 0, 0))
    for i, target in enumerate(export.COLORS.values()):
        strip.alpha_composite(export.recolor(base, target), (i * 36, 0))
    strip = strip.resize((strip.width * 3, strip.height * 3), Image.NEAREST)
    out = OUT / kind / f"{kind}-{index}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    strip.save(out)
    return out.relative_to(OUT).as_posix()


def item(item_id: str, title: str, note: str, sources: list[tuple[str, str, str]], recommended: str | None, **extra) -> dict:
    return {
        "id": item_id, "title": title, "note": note, "kind": "image", **extra,
        "candidates": [{"id": cid, "src": src, "label": label, **({"recommended": True} if cid == recommended else {})} for cid, src, label in sources],
    }


# 每种地形三套（每套 3 张变体），A 是现在用的
ALTERNATIVES = {
    "W": [("A", SELECTION["terrain"]["W"], "竖排麦穗，三张交替（推荐）"), ("B", [1, 32, 47], "横排麦垄"), ("C", [38, 3, 9], "更满、更金")],
    "F": [("A", SELECTION["terrain"]["F"], "深绿松林（推荐，和草地分得清）"), ("B", [0, 9, 32], "圆树冠阔叶林"), ("C", [20, 0, 9], "松树和阔叶树混着")],
    "L": [("A", SELECTION["terrain"]["L"], "蓝色湖面、睡莲、波纹（推荐）"), ("B", [0, 4, 8], "睡莲多一点"), ("C", [11, 27, 38], "睡莲铺满")],
    "G": [("A", SELECTION["terrain"]["G"], "两张小花草地 + 一张有羊（推荐）"), ("B", [9, 26, 44], "每格都有一只羊"), ("C", ["t-grass2:3", "t-grass2:20", "t-grass2:32"], "没有羊，草丛和小花")],
    "S": [("A", SELECTION["terrain"]["S"], "香蒲、泥潭交替（推荐）"), ("B", [12, 13, 5], "全是香蒲芦苇"), ("C", [3, 18, 10], "泥滩水洼")],
    "M": [("A", SELECTION["terrain"]["M"], "俯视岩地 + 矿洞（推荐）"), ("B", ["t-mine2:0", "t-mine2:39", "t-mine2:56"], "矿洞多一点山"), ("C", [0, 3, 9], "第一版：正面看的山（灰天空换成了岩地）")],
}


def build() -> dict:
    items = []
    for terrain, name, folder in TERRAINS:
        sources = [(cid, patch(terrain, folder, picks, f"{terrain}-{cid}"), label) for cid, picks, label in ALTERNATIVES[terrain]]
        items.append(item(f"terrain-{terrain}", f"地形 · {name}（每种 3 张交替，图里是连成一片的样子）",
                          f"32×32 原图，牌桌上按 2–3 倍显示。全部 64 个候选见「{name}全部候选」，想换别的编号写在备注里，比如「8 24 47」。",
                          sources, "A", scale=1))
    for terrain, name, folder in TERRAINS:
        folders = [folder] + ([f"{folder}2"] if (R1 / f"{folder}2").exists() else [])
        for f in folders:
            items.append(item(f"all-{f}", f"{name}全部候选（{f}，带编号）", "只是参考，不用选。", [("all", numbered_sheet(f), "")], None, scale=1, wide=True))
    items.append(item("castle", "城堡格（按座位换成粉 / 黄 / 绿 / 蓝）",
                      "原图背后是灰色天空，导出时换成了草地。全部候选见「城堡全部候选」。",
                      [(f"c{i}", four_colors("castle", i), label) for i, label in
                       ((SELECTION["castle"], "沙岩城堡、尖顶旗子（推荐）"), (3, "圆一点的沙岩城堡"), (44, "方正的灰石城堡"), (14, "灰石城堡、宽一点"))],
                      f"c{SELECTION['castle']}", scale=1))
    items.append(item("king", "国王棋子（按座位换四色）",
                      "排里站在骨牌旁边、名牌前面都用它。全部候选见「国王全部候选」。",
                      [(f"k{i}", four_colors("king", i), label) for i, label in
                       ((SELECTION["king"], "白胡子、拿权杖（推荐）"), (17, "白胡子、圆脸"), (33, "胡子更长"), (48, "棕胡子"))],
                      f"k{SELECTION['king']}", scale=1))
    items.append(item("all-castle", "城堡全部候选（带编号）", "只是参考。", [("all", numbered_sheet("castle"), "")], None, scale=1, wide=True))
    items.append(item("all-king", "国王全部候选（带编号）", "只是参考。", [("all", numbered_sheet("king"), "")], None, scale=1, wide=True))
    night = SELECTION["scene"]["night"]
    day = SELECTION["scene"]["day"]
    items.append(item("scene-night", "牌桌背景 · 夜间（城堡阳台看王国）", "512×288，按整数倍放大铺满牌桌；首页主图也用它。",
                      [(f"s{s}", copy_in(R1 / f"scene-night-s{s}.png", "scenes"), label) for s, label in
                       ((night, "两边塔楼、月亮、拼布一样的田（推荐）"), (14, "火把、塔楼、月牙"), (12, "近处是城垛和城堡"), (13, "正中一支大火把"))],
                      f"s{night}", scale=1))
    items.append(item("scene-day", "牌桌背景 · 白天", "白天版用这张。s21 顶上一面旗像北欧国旗、s23 有红黄条纹的旗像西班牙国旗，没放进来。",
                      [(f"s{s}", copy_in(R1 / f"scene-day-s{s}.png", "scenes"), label) for s, label in
                       ((day, "石拱门框着、太阳、羊群和远处城堡（推荐）"), (24, "塔楼和彩旗"))],
                      f"s{day}", scale=1))
    covers = [(f"s{s}", f"kingdomino-s{s}.png") for s in (811, 812, 813) if (COVERS / f"kingdomino-s{s}.png").exists()]
    if covers:
        chosen = SELECTION.get("cover", covers[0][0])
        items.append(item("cover", "大厅卡片封面（384×192）", "和其他游戏的封面同一个画风。",
                          [(cid, copy_in(COVERS / name, "covers"), "") for cid, name in covers], chosen, scale=1))
    return {
        "round": "r1",
        "title": "多米诺王国 · 第一轮：地形、城堡、国王、场景、封面",
        "updated": time.strftime("%m-%d %H:%M"),
        "spent": pixellab.spent_usd(),
        "intro": ("多米诺王国已经能玩，美术先用我挑的（每项标「推荐」的就是现在用的）。皇冠是代码画的小图标（数量要准，不让模型画）。\n"
                  "每项点「选这张」，或者「都不满意，重画」并写备注。最后把页面底部那段文字复制给我。"),
        "preview": [],
        "items": items,
    }


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    data = build()
    shots = OUT / "shots"
    if shots.exists():
        data["preview"] = [{"src": f"shots/{p.name}", "caption": caption, **({"small": True} if p.name == "phone.png" else {})} for p, caption in [
            (shots / "table-night.png", "牌桌 · 夜间版（1440×790，4 人局）"),
            (shots / "table-day.png", "牌桌 · 白天版（1440×790）"),
            (shots / "final.png", "结算"),
            (shots / "phone.png", "手机（390×664）"),
            (shots / "home.png", "首页"),
        ] if p.exists()]
    (OUT / "gallery.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
    shutil.copyfile(ART / "gallery.html", OUT / "gallery.html")
    print("gallery ok, items", len(data["items"]), "spent", round(pixellab.spent_usd(), 4))
