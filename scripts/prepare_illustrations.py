"""Turns the original illustrations in art/originals into the files the site serves.

Each picture is cropped for its place, saved as WebP at a few widths so phones download small files,
and listed in src/components/illustrationFiles.ts so the pages know the sizes. The link preview image
also gets the headline and name from config/app.json written on it.

Run: python3 scripts/prepare_illustrations.py
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
src = root / "art" / "originals"
out = root / "public" / "illustrations"
out.mkdir(parents=True, exist_ok=True)
app = json.loads((root / "config" / "app.json").read_text())

# name: (crop box or None, widths to serve)
plan = {
    "hero": ((600, 0, 1536, 1024), [480, 720, 936]),
    "auth_panel": ((0, 240, 1122, 1402), [480, 760, 1122]),
    "band_first_customer": ((150, 40, 1490, 1000), [480, 800, 1200]),
    "booking_confirmed": (None, [400, 640, 960]),
    "social_share": ((0, 40, 1672, 918), [640, 1200]),
}

manifest = {}
for name, (box, widths) in plan.items():
    im = Image.open(src / f"{name}.png").convert("RGB")
    if box:
        im = im.crop(box)
    w, h = im.size
    files = []
    for target in widths:
        target = min(target, w)
        size = (target, round(h * target / w))
        im.resize(size, Image.LANCZOS).save(out / f"{name}_{target}.webp", "WEBP", quality=82, method=6)
        files.append(target)
    manifest[name] = {"width": w, "height": h, "widths": sorted(set(files))}

# The link preview: the illustration with the headline in the empty left side.
og = Image.open(src / "social_share.png").convert("RGB").crop(plan["social_share"][0]).resize((1200, 630), Image.LANCZOS)
draw = ImageDraw.Draw(og)
fonts = Path("/usr/share/fonts/opentype/inter")
head = ImageFont.truetype(str(fonts / "InterDisplay-SemiBold.otf"), 54)
small = ImageFont.truetype(str(fonts / "Inter-Medium.otf"), 22)
words, lines, line = app["landing"]["headline"].split(), [], ""
for word in words:
    trial = f"{line} {word}".strip()
    if draw.textlength(trial, font=head) > 540 and line:
        lines.append(line)
        line = word
    else:
        line = trial
lines.append(line)
y = 630 - 70 - len(lines) * 64
# The name sits just above the headline, clear of the chat bubbles at the top.
draw.rectangle((64, y - 50, 82, y - 32), fill="#FF5A14")
draw.text((96, y - 54), app["name"].upper(), font=small, fill="#111111")
for text in lines:
    draw.text((64, y), text, font=head, fill="#111111")
    y += 64
og.save(out / "og.jpg", "JPEG", quality=86, optimize=True)

ts = "// Written by scripts/prepare_illustrations.py. Do not edit by hand.\n"
ts += f"export const illustrationFiles = {json.dumps(manifest, indent=2)} as const;\n"
ts += "export type IllustrationName = keyof typeof illustrationFiles;\n"
(root / "src" / "components" / "illustrationFiles.ts").write_text(ts)
print(json.dumps(manifest))
