"""把一个候选文件夹拼成总览图（每张放大 N 倍、标上编号），给自己看候选用。
用法：python art/contact.py out/r1/t-wheat [倍数] [每行几张]  → out/r1/t-wheat.sheet.png
"""
import pathlib, re, sys
from PIL import Image, ImageDraw

folder = pathlib.Path(sys.argv[1])
scale = int(sys.argv[2]) if len(sys.argv) > 2 else 3
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 16
def idx(p):
    m = re.search(r"-(\d+)\.png$", p.name)
    return int(m.group(1)) if m else 0
files = sorted([p for p in folder.glob("*.png")], key=idx)
first = Image.open(files[0])
w, h = first.size[0] * scale, first.size[1] * scale
pad, label = 6, 12
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (w + pad) + pad, rows * (h + pad + label) + pad), (40, 40, 40))
draw = ImageDraw.Draw(sheet)
for i, p in enumerate(files):
    im = Image.open(p).convert("RGBA")
    bg = Image.new("RGBA", im.size, (90, 90, 90, 255)); bg.alpha_composite(im)
    im = bg.resize((w, h), Image.NEAREST)
    x = pad + (i % cols) * (w + pad); y = pad + (i // cols) * (h + pad + label)
    sheet.paste(im, (x, y + label))
    draw.text((x, y), str(idx(p)), fill=(255, 255, 0))
out = folder.parent / f"{folder.name}.sheet.png"
sheet.save(out)
print(out, sheet.size)
