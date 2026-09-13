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

# Small layout corrections requested after Apple UI rollout.
# These intentionally change layout only; the Apple visual language remains intact.
layout_fix = '''
/* NEXTPLAN APPLE LAYOUT FIX v2 */
.hero:before{display:none!important}
#view-projects .list-card{
  display:block!important;
  padding:0!important;
  overflow:hidden!important;
  background:var(--apple-panel)!important;
  border:1px solid var(--apple-border)!important;
  border-radius:19px!important;
  box-shadow:var(--apple-shadow)!important;
  backdrop-filter:blur(26px) saturate(145%)!important;
  -webkit-backdrop-filter:blur(26px) saturate(145%)!important;
}
#view-projects .list-row{
  position:static!important;
  min-height:0!important;
  padding:15px 17px!important;
  border:0!important;
  border-top:1px solid rgba(91,104,122,.08)!important;
  border-radius:0!important;
  background:transparent!important;
  box-shadow:none!important;
  display:flex!important;
  gap:14px!important;
  align-items:flex-start!important;
  align-content:normal!important;
  backdrop-filter:none!important;
  -webkit-backdrop-filter:none!important;
}
#view-projects .list-row:first-child{border-top:0!important}
#view-projects .list-meta{margin-left:auto!important;text-align:right!important}
.task-check{align-self:center!important}
'''
if '/* NEXTPLAN APPLE LAYOUT FIX v2 */' not in s:
    s = s.replace('</style>', layout_fix + '\n</style>', 1)

# Normalize the three user-reported icon issues.
old_progress = '<div class="stat-icon si-green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a9 9 0 1 1-6.4 2.7"/><path d="M3 3v6h6"/></svg></div>'
new_progress = '<div class="stat-icon si-green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="m10 8 6 4-6 4z" fill="currentColor" stroke="none"/></svg></div>'
s = s.replace(old_progress, new_progress)

settings_svg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.75v2.1m0 14.3v2.1M2.75 12h2.1m14.3 0h2.1M5.45 5.45l1.48 1.48m10.14 10.14 1.48 1.48M18.55 5.45l-1.48 1.48M6.93 17.07l-1.48 1.48"/><circle cx="12" cy="12" r="3.75"/></svg>'
s = re.sub(r'(<button class="settings-btn" id="settingsNav">)<svg.*?</svg>(Settings</button>)', lambda m: m.group(1) + settings_svg + m.group(2), s, count=1)

old_resource_icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8.5 13.5 6 16a4 4 0 1 0 5.7 5.6l3-3"/><path d="m15.5 10.5 2.5-2.5a4 4 0 1 0-5.7-5.6l-3 3"/><path d="m9 15 6-6"/></svg>'
new_resource_icon = '<svg class="empty-resource-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 14.5 8 16a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0"/><path d="m14.5 9.5 1.5-1.5a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0"/><path d="m9 15 6-6"/></svg>'
s = s.replace(old_resource_icon, new_resource_icon)

icon_css_marker = '/* NEXTPLAN ICON FIX v1 */'
if icon_css_marker not in s:
    icon_css = '''
/* NEXTPLAN ICON FIX v1 */
.settings-btn svg{width:20px!important;height:20px!important;flex:0 0 20px!important;stroke-width:1.9!important}
.empty-resource-icon{width:28px!important;height:28px!important;color:#96a2b3!important;margin:0 auto 10px!important}
'''
    s = s.replace('</style>', icon_css + '\n</style>', 1)

p.write_text(s, encoding='utf-8')
print('Phase B UI contract verified; Apple theme retained; layout fixes retained; three reported icons normalized.')
