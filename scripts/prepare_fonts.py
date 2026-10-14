"""Fetch unmodified, redistributable Noto CJK SC fonts and their OFL license."""
from pathlib import Path
from urllib.request import urlretrieve
from concurrent.futures import ThreadPoolExecutor
import json
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
(root / 'public/fonts').mkdir(parents=True, exist_ok=True)
(root / 'public/licenses').mkdir(parents=True, exist_ok=True)
items = [
    ('https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf', 'public/fonts/sans.otf'),
    ('https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf', 'public/fonts/sans-bold.otf'),
    ('https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/SubsetOTF/SC/NotoSerifSC-Regular.otf', 'public/fonts/serif.otf'),
    ('https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/SubsetOTF/SC/NotoSerifSC-Bold.otf', 'public/fonts/serif-bold.otf'),
    ('https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE', 'public/licenses/NotoSans-OFL.txt'),
    ('https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/LICENSE', 'public/licenses/NotoSerif-OFL.txt'),
]
def fetch(item):
    url, dest = item
    path = root / dest
    if not path.exists(): urlretrieve(url, path)
    print(dest, path.stat().st_size, flush=True)
with ThreadPoolExecutor(max_workers=4) as pool: list(pool.map(fetch, items))
coverage = {}
for family in ('sans', 'serif'):
    coverage[family] = sorted(TTFont(root / f'public/fonts/{family}.otf').getBestCmap())
(root / 'public/fonts/coverage.json').write_text(json.dumps(coverage), encoding='utf-8')
