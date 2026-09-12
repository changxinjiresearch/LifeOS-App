from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

required = ['function chooseDecision(', 'function calendarEntries()', 'id="pickAlternative"']
missing = [x for x in required if x not in s]
if missing:
    raise SystemExit('Phase B UI contract missing: ' + ', '.join(missing))

replacement = "function currentActionInfo(p){const ms=p.milestones||[],active=ms.filter(m=>m.status==='active'),planned=ms.filter(m=>m.status==='planned');if(p.status==='waiting')return{label:'等待中',text:p.next_action||'等待外部事项推进'};if(p.status==='blocked')return{label:'阻塞',text:p.next_action||'等待解除阻塞条件'};if(p.status==='completed'||p.status==='done')return{label:'已完成',text:'当前项目已完成'};if(p.status==='planned')return{label:'尚未开始',text:p.next_action||planned[0]?.name||'等待开始'};if(active.length)return{label:'现在要做',text:active.map(m=>m.name).join(' · ')};return{label:'现在要做',text:p.next_action||planned[0]?.name||'尚未设置当前动作'}}"
lines = s.splitlines()
out = []
seen = False
for line in lines:
    if line.startswith('function currentActionInfo(p){'):
        out.append(replacement)
        seen = True
    else:
        out.append(line)
if not seen:
    raise SystemExit('currentActionInfo anchor missing')
s = '\n'.join(out) + '\n'
marker = '<!-- NEXTPLAN_PHASE_B_V1 -->'
if marker not in s:
    s = s.replace('<head>', '<head>\n' + marker, 1)
p.write_text(s, encoding='utf-8')
print('Phase B UI contract verified; blocked-state presentation normalized; patch is idempotent.')
