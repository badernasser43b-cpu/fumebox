"""
End-to-end browser tests for MOODBOX (real Chrome via Playwright) against the
local harness (tests/dev-server.mjs → local Postgres with the real schema).

Usage:  ./tests/reset_db.sh && python3 tests/test_e2e.py [screenshot_dir]
"""
import re, sys, json, pathlib, struct, zlib, psycopg2
from playwright.sync_api import sync_playwright, expect

BASE = "https://localhost:8443"
SHOTS = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/e2e"); SHOTS.mkdir(parents=True, exist_ok=True)
DSN = "host=/tmp/pg port=5433 user=postgres dbname=cc"
results = []

def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

def db(sql, args=None):
    c = psycopg2.connect(DSN); c.autocommit = True; cur = c.cursor(); cur.execute(sql, args)
    rows = cur.fetchall() if cur.description else None; c.close(); return rows

def stock(name): return db("select stock from products where name=%s", (name,))[0][0]

def png(path, color=(61, 90, 254)):
    w = h = 64
    raw = b"".join(b"\x00" + bytes(color) * w for _ in range(h))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    pathlib.Path(path).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))

def shot(page, name, full=False): page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=full)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1366, "height": 900}, ignore_https_errors=True, accept_downloads=True)
    ctx.add_init_script("window.__MB_TEST_TRACK = true")   # allow analytics from the automated browser in tests
    ctx.route("**/maps?**", lambda r: r.fulfill(status=200, body="<html><body>map</body></html>", content_type="text/html"))
    errors = []
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))

    # ---------- 1. Signature box → cart ----------
    focus_items = ["Linen A5 Dotted Journal", "Matte Gel Pen Trio", "Pomodoro Desk Timer", "Pastel Highlighter Set (6)", "Focus Herbal Tea (20 bags)"]
    before = {n: stock(n) for n in focus_items}
    page.goto(f"{BASE}/shop.html"); page.get_by_role("link", name=re.compile("Focus Box")).click()
    expect(page.get_by_role("heading", name="Focus Box")).to_be_visible()
    check("box page shows discounted price", page.locator(".price-panel .big").inner_text() == "AED 176.40")
    page.get_by_label("Increase quantity").click()
    page.get_by_role("button", name="Add to cart").click()
    expect(page.locator(".site-header [data-cart-count]")).to_have_text("2")
    check("cart badge updates to 2 after adding 2 boxes", True)
    shot(page, "01-box-detail")

    # ---------- 2. Build-Your-Own ----------
    page.goto(f"{BASE}/builder.html")
    add = lambda name: page.locator(".item-card", has_text=name).get_by_role("button", name="Add to box").click()
    add("Lavender Soy Candle 200 g"); add("XL RGB Desk Mat")
    check("builder: 'Add box to cart' disabled with only 2 items", page.locator("#addBox").is_disabled())
    check("builder: running total = items + AED 15 wrapping (65+89+15)", page.locator("#boxTotal").inner_text() == "AED 169")
    add("Universal Travel Adapter")
    check("builder: enabled at 3 items", page.locator("#addBox").is_enabled())
    page.get_by_label("Increase Lavender Soy Candle 200 g").click()
    check("builder: quantity + updates total (2×65+89+79+15 = 313)", page.locator("#boxTotal").inner_text() == "AED 313")
    gl = page.locator(".item-card", has_text="Anti-Sweat Gaming Gloves").locator("[data-addbox]")
    check("builder: out-of-stock item cannot be added", gl.is_disabled() and gl.inner_text() == "Sold out")
    page.fill("#gift", "Good luck with finals!")
    shot(page, "02-builder-filled", full=False)
    page.click("#addBox"); page.wait_for_url("**/cart.html")
    expect(page.locator(".cart-line")).to_have_count(2)
    check("cart shows signature box ×2 and custom box", page.locator(".cart-line", has_text="Build-Your-Own Box").count() == 1)
    # 352.80 + 313 = 665.80, free delivery
    check("cart total = AED 665.80 with free delivery", "AED 665.80" in page.locator("#totals").inner_text() and "Free" in page.locator("#totals").inner_text())
    shot(page, "03-cart", full=True)

    # ---------- 3. Checkout validation ----------
    page.click("#placeBtn")
    check("empty checkout shows field errors", page.locator("#name-err").inner_text() != "" and page.locator("#ack-err").inner_text() != "")
    page.fill("#name", "Test Student"); page.fill("#email", "not-an-email"); page.fill("#phone", "+971 50 000 0000")
    page.fill("#address", "Building 7, Khalifa City"); page.select_option("#emirate", "Abu Dhabi"); page.check("#ack")
    page.click("#placeBtn")
    check("invalid email blocked client-side", "valid email" in page.locator("#email-err").inner_text())
    check("no order created by invalid submissions", db("select count(*) from orders")[0][0] == 0)
    shot(page, "04-validation", full=False)

    # ---------- 4. Place order (double-click) ----------
    page.fill("#email", "student@example.com")
    page.locator("#placeBtn").dblclick()
    expect(page.locator("[data-ref]")).to_be_visible(timeout=10000)
    ref = page.locator("[data-ref]").inner_text()
    check("confirmation shows MB- reference", re.fullmatch(r"MB-\d{6}-[0-9A-F]{5}", ref) is not None, ref)
    check("double-click created exactly ONE order", db("select count(*) from orders")[0][0] == 1)
    o = db("select total_aed, delivery_aed from orders where reference=%s", (ref,))
    check("stored order total matches cart (665.80, free delivery)", o and float(o[0][0]) == 665.80 and float(o[0][1]) == 0, str(o))
    check("signature items deducted ×2", all(stock(n) == before[n] - 2 for n in focus_items))
    check("custom box items deducted (candle −2, mat −1, adapter −1)", stock("Lavender Soy Candle 200 g") == 26 and stock("XL RGB Desk Mat") == 19 and stock("Universal Travel Adapter") == 25)
    check("cart emptied after order", page.locator(".site-header [data-cart-count]").is_hidden())
    shot(page, "05-confirmation", full=True)

    # ---------- 5. Stock changes between cart and checkout ----------
    page.goto(f"{BASE}/builder.html")
    for n in ["Ceramic Aroma Diffuser", "Cloud Fleece Socks", "Chamomile Night Tea Tin"]: add(n)
    page.click("#addBox"); page.wait_for_url("**/cart.html")
    db("update products set stock=0 where name='Ceramic Aroma Diffuser'")   # someone else bought the last ones
    page.fill("#name", "Test Student"); page.fill("#email", "s@example.com"); page.fill("#phone", "0501234567")
    page.fill("#address", "Building 7, Khalifa City"); page.select_option("#emirate", "Dubai"); page.check("#ack")
    n_before = db("select count(*) from orders")[0][0]
    page.click("#placeBtn")
    expect(page.locator("#formError")).to_be_visible()
    check("sold-out-at-checkout shows a clear error", "Ceramic Aroma Diffuser" in page.locator("#formError").inner_text(), page.locator("#formError").inner_text())
    check("…and no order is created", db("select count(*) from orders")[0][0] == n_before)
    expect(page.locator(".cart-line .problem")).to_have_count(1)
    check("…and the cart line is flagged", "Ceramic Aroma Diffuser" in page.locator(".cart-line .problem").inner_text())
    shot(page, "06-stock-error", full=False)
    db("update products set stock=3 where name='Ceramic Aroma Diffuser'")
    page.locator("[data-remove]").first.click()

    # ---------- 6. Contact form ----------
    page.goto(f"{BASE}/contact.html")
    page.click("#sendBtn")
    check("contact form validates empty fields", page.locator("#c-name-err").inner_text() != "")
    page.fill("#c-name", "Sara Test"); page.fill("#c-email", "sara@example.com"); page.select_option("#c-subject", "Question about a box")
    page.fill("#c-message", "Can I swap the tea in the Relax box?"); page.click("#sendBtn")
    expect(page.get_by_role("heading", name="Message sent")).to_be_visible()
    check("contact message stored", db("select count(*) from contact_messages")[0][0] == 1)

    # ---------- 7. Search & filter ----------
    page.goto(f"{BASE}/shop.html")
    page.fill("#q", "candle"); check("search filters items", page.locator("#itemsGrid .item-card").count() == 1)
    page.fill("#q", "zzzz"); check("empty search state shown", page.get_by_text("No items match").is_visible())
    page.click("#clear"); page.locator("#moodChips .chip", has_text="Travel").click()
    check("mood filter shows 6 travel items", page.locator("#itemsGrid .item-card").count() == 6)

    # ---------- 8. Admin access control ----------
    admin = ctx.new_page(); admin.on("pageerror", lambda e: errors.append(str(e)))
    admin.goto(f"{BASE}/admin.html")
    admin.fill("#lemail", "admin@moodbox.test"); admin.fill("#lpass", "wrong"); admin.click("#loginBtn")
    expect(admin.locator("#loginError")).to_contain_text("incorrect")
    check("admin: wrong password rejected", True)
    admin.fill("#lemail", "staff@moodbox.test"); admin.fill("#lpass", "Staff-Test-Pass-1"); admin.click("#loginBtn")
    expect(admin.locator("#loginError")).to_contain_text("not an administrator")
    check("admin: signed-in non-admin account is refused", admin.locator("#appView").is_hidden())
    admin.fill("#lemail", "admin@moodbox.test"); admin.fill("#lpass", "Admin-Test-Pass-1"); admin.click("#loginBtn")
    expect(admin.get_by_role("heading", name="Overview")).to_be_visible()
    check("admin: administrator signs in", True)
    shot(admin, "07-admin-overview", full=True)

    # ---------- 9. Admin: add item with image upload ----------
    png("/tmp/test-item.png")
    admin.get_by_role("button", name="Items & stock").click()
    admin.get_by_role("button", name="Add item").click()
    admin.fill("#i-name", "Scented Bookmark Set"); admin.fill("#i-desc", "Three cotton bookmarks with a light cedar scent.")
    admin.fill("#i-price", "27.50"); admin.fill("#i-stock", "12"); admin.fill("#i-cat", "Stationery")
    admin.select_option("#i-col", label="Focus"); admin.set_input_files("#i-file", "/tmp/test-item.png")
    shot(admin, "08-admin-add-item")
    admin.click("#saveItem")
    expect(admin.locator("#rows tr", has_text="Scented Bookmark Set")).to_be_visible()
    row = db("select price_aed, stock, image_url from products where name='Scented Bookmark Set'")
    check("admin: item saved with price, stock and uploaded image", row and float(row[0][0]) == 27.5 and row[0][1] == 12 and "/storage/v1/object/public/product-images/items/" in row[0][2], str(row))
    shot(admin, "09-admin-items", full=True)

    pub = ctx.new_page(); pub.goto(f"{BASE}/shop.html"); pub.fill("#q", "bookmark")
    check("new item appears in the public shop", pub.locator(".item-card", has_text="Scented Bookmark Set").count() == 1)
    img_ok = pub.evaluate("() => { const i = document.querySelector('.item-card img'); return i.complete && i.naturalWidth > 0; }")
    check("uploaded image is served to customers", img_ok)

    # edit price
    admin.locator("#rows tr", has_text="Scented Bookmark Set").get_by_role("button", name="Edit").click()
    admin.fill("#i-price", "29"); admin.fill("#i-stock", "20"); admin.click("#saveItem")
    expect(admin.locator("#rows tr", has_text="Scented Bookmark Set")).to_contain_text("AED 29")
    pub.reload(); pub.fill("#q", "bookmark")
    check("edited price visible to customers after reload (persisted)", "AED 29" in pub.locator(".item-card").inner_text())
    # mark unavailable
    admin.locator("#rows tr", has_text="Scented Bookmark Set").get_by_role("button", name="Edit").click()
    admin.uncheck("input[name=is_available]"); admin.click("#saveItem")
    pub.reload(); pub.fill("#q", "bookmark")
    check("unavailable item shows 'Unavailable' and cannot be added", pub.locator(".item-card .badge-out").inner_text() == "Unavailable" and pub.locator(".item-card [data-addbox]").is_disabled())
    # archive
    admin.locator("#rows tr", has_text="Scented Bookmark Set").get_by_role("button", name="Archive").click()
    expect(admin.locator("#rows tr", has_text="Scented Bookmark Set")).to_have_count(0)
    pub.reload(); pub.fill("#q", "bookmark")
    check("archived item hidden from the shop", pub.locator(".item-card").count() == 0)
    # delete (via archived filter)
    admin.check("#fa")
    admin.locator("#rows tr", has_text="Scented Bookmark Set").get_by_role("button", name="Delete").click()
    admin.locator("#confirmOk").click()
    expect(admin.locator("#rows tr", has_text="Scented Bookmark Set")).to_have_count(0)
    check("admin: item deleted from database", db("select count(*) from products where name='Scented Bookmark Set'")[0][0] == 0)

    # ---------- 10. Admin: edit a themed box ----------
    admin.get_by_role("button", name="Themed boxes").click()
    admin.locator("tr", has_text="Travel").get_by_role("button", name="Edit").click()
    admin.fill("#b-disc", "20")
    admin.click("#addRow")   # adds the first item not yet in the box
    shot(admin, "10-admin-edit-box")
    admin.click("#saveBox")
    expect(admin.locator("tr", has_text="Travel")).to_contain_text("20%")
    n_items = db("select count(*) from collection_items ci join collections c on c.id=ci.collection_id where c.slug='travel'")[0][0]
    check("admin: box discount and contents saved", n_items == 5, str(n_items))
    pub.goto(f"{BASE}/box.html?slug=travel")
    list_price = db("select sum(p.price_aed*ci.quantity) from collection_items ci join products p on p.id=ci.product_id join collections c on c.id=ci.collection_id where c.slug='travel'")[0][0]
    exp_price = round(float(list_price) * 0.8, 2)
    shown = pub.locator(".price-panel .big").inner_text()
    check("customer sees new box price from new contents and 20% discount", shown.replace("AED ", "").replace(",", "") in (f"{exp_price:g}", f"{exp_price:.2f}"), f"{shown} vs {exp_price}")
    shot(admin, "11-admin-boxes", full=True)

    # ---------- 11. Admin: orders, messages ----------
    admin.get_by_role("button", name=re.compile("^Orders")).click()
    expect(admin.locator("#orows")).to_contain_text(ref)
    admin.locator("#orows tr", has_text=ref).get_by_role("button", name="Details").click()
    check("admin: order detail shows item breakdown and gift message", "Good luck with finals!" in admin.locator("#orows").inner_text() and "2 × Lavender Soy Candle" in admin.locator("#orows").inner_text())
    admin.locator(f"#orows select").first.select_option("processing")
    admin.wait_for_timeout(500)
    check("admin: order status update persisted", db("select status from orders where reference=%s", (ref,))[0][0] == "processing")
    shot(admin, "12-admin-orders", full=True)
    admin.get_by_role("button", name=re.compile("^Messages")).click()
    expect(admin.get_by_text("Can I swap the tea")).to_be_visible()
    check("admin: contact message visible", True)

    # ---------- 12. Admin: analytics ----------
    admin.get_by_role("button", name="Analytics").click()
    expect(admin.locator(".kpi").first).to_be_visible()
    sessions = int(admin.locator(".kpi .v").first.inner_text())
    orders_kpi = int(admin.locator(".kpi .v").nth(2).inner_text())
    real_orders = db("select count(*) from orders where status <> 'cancelled'")[0][0]
    check("analytics: sessions counted from real browsing in this test", sessions >= 1, str(sessions))
    check("analytics: order count matches database", orders_kpi == real_orders, f"{orders_kpi} vs {real_orders}")
    with admin.expect_download() as dl: admin.click("#csv")
    csv_path = dl.value.path(); text = pathlib.Path(csv_path).read_text(encoding="utf-8-sig")
    check("analytics: CSV export downloads with daily rows", "Day,Sessions" in text and "MOODBOX analytics export" in text)
    shot(admin, "13-admin-analytics", full=True)

    # ---------- 13. Admin: site content ----------
    admin.get_by_role("button", name="Site content").click()
    admin.locator("#teamRows input[data-k=name]").first.fill("Rashed (test)")
    admin.click("#saveContent"); admin.wait_for_timeout(600)
    pub.goto(f"{BASE}/about.html")
    expect(pub.locator("#team")).to_contain_text("Rashed (test)")
    check("site content edit appears on About page", True)

    # ---------- 14. Sign out ----------
    admin.click("#logout")
    expect(admin.locator("#loginView")).to_be_visible()
    admin.goto(f"{BASE}/admin.html#orders")
    check("after sign-out, admin data is not shown", admin.locator("#appView").is_hidden())

    # ---------- 15. Link check ----------
    hrefs = set()
    for path in ["index.html", "shop.html", "builder.html", "cart.html", "about.html", "contact.html", "faq.html", "box.html?slug=relax"]:
        pub.goto(f"{BASE}/{path}"); pub.wait_for_load_state("networkidle")
        hrefs |= set(pub.eval_on_selector_all("a[href]", "els => els.map(e => e.getAttribute('href'))"))
    internal = sorted(h for h in hrefs if h and not h.startswith(("http", "mailto:", "tel:", "#")))
    broken = []
    for h in internal:
        r = pub.request.get(f"{BASE}/{h.split('#')[0]}")
        if r.status != 200: broken.append(f"{h} {r.status}")
    check(f"no broken internal links ({len(internal)} checked)", not broken, ", ".join(broken))

    # ---------- 16. Mobile ----------
    m = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, ignore_https_errors=True)
    mp = m.new_page(); mp.goto(f"{BASE}/builder.html")
    check("mobile: box panel hidden until opened", not mp.locator("#panel").is_visible())
    mp.locator(".item-card", has_text="Pomodoro Desk Timer").get_by_role("button", name="Add to box").click()
    expect(mp.locator("#barCount")).to_have_text("Your box · 1 item")
    mp.click("#bar"); mp.wait_for_timeout(400)
    check("mobile: bottom bar opens the box panel", mp.locator("#panel").is_visible())
    shot(mp, "14-mobile-builder-open")
    mp.goto(f"{BASE}/index.html"); mp.click(".nav-toggle")
    check("mobile: menu opens", mp.locator("#site-nav").is_visible())
    shot(mp, "15-mobile-menu")
    m.close()

    check("no uncaught JavaScript errors during tests", not errors, "; ".join(errors[:3]))
    browser.close()

passed = sum(ok for _, ok in results)
print(f"\n{passed}/{len(results)} end-to-end checks passed")
sys.exit(0 if passed == len(results) else 1)
