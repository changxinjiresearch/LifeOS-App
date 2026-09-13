from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

# Internal decision scores are ranking signals only. They must never be user-facing.
s = s.replace('<div class="pc-pct">${Math.round(t.score)}</div>', '')
s = s.replace('<div class="plan-score">${Math.round(f.score)}</div>', '')

forbidden = [
    '<div class="pc-pct">${Math.round(t.score)}</div>',
    '<div class="plan-score">${Math.round(f.score)}</div>',
]
remaining = [x for x in forbidden if x in s]
if remaining:
    raise SystemExit('Internal score visibility contract failed: ' + ' | '.join(remaining))

p.write_text(s, encoding='utf-8')
print('Internal recommendation scores hidden from Do this now and AI Planning.')
