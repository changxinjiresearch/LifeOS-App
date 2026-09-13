from pathlib import Path
import re

p = Path('index.html')
s = p.read_text(encoding='utf-8')

required = ['function chooseDecision(', 'function calendarEntries()', 'id="pickAlternative"']
missing = [x for x in required if x not in s]
if missing:
    raise SystemExit('Phase B UI contract missing: ' + ', '.join(missing))

replacement = "function currentActionInfo(p){const ms=p.milestones||[],active=ms.filter(m=>m.status==='active'),planned=ms.filter(m=>m.status==='planned');if(p.status==='waiting')return{label:'等待中',text:p.next_action||'等待外部事项推进'};if(p.status==='blocked')return{label:'阻塞',text:p.next_action||'等待解除阻塞条件'};if(p.status==='completed'||p.status==='done')return{label:'已完成',text:'当前项目已完成'};if(p.status==='planned')return{label:'尚未开始',text:p.next_action||planned[0]?.name||'等待开始'};if(active.length)return{label:'现在要做',text:active.map(m=>m.name).join(' · ')};return{label:'现在要做',text:p.next_action||planned[0]?.name||'尚未设置当前动作'}}"
managed = {
    'parseLocalDate', 'confirmedDeadlines', 'calendarEntries',
    'deadlineUrgency', 'preparationBonus', 'activityBonuses',
    'decisionSchedule', 'decisionCandidates', 'chooseDecision', 'actionableTasks'
}
lines = s.splitlines()
out = []
seen_funcs = set()
seen_action = False
for line in lines:
    if line.startswith('function currentActionInfo(p){'):
        out.append(replacement)
        seen_action = True
        continue
    m = re.match(r'^function\s+([A-Za-z0-9_]+)\(', line)
    if m and m.group(1) in managed:
        name = m.group(1)
        if name in seen_funcs:
            continue
        seen_funcs.add(name)
    out.append(line)
if not seen_action:
    raise SystemExit('currentActionInfo anchor missing')
s = '\n'.join(out) + '\n'
# Normalize accidental duplicate EMPTY keys from earlier one-time Phase B patch runs.
s = s.replace('deadlines:[],calendar_events:[],calendar_events:[]', 'deadlines:[],calendar_events:[]')
marker = '<!-- NEXTPLAN_PHASE_B_V1 -->'
if marker not in s:
    s = s.replace('<head>', '<head>\n' + marker, 1)

# Web-only Apple visual layer. Keep this explicit stylesheet link in the canonical page
# so first-load users receive the redesign without waiting for a service-worker refresh.
apple_style = '<link rel="stylesheet" href="./apple-web-v1.css?v=apple-web-v1">'
if apple_style not in s:
    s = s.replace('<title>NextPlan</title>', apple_style + '\n<title>NextPlan</title>', 1)

p.write_text(s, encoding='utf-8')
print('Phase B UI contract verified; duplicate helpers removed; blocked-state presentation normalized; Apple web theme linked.')
