"""Captures full-page screenshots of every public page (desktop + mobile) and
reports any console errors or failed requests. Usage: python3 tests/screens.py [outdir]"""
import sys, pathlib
from playwright.sync_api import sync_playwright

BASE = "https://localhost:8443"
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/shots"); OUT.mkdir(parents=True, exist_ok=True)
PAGES = ["index.html", "shop.html", "box.html?slug=focus", "builder.html", "cart.html", "about.html", "contact.html", "faq.html", "admin.html"]
VIEWPORTS = {"desktop": dict(width=1440, height=900), "mobile": dict(width=390, height=844)}
problems = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    for vname, vp in VIEWPORTS.items():
        ctx = b.new_context(viewport=vp, ignore_https_errors=True, device_scale_factor=1, is_mobile=vname == "mobile", has_touch=vname == "mobile")
        ctx.route("**/maps?**", lambda r: r.fulfill(status=200, body="<html><body style='margin:0;background:#E6E3EE;font:14px sans-serif;display:grid;place-items:center;height:100vh;color:#5E5875'>Map (Google Maps loads here on the live site)</body></html>", content_type="text/html"))
        for path in PAGES:
            pg = ctx.new_page()
            pg.on("console", lambda m, path=path, v=vname: m.type == "error" and problems.append(f"{v} {path} console: {m.text}"))
            pg.on("pageerror", lambda e, path=path, v=vname: problems.append(f"{v} {path} pageerror: {e}"))
            pg.on("requestfailed", lambda r, path=path, v=vname: problems.append(f"{v} {path} failed: {r.url}"))
            pg.goto(f"{BASE}/{path}", wait_until="networkidle")
            pg.evaluate("async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } scrollTo(0, 0); }")
            pg.wait_for_timeout(500)
            name = path.split(".")[0].split("?")[0] + ("-focus" if "slug" in path else "")
            pg.screenshot(path=str(OUT / f"{vname}-{name}.png"), full_page=True)
            # horizontal overflow check (mobile layout bugs)
            ow = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            if ow > 1: problems.append(f"{vname} {path} horizontal overflow {ow}px")
            pg.close()
        ctx.close()
    b.close()
print("\n".join(problems) or "no console errors, failed requests or overflow")
