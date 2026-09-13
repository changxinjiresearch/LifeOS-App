from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

# NextPlan language contract:
# - Product chrome / system-generated UI is English.
# - User-originated content loaded from state remains untouched and may be any language.
# - Canonical/internal category keys stay unchanged for backward compatibility; only display labels are translated.

static_replacements = {
    '<html lang="zh-CN">': '<html lang="en">',
    'aria-label="主导航"': 'aria-label="Primary navigation"',
    'aria-label="菜单"': 'aria-label="Menu"',
    'aria-label="搜索"': 'aria-label="Search"',
    'aria-label="上个月"': 'aria-label="Previous month"',
    'aria-label="下个月"': 'aria-label="Next month"',
    '跨领域总控台 · Keep going, step by step.': 'Your personal progress dashboard · Keep going, step by step.',
    '当前所有主要项目，一眼看到进度与当前动作。': 'All your major projects at a glance, with progress and current actions.',
    '长期目标、状态、里程碑与当前动作。': 'Long-term goals, status, milestones, and current actions.',
    '<option value="全部">全部领域</option>': '<option value="全部">All Areas</option>',
    '<option value="全部">全部状态</option>': '<option value="全部">All Statuses</option>',
    '<option value="active">进行中</option>': '<option value="active">In Progress</option>',
    '<option value="waiting">等待中</option>': '<option value="waiting">Waiting</option>',
    '<option value="planned">计划中</option>': '<option value="planned">Planned</option>',
    '<option value="blocked">阻塞</option>': '<option value="blocked">Blocked</option>',
    '<option value="done">已完成</option>': '<option value="done">Completed</option>',
    '只展示当前可以实际推进的动作；Waiting 不会占用你的注意力。': 'Only shows actions you can move forward now. Waiting items stay out of your attention.',
    '只展示已经确认过的日期，不用示例日期制造假紧迫感。': 'Only confirmed dates are shown, so the calendar never creates false urgency.',
    '过去 7 天的推进、停滞、等待和未来 14 天的时间压力。': 'Review movement, stalled work, waiting items, and time pressure across the past 7 days and next 14 days.',
    '基于确认过的 NextPlan 状态生成可解释计划；建议不会自动改写项目事实。': 'Builds explainable plans from confirmed NextPlan state. Recommendations never rewrite project facts automatically.',
    '后台自动检查逾期、准备窗口、停滞、Waiting follow-up 和结构性问题；默认只提醒，不擅自改项目。': 'Checks overdue items, preparation windows, stalled work, waiting follow-ups, and structural issues. By default, it recommends rather than rewrites.',
    'Idea ≠ Task。对话里值得保留但尚未进入执行的想法，可以放在这里。': 'Idea ≠ Task. Keep useful conversation ideas here before they become executable work.',
    '重要材料和入口的索引，不把敏感文件本体塞进 NextPlan。': 'An index of important materials and entry points without copying sensitive file contents into NextPlan.',
    '不是 KPI，而是回答“系统有没有向前走，以及哪里开始失去控制”。': 'Not a KPI board. It answers whether the system is moving forward and where control is starting to slip.',
    '你的读取 Token 仍然只保存在本机。UI 更新不会清除它。': 'Your read token stays on this device. UI updates will not remove it.',
    'NextPlan 根据重要性、时间、准备窗口与可执行性动态推荐一个当前动作。': 'NextPlan recommends one current action based on priority, timing, preparation windows, and executability.',
}
for old, new in static_replacements.items():
    s = s.replace(old, new)

old_labels = "function statusLabel(s){return ({active:'进行中',waiting:'等待中',planned:'计划中',completed:'已完成',done:'已完成',blocked:'阻塞'})[s]||s}function priorityLabel(n){return n===3?'高优先级':n===2?'中优先级':'低优先级'}"
new_labels = "function statusLabel(s){return ({active:'In Progress',waiting:'Waiting',planned:'Planned',completed:'Completed',done:'Completed',blocked:'Blocked'})[s]||s}function priorityLabel(n){return n===3?'High Priority':n===2?'Medium Priority':'Low Priority'}function categoryLabel(c){return ({'科研':'Research','PhD':'PhD','学校':'School','课程':'Coursework','行政':'Life & Admin','其他':'Other'})[c]||c}"
if old_labels in s:
    s = s.replace(old_labels, new_labels, 1)
elif 'function categoryLabel(c)' not in s:
    raise SystemExit('Could not install English status/priority/category display labels')

old_action = "function currentActionInfo(p){const ms=p.milestones||[],active=ms.filter(m=>m.status==='active'),planned=ms.filter(m=>m.status==='planned');if(p.status==='waiting')return{label:'等待中',text:p.next_action||'等待外部事项推进'};if(p.status==='blocked')return{label:'阻塞',text:p.next_action||'等待解除阻塞条件'};if(p.status==='completed'||p.status==='done')return{label:'已完成',text:'当前项目已完成'};if(p.status==='planned')return{label:'尚未开始',text:p.next_action||planned[0]?.name||'等待开始'};if(active.length)return{label:'现在要做',text:active.map(m=>m.name).join(' · ')};return{label:'现在要做',text:p.next_action||planned[0]?.name||'尚未设置当前动作'}}"
new_action = "function currentActionInfo(p){const ms=p.milestones||[],active=ms.filter(m=>m.status==='active'),planned=ms.filter(m=>m.status==='planned');if(p.status==='waiting')return{label:'Waiting',text:p.next_action||'Waiting for external input'};if(p.status==='blocked')return{label:'Blocked',text:p.next_action||'Waiting for the blocker to be resolved'};if(p.status==='completed'||p.status==='done')return{label:'Completed',text:'Project completed'};if(p.status==='planned')return{label:'Planned',text:p.next_action||planned[0]?.name||'Waiting to start'};if(active.length)return{label:'Current Action',text:active.map(m=>m.name).join(' · ')};return{label:'Current Action',text:p.next_action||planned[0]?.name||'No current action set'}}"
if old_action in s:
    s = s.replace(old_action, new_action, 1)
elif new_action not in s:
    raise SystemExit('Could not install English current-action labels')

# Known system taxonomy values are internal data keys. Display them in English without touching user content.
s = s.replace('${esc(p.category)} · ${priorityLabel(p.priority)} · ${statusLabel(p.status)}', '${esc(categoryLabel(p.category))} · ${priorityLabel(p.priority)} · ${statusLabel(p.status)}')
s = s.replace('${esc(p.category)} · ${priorityLabel(p.priority)}</div></div>', '${esc(categoryLabel(p.category))} · ${priorityLabel(p.priority)}</div></div>')
s = s.replace('<span>${esc(c)}</span><div class="area-track">', '<span>${esc(categoryLabel(c))}</span><div class="area-track">')
s = s.replace("meta=[n.category||'Note',p?.name", "meta=[categoryLabel(n.category)||'Note',p?.name")

# System punctuation / empty states. User-provided project, milestone, action, note and resource text is not modified.
s = s.replace('${esc(action.label)}：</b>${esc(action.text)}', '${esc(action.label)}: </b>${esc(action.text)}')
s = s.replace('<b>Why this?</b>${esc(t.why)}', '<b>Why this?:</b> ${esc(t.why)}')
s = s.replace('<b>Current action</b>${esc(p.next_action||t.name)}', '<b>Current action:</b> ${esc(p.next_action||t.name)}')
s = s.replace('<div class="empty-state"><b>没有符合条件的项目</b>换一个筛选条件即可。</div>', '<div class="empty-state"><b>No projects match these filters</b>Try a different filter.</div>')
s = s.replace('<div class="card empty-state"><b>现在没有可执行任务</b>如果其他项目都在 Waiting，今天可以安心停下来。</div>', '<div class="card empty-state"><b>No actionable tasks right now</b>If everything else is Waiting, you can stop for today.</div>')
s = s.replace('<b>暂无日历事项</b>确认过的 meeting、presentation 与 deadline 会显示在这里。', '<b>No calendar items yet</b>Confirmed meetings, presentations, and deadlines will appear here.')
s = s.replace('<b>还没有 Notes</b>明确说“把这个想法记下来作为笔记”，NextPlan 会保存为信息，而不是任务。', '<b>No Notes yet</b>Ask ChatGPT to save an idea as a note. NextPlan will keep it as information, not a task.')
s = s.replace('<b>还没有资源索引</b>明确说“把这个链接保存为资源”，NextPlan 会保存安全指针，不复制敏感文件内容。', '<b>No resources indexed yet</b>Ask ChatGPT to save a link as a resource. NextPlan stores a safe pointer without copying sensitive file contents.')
s = s.replace('<b>现在没有必须推进的主动事项</b>Waiting / blocked 项目已经自动排除。', '<b>No active work needs to move right now</b>Waiting and blocked projects are intentionally excluded.')

# The recommendation score is an internal ranking signal, not user-facing progress.
# Never show the raw numeric score in the Do this now card.
s = s.replace('<div class="pc-pct">${Math.round(t.score)}</div>', '')

# Search/index display should use English system taxonomy while preserving user titles/descriptions.
s = s.replace("area:p.category,project:p.name", "area:categoryLabel(p.category),project:p.name")
s = s.replace("area:d.category||'',project:projectById(d.project_id)?.name||''", "area:categoryLabel(d.category)||'',project:projectById(d.project_id)?.name||''")
s = s.replace("area:e.category||'',project:projectById(e.project_id)?.name||''", "area:categoryLabel(e.category)||'',project:projectById(e.project_id)?.name||''")

# Contract guard: these are system-owned Chinese UI phrases and must never survive a maintained build.
forbidden = [
    '跨领域总控台', '当前所有主要项目', '长期目标、状态、里程碑与当前动作',
    '只展示当前可以实际推进的动作', '只展示已经确认过的日期', '过去 7 天的推进',
    '基于确认过的 NextPlan 状态生成可解释计划', '后台自动检查逾期',
    '对话里值得保留但尚未进入执行的想法', '重要材料和入口的索引',
    '不是 KPI，而是回答', '你的读取 Token 仍然只保存在本机',
    'NextPlan 根据重要性', '没有符合条件的项目', '现在没有可执行任务',
    '暂无日历事项', '还没有 Notes', '还没有资源索引', '现在没有必须推进的主动事项',
    "active:'进行中'", "n===3?'高优先级'", "label:'现在要做'",
]
remaining = [x for x in forbidden if x in s]
if remaining:
    raise SystemExit('English UI contract failed; untranslated system strings remain: ' + ' | '.join(remaining))

if '<div class="pc-pct">${Math.round(t.score)}</div>' in s:
    raise SystemExit('UI contract failed; internal recommendation score is still visible')

p.write_text(s, encoding='utf-8')
print('English UI contract enforced. User-originated state content remains untouched; internal recommendation score stays hidden.')
