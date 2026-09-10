from pathlib import Path
import re

p = Path('index.html')
s = p.read_text(encoding='utf-8')

dm = '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">'
if 'family=DM+Sans' not in s:
    anchor = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
    if anchor in s:
        s = s.replace(anchor, anchor + '\n' + dm, 1)
    else:
        s = s.replace('<title>NextPlan</title>', dm + '\n<title>NextPlan</title>', 1)

overrides = '''
/* Sidebar typography v3 — approved visual direction */
.sidebar{font-family:"DM Sans","Inter",-apple-system,BlinkMacSystemFont,"Helvetica Neue","Segoe UI",sans-serif}
.brand h1{font-family:"DM Sans","Inter",sans-serif;font-size:20px;font-weight:700;letter-spacing:-.035em}
.brand p{font-family:"DM Sans","Inter",sans-serif;font-size:12px;font-weight:400;letter-spacing:-.012em;line-height:1.28}
.nav-btn{font-family:"DM Sans","Inter",sans-serif;font-size:17px;font-weight:400;line-height:1.2;letter-spacing:-.018em}
.nav-label{font-family:"DM Sans","Inter",sans-serif;font-size:11px;font-weight:600;letter-spacing:.10em}
.settings-btn{font-family:"DM Sans","Inter",sans-serif;font-size:17px;font-weight:400;line-height:1.2;letter-spacing:-.018em}
.nav-btn svg{width:17px;height:17px;color:#7d8798;stroke-width:1.8}
.nav-btn.active svg{color:#fff}
.settings-btn svg{width:18px;height:18px;color:#667085;stroke-width:1.8}
'''
marker = '/* Sidebar typography v3 — approved visual direction */'
if marker not in s:
    s = s.replace('</style>', overrides + '\n</style>', 1)

pattern = re.compile(r'<button class="settings-btn" id="settingsNav">.*?</button>', re.S)
new_settings = '<button class="settings-btn" id="settingsNav"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.14 12.94a7.5 7.5 0 0 0 .05-.94 7.5 7.5 0 0 0-.05-.94l2.03-1.58-1.92-3.32-2.39.96a7.4 7.4 0 0 0-1.63-.94L14.86 3.6h-3.84l-.37 2.58c-.58.24-1.12.56-1.63.94l-2.39-.96-1.92 3.32 2.03 1.58a7.5 7.5 0 0 0-.05.94c0 .32.02.63.05.94L4.71 14.52l1.92 3.32 2.39-.96c.5.38 1.05.7 1.63.94l.37 2.58h3.84l.37-2.58c.58-.24 1.12-.56 1.63-.94l2.39.96 1.92-3.32-2.03-1.58z"/></svg>Settings</button>'
s, n = pattern.subn(new_settings, s, count=1)
if n != 1:
    raise SystemExit('Settings button not found')

s = re.sub(r"navigator\.serviceWorker\.register\('\./sw\.js(?:\?[^']*)?'(?:,\{updateViaCache:'none'\})?\)",
           "navigator.serviceWorker.register('./sw.js?v=sidebar-dm-sans-1',{updateViaCache:'none'})", s, count=1)
p.write_text(s, encoding='utf-8')

sw = Path('sw.js')
t = sw.read_text(encoding='utf-8')
t = re.sub(r"const CACHE_NAME = 'nextplan-shell-v\d+';", "const CACHE_NAME = 'nextplan-shell-v5';", t, count=1)
sw.write_text(t, encoding='utf-8')
