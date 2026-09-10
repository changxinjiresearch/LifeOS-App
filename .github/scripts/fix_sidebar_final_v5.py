from pathlib import Path
import re

p = Path('index.html')
s = p.read_text(encoding='utf-8')

# Replace the previously approved sidebar block with the user's final visual corrections.
start = '/* APPROVED SIDEBAR SPEC v4 START */'
end = '/* APPROVED SIDEBAR SPEC v4 END */'
css = r'''/* APPROVED SIDEBAR SPEC v4 START */
/* Final user-approved sidebar tuning: compact Apple-like proportions, 236px desktop width. */
.sidebar{
  width:236px;
  padding:18px 14px 14px;
  background:#fafbfc;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Inter","Helvetica Neue",Arial,sans-serif;
  overflow-y:auto;
  overscroll-behavior:contain;
  scrollbar-width:none;
}
.sidebar::-webkit-scrollbar{display:none}
html[data-theme="dark"] .sidebar{background:#0b1220}
.brand{
  gap:12px;
  padding:0 6px 16px;
  align-items:center;
}
.brand-mark{
  width:48px;
  height:48px;
  border-radius:14px;
  box-shadow:0 8px 20px rgba(67,97,238,.20);
  flex:0 0 48px;
}
.brand-mark img{width:48px;height:48px}
.brand h1{
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Inter","Helvetica Neue",Arial,sans-serif;
  font-size:20px;
  line-height:24px;
  font-weight:700;
  letter-spacing:-.45px;
  color:#0f172a;
  white-space:nowrap;
}
.brand p{
  margin:2px 0 0;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Helvetica Neue",Arial,sans-serif;
  font-size:12px;
  line-height:16px;
  font-weight:400;
  letter-spacing:-.08px;
  color:#64748b;
  white-space:nowrap;
}
html[data-theme="dark"] .brand h1{color:#f8fafc}
html[data-theme="dark"] .brand p{color:#94a3b8}
.nav-group{gap:2px}
.nav-btn{
  min-height:40px;
  padding:8px 12px;
  gap:10px;
  border-radius:12px;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Inter","Helvetica Neue",Arial,sans-serif;
  font-size:15px;
  line-height:20px;
  font-weight:400;
  letter-spacing:-.16px;
  color:#0f172a;
}
.nav-btn > svg{
  width:18px;
  height:18px;
  flex:0 0 18px;
  color:#64748b;
  stroke-width:1.75;
}
.nav-btn[data-view="resources"] > svg{
  width:15px;
  height:15px;
  flex:0 0 15px;
  margin-left:1.5px;
  margin-right:1.5px;
  stroke-width:1.8;
}
.nav-btn.active{
  min-height:40px;
  color:#fff;
  font-weight:500;
  background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);
  box-shadow:0 7px 16px rgba(37,99,235,.20);
}
.nav-btn.active > svg{color:#fff}
.nav-btn:hover:not(.active){background:#f1f5f9}
html[data-theme="dark"] .nav-btn{color:#f8fafc}
html[data-theme="dark"] .nav-btn > svg{color:#94a3b8}
html[data-theme="dark"] .nav-btn.active{background:#1e3a8a;color:#fff}
html[data-theme="dark"] .nav-btn.active > svg{color:#fff}
html[data-theme="dark"] .nav-btn:hover:not(.active){background:#111c2d}
.nav-label{
  margin:10px 0 0;
  padding:16px 12px 7px;
  border-top:1px solid #e2e8f0;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Helvetica Neue",Arial,sans-serif;
  font-size:11px;
  line-height:14px;
  font-weight:600;
  letter-spacing:.10em;
  color:#64748b;
}
html[data-theme="dark"] .nav-label{border-top-color:#233044;color:#94a3b8}
.area-dot{
  width:26px;
  height:26px;
  border-radius:8px;
  flex:0 0 26px;
  font-size:12px;
  line-height:26px;
  font-weight:600;
}
.sidebar-footer{
  margin-top:auto;
  padding-top:12px;
  border-top:1px solid #e2e8f0;
}
html[data-theme="dark"] .sidebar-footer{border-top-color:#233044}
.settings-btn{
  min-height:40px;
  padding:8px 12px;
  gap:10px;
  border-radius:12px;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Helvetica Neue",Arial,sans-serif;
  font-size:15px;
  line-height:20px;
  font-weight:400;
  letter-spacing:-.16px;
  color:#64748b;
}
.settings-btn svg{
  width:18px;
  height:18px;
  flex:0 0 18px;
  color:#64748b;
  stroke-width:1.75;
}
.settings-btn:hover{background:#f1f5f9}
html[data-theme="dark"] .settings-btn{color:#cbd5e1}
html[data-theme="dark"] .settings-btn svg{color:#cbd5e1}
html[data-theme="dark"] .settings-btn:hover{background:#111c2d}
@media(min-width:1181px){.app-shell{grid-template-columns:236px minmax(0,1fr) 292px}}
/* APPROVED SIDEBAR SPEC v4 END */'''
pattern = re.compile(re.escape(start) + r'.*?' + re.escape(end), re.S)
s, n = pattern.subn(css, s, count=1)
if n != 1:
    raise SystemExit('Approved sidebar block not found')

# Force the brand copy into the exact two-line target while keeping it non-wrapping.
s = re.sub(
    r'<div class="brand"><div class="brand-mark"><img src="\./icon\.svg" alt="" width="\d+" height="\d+"></div><div><h1>NextPlan</h1><p>Plan today\.<br>A brighter tomorrow\.</p></div></div>',
    '<div class="brand"><div class="brand-mark"><img src="./icon.svg" alt="" width="48" height="48"></div><div><h1>NextPlan</h1><p>Plan today.<br>A brighter tomorrow.</p></div></div>',
    s,
    count=1
)

# Replace only the Resources glyph with the small diagonal chain-link shown in the reference.
resources_pattern = re.compile(r'(<button class="nav-btn" data-view="resources">)<svg.*?</svg>(Resources</button>)', re.S)
resources_svg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07.07l2-2A5 5 0 0 0 12 4l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15"/></svg>'
s, n = resources_pattern.subn(r'\1' + resources_svg + r'\2', s, count=1)
if n != 1:
    raise SystemExit('Resources nav button not found')

# Advance service-worker URL so installed PWA/browser receives the correction immediately.
s = re.sub(
    r"navigator\.serviceWorker\.register\('\./sw\.js(?:\?[^']*)?'(?:,\{updateViaCache:'none'\})?\)",
    "navigator.serviceWorker.register('./sw.js?v=sidebar-final-v5',{updateViaCache:'none'})",
    s,
    count=1
)
p.write_text(s, encoding='utf-8')

sw = Path('sw.js')
t = sw.read_text(encoding='utf-8')
t, n = re.subn(r"const CACHE_NAME = 'nextplan-shell-v\d+';", "const CACHE_NAME = 'nextplan-shell-v7';", t, count=1)
if n != 1:
    raise SystemExit('CACHE_NAME not found')
sw.write_text(t, encoding='utf-8')
