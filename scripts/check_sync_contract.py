#!/usr/bin/env python3
"""Basic NextPlan web-sync regression checks, including inline JavaScript syntax."""
from pathlib import Path
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
html = (root / "index.html").read_text(encoding="utf-8")
sw = (root / "sw.js").read_text(encoding="utf-8")
assert "https://raw.githubusercontent.com/changxinjiresearch/LifeOS/main/state.json" in html
assert "https://api.github.com/repos/changxinjiresearch/LifeOS/contents/state.json?ref=main" in html
assert "cache:'no-store'" in html
assert "syncTimer=setInterval(()=>sync(false),30000)" in html
assert "$('syncPill').onclick=()=>sync(true)" in html
assert "async function fetchCanonicalState(preferApi=false)" in html
assert "if(getCfg().token){sync()" not in html
assert "sync(true);syncTimer=setInterval" in html
assert "if(p.status==='completed'||p.status==='done')return 100;" in html
assert "request.mode === 'navigate'" in sw
assert "cache: 'no-store'" in sw
assert "self.clients.claim()" in sw
scripts = re.findall(r"<script(?:\s[^>]*)?>(.*?)</script>", html, re.S | re.I)
assert len(scripts) == 1, f"Expected one inline script, got {len(scripts)}"
with tempfile.TemporaryDirectory() as tmp:
    js_path = Path(tmp) / "nextplan-web-inline.js"
    js_path.write_text(scripts[0], encoding="utf-8")
    subprocess.run(["node", "--check", str(js_path)], check=True)
print("NEXTPLAN_WEB_CANONICAL_SYNC_CONTRACT_PASS")
