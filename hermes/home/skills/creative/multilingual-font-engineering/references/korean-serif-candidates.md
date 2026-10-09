# Korean serif (batang/myeongjo) candidates for Latin e-reader serif pairing

Measured with `scripts/measure_hangul.py` (Regular, em-normalised; V = stem of ㅣ, H = horizontal stroke of ㅡ, H/V = flatness; compat-jamo approximation). Reference Latin: Libron Regular stem 0.103em, hairline/stem 0.72, x-height 0.531em (Newsreader opsz9 w450: stem 0.106, x-height 0.492, hairline/stem 0.65).

- Noto Serif KR / Source Han Serif K: OFL, variable wght, sources public, ~24MB variable file. w400 V0.071 H0.044 H/V0.62; w500 V0.084 H0.050. Hangul face ~0.89em. Thin horizontals, risky for 2-bit e-ink.
- Hahmlet (Hypertype): OFL, variable wght 100-900, Glyphs source on GitHub. w400 V0.080 H0.067; w500 V0.100 H0.075 (stem close to Libron). Display-leaning design, less neutral.
- Gowun Batang: OFL, static, Glyphs source (ufo2ft build). V0.057 H0.037: too light.
- Nanum Myeongjo: OFL, static. V0.066 H0.034: too light, high contrast.
- Maru Buri (Naver, 5 weights, static): OFL, screen-body batang. V0.069 H0.050 H/V0.72 (same flatness as Libron, needs more weight). Files: github.com/fonts-archive/MaruBuri.
- RIDIBatang (Ridibooks, e-book font): OFL, free to modify/redistribute, no selling the font itself. V0.081 H0.067 H/V0.83: thick horizontals, good for e-ink. Official download location unclear; github.com/mcnorton/ridibatang-9 hosts tracking-adjusted variants (-5/-7/-9) and a Literata-Latin + Source Han hanja merge (RIDIBatangLSHSans, ~16.8MB TTF) by a community author.
- KoPub Batang: made for e-books but modification is prohibited: not usable as a base.

No official Korean companion was found for Newsreader, Readerly, Libron, Bookerly or Literata. Kindle's default Korean fonts are reportedly Source Han Sans/Serif (user blog, unverified).

Open caveats: CFF `.otf` sources (RIDIBatang, Maru Buri OTF) need cu2qu conversion for TTF-only pipelines (Kobo KF); Kobo/CrossPoint file-size limits for full Hangul were not verified.
