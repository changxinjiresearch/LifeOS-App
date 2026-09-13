from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

# Internal decision scores are ranking signals only. They must never be user-facing.
s = s.replace('<div class="pc-pct">${Math.round(t.score)}</div>', '')
s = s.replace('<div class="plan-score">${Math.round(f.score)}</div>', '')

# The Web greeting should be generic and must not expose or hard-code a user name.
old_greeting = "function renderGreeting(){const h=new Date().getHours();$('greeting').textContent=(h<12?'Good morning':h<18?'Good afternoon':'Good evening')+', Changxin.'}"
new_greeting = "function renderGreeting(){const h=new Date().getHours();$('greeting').textContent=(h<12?'Good morning.':h<18?'Good afternoon.':'Good evening.')}"
s = s.replace(old_greeting, new_greeting)

forbidden = [
    '<div class="pc-pct">${Math.round(t.score)}</div>',
    '<div class="plan-score">${Math.round(f.score)}</div>',
    "+', Changxin.'}",
]
remaining = [x for x in forbidden if x in s]
if remaining:
    raise SystemExit('Web presentation contract failed: ' + ' | '.join(remaining))

p.write_text(s, encoding='utf-8')
print('Internal recommendation scores hidden and personalized greeting removed.')
