from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

helper = """function currentActionInfo(p){const ms=p.milestones||[],active=ms.filter(m=>m.status==='active'),planned=ms.filter(m=>m.status==='planned');if(p.status==='waiting')return{label:'等待中',text:p.next_action||'等待外部事项推进'};if(p.status==='completed'||p.status==='done')return{label:'已完成',text:'当前项目已完成'};if(p.status==='planned')return{label:'尚未开始',text:p.next_action||planned[0]?.name||'等待开始'};if(active.length)return{label:'现在要做',text:active.map(m=>m.name).join(' · ')};return{label:'现在要做',text:p.next_action||planned[0]?.name||'尚未设置当前动作'}}"""

if 'function currentActionInfo(p)' not in s:
    anchor = 'function confirmedDeadlines(){'
    if anchor not in s:
        raise SystemExit('confirmedDeadlines anchor not found')
    s = s.replace(anchor, helper + '\n' + anchor, 1)

lines = s.splitlines()
out = []
replaced_home = False
replaced_card = False
replaced_projects = False
for line in lines:
    if line.startswith('function renderHome(){'):
        out.append("function renderHome(){const ps=state.projects||[],ov=overallPct(),active=ps.filter(p=>p.status==='active').length,waiting=ps.filter(p=>p.status==='waiting').length,dl=confirmedDeadlines().filter(x=>x.date>=startOfToday()&&x.date<=new Date(Date.now()+30*86400000));$('overallPct').textContent=ov+'%';$('overallBar').style.width=ov+'%';$('overallMeta').textContent=`${ps.filter(p=>projectPct(p)===100).length} / ${ps.length} projects completed  ·  ${active} in progress  ·  Last updated: ${formatUpdated(state.system?.last_updated)}`;$('statTotal').textContent=ps.length;$('statActive').textContent=active+' active';$('statProgress').textContent=active;$('statWaiting').textContent=waiting;$('statDeadlines').textContent=dl.length;$('homeProjects').innerHTML=ps.map(projectCard).join('')}")
        replaced_home = True
    elif line.startswith('function projectCard(p){'):
        out.append("function projectCard(p){const pc=projectPct(p),[bg,fg]=colorForCategory(p.category),action=currentActionInfo(p);return `<article class=\"card project-card\"><div class=\"pc-top\"><div class=\"pc-icon\" style=\"background:${bg};color:${fg}\">${iconForCategory(p.category)}</div><div class=\"pc-text\"><div class=\"pc-title\">${esc(p.name)}</div><div class=\"pc-sub\">${esc(p.category)} · ${priorityLabel(p.priority)} · ${statusLabel(p.status)}</div></div><div class=\"pc-pct\">${pc}%</div></div><div class=\"mini-progress\"><span style=\"width:${pc}%\"></span></div><div class=\"pc-next\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><rect x=\"5\" y=\"4\" width=\"14\" height=\"16\" rx=\"2\"/><path d=\"M8 2v4m8-4v4M8 10h8\"/></svg><div><b>${esc(action.label)}</b>${esc(action.text)}</div></div></article>`}")
        replaced_card = True
    elif line.startswith('function renderProjects(){'):
        out.append("function renderProjects(){const area=$('projectAreaFilter').value,status=$('projectStatusFilter').value;const ps=(state.projects||[]).filter(p=>(area==='全部'||p.category===area)&&(status==='全部'||p.status===status));$('projectList').innerHTML=ps.length?ps.map(p=>{const action=currentActionInfo(p);return `<div class=\"list-row\"><span class=\"status-dot ${statusClass(p.status)}\"></span><div class=\"list-main\"><div class=\"list-title\">${esc(p.name)}</div><div class=\"list-sub\"><b style=\"color:var(--text);font-weight:630\">${esc(action.label)}：</b>${esc(action.text)}</div><div class=\"milestone-tags\">${(p.milestones||[]).map(m=>`<span class=\"priority\">${statusLabel(m.status)} · ${esc(m.name)}</span>`).join('')}</div></div><div class=\"list-meta\"><b style=\"color:var(--text);font-size:16px\">${projectPct(p)}%</b><br>${esc(p.category)} · ${priorityLabel(p.priority)}</div></div>`}).join(''):`<div class=\"empty-state\"><b>没有符合条件的项目</b>换一个筛选条件即可。</div>`}")
        replaced_projects = True
    elif 'current-action.js' in line and '<script src=' in line:
        line = line.replace('<script src="./current-action.js?v=20260912-direct"></script>', '')
        if line.strip():
            out.append(line)
    else:
        out.append(line)

if not replaced_home:
    raise SystemExit('renderHome function not found')
if not replaced_card:
    raise SystemExit('projectCard function not found')
if not replaced_projects:
    raise SystemExit('renderProjects function not found')

s = '\n'.join(out) + '\n'
s = s.replace('当前所有主要项目，一眼看到进度与下一步。', '当前所有主要项目，一眼看到进度与当前动作。')
s = s.replace('长期目标、状态、里程碑与下一步。', '长期目标、状态、里程碑与当前动作。')
s = s.replace("navigator.serviceWorker.register('./sw.js?v=sidebar-final-v5',{updateViaCache:'none'})", "navigator.serviceWorker.register('./sw.js?v=home-all-projects-v1',{updateViaCache:'none'})")
s = s.replace("navigator.serviceWorker.register('./sw.js?v=current-action-direct-v2',{updateViaCache:'none'})", "navigator.serviceWorker.register('./sw.js?v=home-all-projects-v1',{updateViaCache:'none'})")
p.write_text(s, encoding='utf-8')

sw = Path('sw.js')
sw.write_text("""const CACHE_NAME = 'nextplan-shell-v10-home-all-projects';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, {cache:'no-store'}).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(fetch(request, {cache:'no-store'}).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request)));
  }
});
""", encoding='utf-8')

print('Home now renders every project card; current-action UI remains direct; service worker cache bumped.')
