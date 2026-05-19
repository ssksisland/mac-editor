"""Generate a simple DMG background image for mac-editor.

Layout target (matches tauri.conf.json windowSize 660x400):
- Left: app icon dropzone hint at (180, 170)
- Right: Applications folder hint at (480, 170)
- Bottom: instructions about "已损坏" workaround
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

W, H = 660, 400
OUT = Path(__file__).parent / "dmg-background.png"
OUT_2X = Path(__file__).parent / "dmg-background@2x.png"


def find_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for p in candidates:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def draw(scale: int, out_path: Path):
    img = Image.new("RGB", (W * scale, H * scale), "#f7f7f9")
    d = ImageDraw.Draw(img)
    title_font = find_font(20 * scale)
    body_font = find_font(13 * scale)
    mono_font = find_font(12 * scale)

    # Title
    d.text((W * scale // 2, 30 * scale), "Mac Editor", font=title_font,
           fill="#1d1d1f", anchor="mm")
    d.text((W * scale // 2, 58 * scale), "将左侧图标拖到右侧 Applications 文件夹完成安装",
           font=body_font, fill="#3a3a3c", anchor="mm")

    # Arrow from app slot (180,170) to Applications slot (480,170)
    arrow_y = 170 * scale
    d.line([(245 * scale, arrow_y), (415 * scale, arrow_y)],
           fill="#a0a0a5", width=3 * scale)
    # arrow head
    d.polygon([
        (415 * scale, arrow_y),
        (400 * scale, arrow_y - 8 * scale),
        (400 * scale, arrow_y + 8 * scale),
    ], fill="#a0a0a5")

    # Bottom warning box
    box_top = 250 * scale
    box_bottom = 380 * scale
    d.rounded_rectangle(
        [(30 * scale, box_top), (W * scale - 30 * scale, box_bottom)],
        radius=10 * scale, fill="#fff8e1", outline="#f0c14b", width=1 * scale,
    )
    d.text((45 * scale, (box_top + 12 * scale)),
           "首次打开如提示\"已损坏，无法打开\"：", font=body_font, fill="#5d4500")
    d.text((45 * scale, (box_top + 36 * scale)),
           "打开「终端」(Terminal)，粘贴并执行：",
           font=body_font, fill="#5d4500")
    d.text((45 * scale, (box_top + 62 * scale)),
           "sudo xattr -rd com.apple.quarantine /Applications/mac-editor.app",
           font=mono_font, fill="#1d1d1f")
    d.text((45 * scale, (box_top + 90 * scale)),
           "执行后再次打开即可。这是因为应用未付费 Apple 公证，并非真的损坏。",
           font=body_font, fill="#5d4500")

    img.save(out_path)
    print(f"wrote {out_path} ({W * scale}x{H * scale})")


draw(1, OUT)
draw(2, OUT_2X)
