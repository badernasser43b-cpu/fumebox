"""Generates MOODBOX's illustrative product and box artwork as SVG files.
These are original placeholder illustrations; admins can replace any of them by
uploading a real product photo in the dashboard."""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "site" / "images"
INK = "#221C3A"
MOODS = {  # mood colour, light tint, mid tint
    "focus": ("#3D5AFE", "#E3E8FF", "#B9C5FF"),
    "relax": ("#A0618F", "#F4E6EF", "#DDB9D2"),
    "gaming": ("#10A374", "#DDF5EC", "#A6E3CC"),
    "travel": ("#E8A33D", "#FCEFD9", "#F5D29C"),
}

def frame(mood, body, size=320):
    m, t, mid = MOODS[mood]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="{size}" height="{size}">
<defs><radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="{t}"/></radialGradient></defs>
<rect width="320" height="320" fill="url(#g)"/>
<ellipse cx="160" cy="262" rx="96" ry="14" fill="{mid}" opacity=".7"/>
{body.replace("M_", m).replace("T_", t).replace("D_", mid).replace("I_", INK)}
</svg>'''

ITEMS = {
  # ---------------- Focus ----------------
  "journal": ("focus", '''<rect x="98" y="70" width="128" height="180" rx="10" fill="M_"/><rect x="98" y="70" width="18" height="180" rx="6" fill="I_" opacity=".25"/>
<rect x="132" y="104" width="70" height="40" rx="6" fill="#fff" opacity=".9"/><path d="M196 70v70l10-8 10 8V70" fill="#FFD166"/>
<g fill="#fff" opacity=".5">''' + "".join(f'<circle cx="{140+i*12}" cy="{170+j*14}" r="1.8"/>' for i in range(6) for j in range(4)) + "</g>"),
  "pens": ("focus", '''<g transform="rotate(-18 160 160)"><rect x="96" y="60" width="18" height="190" rx="9" fill="I_"/><path d="M96 250h18l-9 22z" fill="I_"/></g>
<g transform="rotate(-4 160 160)"><rect x="150" y="56" width="18" height="190" rx="9" fill="M_"/><path d="M150 246h18l-9 22z" fill="M_"/></g>
<g transform="rotate(12 160 160)"><rect x="204" y="62" width="18" height="190" rx="9" fill="#7A8194"/><path d="M204 252h18l-9 22z" fill="#7A8194"/></g>'''),
  "timer": ("focus", '''<circle cx="160" cy="160" r="88" fill="#fff" stroke="I_" stroke-width="8"/><path d="M160 160V86A74 74 0 0 1 224 197z" fill="M_"/>
<circle cx="160" cy="160" r="10" fill="I_"/><rect x="146" y="58" width="28" height="18" rx="5" fill="I_"/>'''),
  "highlighters": ("focus", "".join(f'<g transform="rotate({-20+i*8} 160 200)"><rect x="{88+i*26}" y="78" width="22" height="150" rx="6" fill="{c}"/><rect x="{88+i*26}" y="78" width="22" height="34" rx="6" fill="I_" opacity=".2"/></g>' for i, c in enumerate(["#FFB4C6", "#FFE08A", "#B8F0C9", "#A9D6FF", "#D9C2FF", "#FFC9A0"]))),
  "tea": ("focus", '''<rect x="96" y="92" width="128" height="158" rx="14" fill="M_"/><rect x="96" y="132" width="128" height="58" fill="#fff" opacity=".9"/>
<path d="M140 150c10-14 30-14 40 0-10 14-30 14-40 0z" fill="#3BA55C"/><path d="M160 92V60" stroke="I_" stroke-width="3"/><rect x="148" y="46" width="24" height="18" rx="3" fill="#FFD166"/>'''),
  "phone-stand": ("focus", '''<path d="M110 250l40-150h22l-30 150z" fill="#C89B6D"/><path d="M96 250h130v12H96z" fill="#A87C52"/>
<rect x="150" y="70" width="72" height="140" rx="12" fill="I_" transform="rotate(14 186 140)"/><rect x="158" y="82" width="56" height="112" rx="6" fill="M_" transform="rotate(14 186 140)"/>'''),
  # ---------------- Relax ----------------
  "candle": ("relax", '''<rect x="104" y="120" width="112" height="130" rx="18" fill="#fff" stroke="M_" stroke-width="6"/><rect x="104" y="160" width="112" height="46" fill="D_"/>
<path d="M160 120v-18" stroke="I_" stroke-width="3"/><path d="M160 64c14 16 14 28 0 38-14-10-14-22 0-38z" fill="#FFB84D"/><path d="M160 80c6 8 6 14 0 18-6-4-6-10 0-18z" fill="#FFE29A"/>'''),
  "sleep-mask": ("relax", '''<path d="M70 150c0-30 40-44 90-30 50-14 90 0 90 30 0 40-40 56-90 36-50 20-90 4-90-36z" fill="M_"/>
<path d="M112 160q18 14 36 0M172 160q18 14 36 0" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M70 150c-20 0-30 10-34 20M250 150c20 0 30 10 34 20" stroke="I_" stroke-width="5" fill="none"/>'''),
  "bath-salt": ("relax", '''<rect x="108" y="96" width="104" height="154" rx="22" fill="#fff" stroke="I_" stroke-width="6" opacity=".95"/><rect x="114" y="150" width="92" height="94" rx="16" fill="#F7B7C8"/>
<rect x="112" y="78" width="96" height="28" rx="8" fill="M_"/>''' + "".join(f'<circle cx="{126+(i*17)%80}" cy="{166+(i*23)%70}" r="4" fill="#fff" opacity=".8"/>' for i in range(14))),
  "tea-tin": ("relax", '''<rect x="104" y="96" width="112" height="154" rx="12" fill="M_"/><rect x="98" y="84" width="124" height="28" rx="8" fill="I_"/>
<circle cx="160" cy="176" r="34" fill="#fff"/><g fill="#F2C94C">''' + "".join(f'<ellipse cx="{160}" cy="{160}" rx="6" ry="14" transform="rotate({a} 160 176)"/>' for a in range(0, 360, 45)) + '</g><circle cx="160" cy="176" r="8" fill="#E0A100"/>'),
  "socks": ("relax", '''<path d="M110 70h50v110l36 30c16 14 6 44-18 40l-58-12c-14-3-22-14-20-28z" fill="M_"/><path d="M110 70h50v24h-50z" fill="#fff" opacity=".5"/>
<path d="M176 86h44v96l30 26c14 12 4 38-16 34l-50-10" fill="D_"/><path d="M176 86h44v22h-44z" fill="#fff" opacity=".6"/>'''),
  "diffuser": ("relax", '''<path d="M100 250c0-70 26-120 60-120s60 50 60 120z" fill="#fff" stroke="M_" stroke-width="6"/><ellipse cx="160" cy="250" rx="60" ry="10" fill="M_"/>
<path d="M150 120c-10-20 10-30 0-50M170 120c10-20-10-30 0-50" stroke="D_" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="160" cy="200" r="14" fill="#FFE29A"/>'''),
  # ---------------- Gaming ----------------
  "desk-mat": ("gaming", '''<rect x="52" y="120" width="216" height="104" rx="14" fill="I_"/><rect x="52" y="120" width="216" height="104" rx="14" fill="none" stroke="M_" stroke-width="6"/>
<rect x="84" y="140" width="104" height="44" rx="6" fill="#3a3158"/><rect x="206" y="150" width="30" height="46" rx="15" fill="#fff"/>'''),
  "headset-stand": ("gaming", '''<rect x="100" y="244" width="120" height="14" rx="6" fill="I_"/><rect x="152" y="120" width="16" height="126" fill="#9AA1AE"/>
<path d="M102 160c0-56 116-56 116 0" fill="none" stroke="I_" stroke-width="16" stroke-linecap="round"/><rect x="86" y="150" width="34" height="60" rx="14" fill="M_"/><rect x="200" y="150" width="34" height="60" rx="14" fill="M_"/>'''),
  "cables": ("gaming", '''<path d="M70 230c40-80 60 0 100-60s60 20 80-40" stroke="I_" stroke-width="10" fill="none" stroke-linecap="round"/>
<path d="M70 200c40-80 60 0 100-60s60 20 80-40" stroke="M_" stroke-width="10" fill="none" stroke-linecap="round"/>
<rect x="138" y="140" width="40" height="26" rx="6" fill="#FFD166" transform="rotate(-30 158 153)"/><rect x="204" y="96" width="34" height="22" rx="6" fill="#FFD166" transform="rotate(-45 221 107)"/>'''),
  "keycap-kit": ("gaming", '''<rect x="94" y="130" width="60" height="60" rx="10" fill="#fff" stroke="I_" stroke-width="5"/><rect x="164" y="130" width="60" height="60" rx="10" fill="M_" stroke="I_" stroke-width="5"/>
<path d="M126 100v-30M118 70h16" stroke="I_" stroke-width="5"/><rect x="104" y="206" width="112" height="18" rx="9" fill="D_"/><path d="M196 206v-30" stroke="#9AA1AE" stroke-width="10" stroke-linecap="round"/>'''),
  "light-bar": ("gaming", '''<rect x="72" y="150" width="176" height="96" rx="8" fill="I_"/><rect x="82" y="160" width="156" height="76" rx="4" fill="#3a3158"/>
<rect x="88" y="120" width="144" height="22" rx="11" fill="I_"/><path d="M100 146l-20 50h160l-20-50z" fill="#FFF3B0" opacity=".55"/><rect x="100" y="138" width="120" height="6" rx="3" fill="#FFF3B0"/>'''),
  "gloves": ("gaming", '''<path d="M110 250v-90c0-14 8-20 16-20h70c8 0 16 6 16 20v90z" fill="M_"/>''' + "".join(f'<rect x="{118+i*24}" y="96" width="18" height="56" rx="9" fill="M_"/><rect x="{118+i*24}" y="96" width="18" height="22" rx="9" fill="#F2C9A0"/>' for i in range(4)) + '<path d="M110 200h102" stroke="I_" stroke-width="6"/>'),
  # ---------------- Travel ----------------
  "packing-cubes": ("travel", '''<rect x="70" y="160" width="120" height="86" rx="12" fill="M_"/><rect x="150" y="120" width="104" height="76" rx="12" fill="I_"/><rect x="104" y="96" width="86" height="62" rx="12" fill="D_"/>
<path d="M80 172h100M160 132h84M114 108h66" stroke="#fff" stroke-width="4" stroke-dasharray="6 6"/>'''),
  "neck-pillow": ("travel", '''<path d="M160 80c-56 0-92 40-92 86 0 40 22 72 52 80l12-44c-14-6-22-20-22-36 0-24 22-44 50-44s50 20 50 44c0 16-8 30-22 36l12 44c30-8 52-40 52-80 0-46-36-86-92-86z" fill="M_"/>
<path d="M104 128c14-18 34-26 56-26" stroke="#fff" stroke-width="6" fill="none" opacity=".6" stroke-linecap="round"/>'''),
  "adapter": ("travel", '''<rect x="100" y="100" width="120" height="120" rx="20" fill="#fff" stroke="I_" stroke-width="6"/><rect x="100" y="180" width="120" height="40" rx="0" fill="M_"/>
<rect x="138" y="70" width="10" height="34" fill="#9AA1AE"/><rect x="172" y="70" width="10" height="34" fill="#9AA1AE"/><rect x="124" y="192" width="22" height="10" rx="3" fill="I_"/><rect x="174" y="192" width="22" height="10" rx="3" fill="I_"/><circle cx="160" cy="140" r="8" fill="I_"/>'''),
  "bottles": ("travel", "".join(f'<rect x="{80+i*42}" y="{130 - (i%2)*16}" width="34" height="{116 + (i%2)*16}" rx="12" fill="{c}"/><rect x="{86+i*42}" y="{112 - (i%2)*16}" width="22" height="22" rx="4" fill="I_"/>' for i, c in enumerate(["#E8A33D", "#7FC8F8", "#F7B7C8", "#B8F0C9"]))),
  "passport-wallet": ("travel", '''<rect x="92" y="76" width="136" height="180" rx="14" fill="I_"/><rect x="104" y="88" width="112" height="156" rx="8" fill="#3a3158"/>
<circle cx="160" cy="150" r="30" fill="none" stroke="M_" stroke-width="5"/><path d="M130 150h60M160 120c-14 18-14 42 0 60M160 120c14 18 14 42 0 60" stroke="M_" stroke-width="4" fill="none"/><rect x="128" y="200" width="64" height="10" rx="5" fill="M_"/>'''),
  "powerbank": ("travel", '''<rect x="110" y="70" width="100" height="180" rx="22" fill="I_"/><rect x="122" y="84" width="76" height="120" rx="12" fill="#3a3158"/>
<path d="M166 108l-22 34h16l-6 30 24-38h-16z" fill="M_"/><rect x="148" y="224" width="24" height="8" rx="4" fill="#9AA1AE"/>'''),
}

BOX_LID = {"focus": "#3D5AFE", "relax": "#A0618F", "gaming": "#10A374", "travel": "#E8A33D"}

def box_svg(mood, contents):
    m, t, mid = MOODS[mood] if mood in MOODS else ("#5B3FD9", "#E9E4FB", "#BDB0F0")
    # an open gift box with items peeking out, drawn on transparent background
    items = "".join(f'<g transform="translate({x} {y}) scale(.42)">{inner}</g>' for (x, y, inner) in contents)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400" width="500" height="400">
<ellipse cx="250" cy="372" rx="190" ry="20" fill="#000" opacity=".12"/>
{items}
<path d="M90 190h320l-22 172a14 14 0 0 1-14 12H126a14 14 0 0 1-14-12z" fill="#fff"/>
<path d="M90 190h320l-6 46H96z" fill="{INK}" opacity=".12"/>
<rect x="232" y="190" width="36" height="184" fill="{INK}"/>
<path d="M78 170h344v32H78z" fill="#fff"/><rect x="232" y="170" width="36" height="32" fill="{INK}"/>
<path d="M250 170c-30-56-96-46-70 0M250 170c30-56 96-46 70 0" fill="none" stroke="{INK}" stroke-width="14" stroke-linecap="round"/>
<rect x="150" y="290" width="64" height="8" rx="4" fill="{INK}" opacity=".12"/><rect x="286" y="290" width="64" height="8" rx="4" fill="{INK}" opacity=".12"/>
</svg>'''

def inner(name):
    mood, body = ITEMS[name]
    m, t, mid = MOODS[mood]
    return body.replace("M_", m).replace("T_", t).replace("D_", mid).replace("I_", INK)

BOX_CONTENTS = {
    "focus": ["journal", "timer", "pens"], "relax": ["candle", "diffuser", "tea-tin"],
    "gaming": ["headset-stand", "light-bar", "keycap-kit"], "travel": ["neck-pillow", "adapter", "bottles"],
}

def main():
    (OUT / "items").mkdir(parents=True, exist_ok=True)
    (OUT / "boxes").mkdir(parents=True, exist_ok=True)
    for name, (mood, body) in ITEMS.items():
        (OUT / "items" / f"{name}.svg").write_text(frame(mood, body))
    for mood, names in BOX_CONTENTS.items():
        pos = [(80, 40), (180, 10), (290, 44)]
        (OUT / "boxes" / f"{mood}.svg").write_text(box_svg(mood, [(x, y, inner(n)) for (x, y), n in zip(pos, names)]))
    (OUT / "boxes" / "custom.svg").write_text(box_svg("custom", [(80, 40, inner("candle")), (180, 10, inner("headset-stand")), (290, 44, inner("adapter"))]))
    (OUT / "items" / "placeholder.svg").write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><rect width="320" height="320" fill="#ECE8F5"/><rect x="110" y="140" width="100" height="80" rx="10" fill="#fff"/><path d="M104 124h112v22H104z" fill="#DCD7EA"/><rect x="152" y="124" width="16" height="96" fill="#221C3A" opacity=".2"/></svg>''')
    (OUT / "favicon.svg").write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="#221C3A"/><rect x="8" y="17" width="24" height="16" rx="3" fill="#fff"/><path d="M6 13h28v5H6z" fill="#BDB0F0"/><path d="M20 13v20" stroke="#5B3FD9" stroke-width="3"/><path d="M20 12c-3-5-9-4-6 0m6 0c3-5 9-4 6 0" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>''')
    print("items:", len(ITEMS), "boxes: 5")

if __name__ == "__main__":
    main()
