from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')
marker = '<!-- NEXTPLAN_PHASE_D_V1 -->'

required = [
    'data-view="planner"',
    'data-view="automation"',
    'id="view-planner"',
    'id="view-automation"',
    'function renderPlanner()',
    'function renderAutomation()',
    '>planner',
    '>automation',
]

if marker in s:
    missing = [x for x in required if x not in s]
    if missing:
        raise SystemExit('Phase D marker present but UI contract is incomplete: ' + ', '.join(missing))
    print('Phase D UI contract verified.')
    raise SystemExit(0)

s = s.replace('<!-- NEXTPLAN_PHASE_C_V1 -->', '<!-- NEXTPLAN_PHASE_C_V1 -->\n' + marker, 1)

nav_anchor = '    <button class="nav-btn" data-view="review"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5M8 17h7"/></svg>Weekly Review</button>'
nav_add = nav_anchor + '''\n    <button class="nav-btn" data-view="planner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 18 9 13l4 3 7-9"/><path d="M17 7h3v3"/></svg>AI Planning</button>\n    <button class="nav-btn" data-view="automation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v3m0 12v3M3 12h3m12 0h3"/><circle cx="12" cy="12" r="5"/></svg>Automation</button>'''
if nav_anchor not in s:
    raise SystemExit('Weekly Review nav anchor not found')
s = s.replace(nav_anchor, nav_add, 1)

notes_anchor = '  <section class="view" id="view-notes">'
views = '''  <section class="view" id="view-planner"><div class="view-title"><h2>AI Planning</h2><p>基于确认过的 NextPlan 状态生成可解释计划；建议不会自动改写项目事实。</p></div><div class="analytics-grid"><div class="card analytics-card"><h4>Focus Now</h4><div id="plannerFocus" class="review-list"></div></div><div class="card analytics-card"><h4>Capacity</h4><div id="plannerCapacity" class="review-list"></div></div><div class="card analytics-card"><h4>Next 14 Days</h4><div id="plannerHorizon" class="review-list"></div></div><div class="card analytics-card"><h4>Planning Interventions</h4><div id="plannerInterventions" class="review-list"></div></div></div></section>\n  <section class="view" id="view-automation"><div class="view-title"><h2>Automation</h2><p>后台自动检查逾期、准备窗口、停滞、Waiting follow-up 和结构性问题；默认只提醒，不擅自改项目。</p></div><div class="analytics-grid"><div class="card analytics-card"><h4>Rules</h4><div id="automationRules" class="review-list"></div></div><div class="card analytics-card"><h4>Latest Findings</h4><div id="automationFindings" class="review-list"></div></div><div class="card analytics-card"><h4>Last Run</h4><div id="automationMeta" class="review-list"></div></div><div class="card analytics-card"><h4>Safety</h4><div class="review-list"><div class="review-item"><b>Observe / recommend first</b><span class="review-muted">Automation may surface findings, but completion, deletion, new commitments and priority changes still require the normal confirmation protocol.</span></div></div></div></div></section>\n'''
if notes_anchor not in s:
    raise SystemExit('Notes view anchor not found')
s = s.replace(notes_anchor, views + notes_anchor, 1)

css = '''\n/* NEXTPLAN PHASE D */\n.sev-critical{color:var(--red)}.sev-high{color:var(--orange)}.sev-medium{color:var(--blue)}.sev-normal{color:var(--green)}.rule-off{opacity:.58}.plan-score{font-size:20px;font-weight:760;letter-spacing:-.4px}.automation-summary{font-size:11px;color:var(--muted);margin-top:4px}\n'''
s = s.replace('</style>', css + '\n</style>', 1)

helpers = r'''const defaultAutomationRulesUI=[
{id:'overdue-deadline',name:'Overdue deadlines',enabled:true},
{id:'preparation-window',name:'Preparation windows',enabled:true,threshold_days:5},
{id:'stale-active',name:'Stale active projects',enabled:true,threshold_days:7},
{id:'waiting-followup',name:'Waiting follow-up',enabled:true,threshold_days:7},
{id:'blocked-project',name:'Blocked projects',enabled:true},
{id:'missing-next-action',name:'Missing next action',enabled:true},
{id:'weekly-review',name:'Weekly review prompt',enabled:true,weekday:6}
];
function effectiveAutomationRulesUI(){const over=new Map((state.automation_rules||[]).map(r=>[String(r.id),r]));return defaultAutomationRulesUI.map(r=>({...r,...(over.get(r.id)||{})})).concat((state.automation_rules||[]).filter(r=>!defaultAutomationRulesUI.some(x=>x.id===r.id)))}
function plannerDataUI(){const r=weeklyReviewData(),focus=decisionCandidates()[0]||null,interventions=[];const add=(sev,title,reason)=>interventions.push({sev,title,reason});r.overdue.forEach(x=>add('critical',x.title,'Confirmed deadline is overdue.'));r.upcoming.filter(x=>daysDiff(x.date)<=5).forEach(x=>add(daysDiff(x.date)<=2?'high':'medium',x.title,`Confirmed commitment in ${daysDiff(x.date)} day(s); preparation window is active.`));r.blocked.forEach(p=>add('high',p.name,'Project is blocked; define an unblock condition.'));r.missing.forEach(p=>add('high',p.name,'Active project has no concrete next action.'));r.stale.forEach(x=>add('medium',x.p.name,x.age==null?'No recorded activity timestamp.':`No recorded movement for ${x.age} day(s).`));r.waiting.forEach(p=>{const activity=lastActivityMap()[String(p.id)],age=activity?Math.floor((Date.now()-activity)/86400000):null;if(age===null||age>=7)add('medium',p.name,`Waiting project has no recorded movement for ${age??'7+'} day(s).`)});if(!interventions.length&&focus)add('normal',focus.name,'No structural warning detected; continue the highest-scoring actionable work.');return{r,focus,interventions}}
function renderPlanner(){const d=plannerDataUI(),f=d.focus;$('plannerFocus').innerHTML=f?`<div class="review-item"><b>${esc(f.name)}</b><div class="plan-score">${Math.round(f.score)}</div><span class="review-muted">${esc(f.project.name)} · ${esc(f.why)}</span></div>`:reviewItem('No actionable focus','Waiting / blocked work is intentionally excluded.');$('plannerCapacity').innerHTML=[reviewItem(`${d.r.active.length} active project(s)`),reviewItem(`${d.r.waiting.length} waiting · ${d.r.blocked.length} blocked`),reviewItem(`${d.r.stale.length} stale active project(s)`) ].join('');$('plannerHorizon').innerHTML=d.r.upcoming.length?d.r.upcoming.slice(0,8).map(x=>reviewItem((x.time?x.time+' ':'')+x.title,`${localISO(x.date)} · ${daysDiff(x.date)} day(s)`)).join(''):reviewItem('No confirmed commitment in the next 14 days');$('plannerInterventions').innerHTML=d.interventions.length?d.interventions.slice(0,10).map(x=>`<div class="review-item"><b class="sev-${x.sev}">${esc(x.title)}</b><span class="review-muted">${esc(x.reason)}</span></div>`).join(''):reviewItem('No planning intervention required')}
function renderAutomation(){const rules=effectiveAutomationRulesUI(),feed=state.automation_feed||[],meta=state.automation_meta||{};$('automationRules').innerHTML=rules.map(r=>`<div class="review-item ${r.enabled===false?'rule-off':''}"><b>${esc(r.name||r.id)} · ${r.enabled===false?'Off':'On'}</b><span class="review-muted">${esc(r.id)}${r.threshold_days?` · ${r.threshold_days}d threshold`:''}</span></div>`).join('');$('automationFindings').innerHTML=feed.length?feed.slice(0,12).map(f=>`<div class="review-item"><b class="sev-${esc(f.severity||'normal')}">${esc(f.title||f.rule_id)}</b><span class="review-muted">${esc(f.reason||'')}</span></div>`).join(''):reviewItem('No persisted finding yet','The daily automation runner will refresh this feed; current planning remains available in AI Planning.');$('automationMeta').innerHTML=reviewItem(meta.last_run_at?'Last automation run':'No persisted run yet',meta.last_run_at?`${formatUpdated(meta.last_run_at)} · ${meta.finding_count||0} finding(s)`:'Daily scheduler is enabled.')}
'''
anchor = 'function renderMiniSidebar()'
if anchor not in s:
    raise SystemExit('renderMiniSidebar anchor not found')
s = s.replace(anchor, helpers + '\n' + anchor, 1)

old_render = "function renderAll(){renderGreeting();renderHome();renderProjects();renderTasks();renderCalendar(calendarCursor,'calGrid','calTitle',false);renderWeeklyReview();renderNotes();renderResources();renderAnalytics();renderMiniSidebar()}"
new_render = "function renderAll(){renderGreeting();renderHome();renderProjects();renderTasks();renderCalendar(calendarCursor,'calGrid','calTitle',false);renderWeeklyReview();renderPlanner();renderAutomation();renderNotes();renderResources();renderAnalytics();renderMiniSidebar()}"
if old_render not in s:
    raise SystemExit('renderAll Phase C contract not found')
s = s.replace(old_render, new_render, 1)

old_commands = "const paletteCommands=[['>home','Home','home'],['>projects','Projects','projects'],['>tasks','Tasks','tasks'],['>calendar','Calendar','calendar'],['>review','Weekly Review','review'],['>notes','Notes','notes'],['>resources','Resources','resources'],['>analytics','Analytics','analytics']];"
new_commands = "const paletteCommands=[['>home','Home','home'],['>projects','Projects','projects'],['>tasks','Tasks','tasks'],['>calendar','Calendar','calendar'],['>review','Weekly Review','review'],['>planner','AI Planning','planner'],['>automation','Automation','automation'],['>notes','Notes','notes'],['>resources','Resources','resources'],['>analytics','Analytics','analytics']];"
if old_commands not in s:
    raise SystemExit('Phase C command palette contract not found')
s = s.replace(old_commands, new_commands, 1)
s = s.replace("serviceWorker.register('./sw.js?v=phase-c-v1'", "serviceWorker.register('./sw.js?v=phase-d-v1'", 1)

p.write_text(s, encoding='utf-8')
print('Phase D UI contract installed.')
