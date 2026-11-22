"""
Database security & business-logic tests for BLOOMBOX.

Runs the REAL supabase/*.sql files against a local Postgres 16 with Supabase's
roles (anon / authenticated) and auth.uid() emulated, then exercises them the
way PostgREST does: SET ROLE + request.jwt.claims.

Usage:  ./tests/reset_db.sh && python3 tests/test_database.py
"""
import json, sys, threading, uuid
import psycopg2

DSN = "host=/tmp/pg port=5433 user=postgres dbname=cc"
ADMIN = "11111111-1111-1111-1111-111111111111"
OTHER_USER = "22222222-2222-2222-2222-222222222222"

results = []

def conn(role="anon", sub=None):
    c = psycopg2.connect(DSN)
    c.autocommit = False
    cur = c.cursor()
    claims = {"role": role}
    if sub:
        claims["sub"] = sub
    cur.execute("select set_config('request.jwt.claims', %s, false)", (json.dumps(claims),))
    cur.execute(f"set role {role}")
    c.commit()
    return c

def run(c, sql, args=None):
    cur = c.cursor()
    try:
        cur.execute(sql, args)
        rows = cur.fetchall() if cur.description else None
        c.commit()
        return rows, None
    except psycopg2.Error as e:
        c.rollback()
        return None, (e.pgerror or str(e)).strip().splitlines()[0]

def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

def su():
    c = psycopg2.connect(DSN); c.autocommit = True; return c

def stock(name):
    c = su(); cur = c.cursor()
    cur.execute("select stock from products where name=%s", (name,)); v = cur.fetchone()[0]; c.close(); return v

def pid(name):
    c = su(); cur = c.cursor()
    cur.execute("select id from products where name=%s", (name,)); v = cur.fetchone()[0]; c.close(); return v

def cid(slug):
    c = su(); cur = c.cursor()
    cur.execute("select id from collections where slug=%s", (slug,)); v = cur.fetchone()[0]; c.close(); return v

CUSTOMER = {"name": "Test Customer", "email": "test@example.com", "phone": "+971 50 123 4567",
            "address": "Building 1, Street 2, Khalifa City", "emirate": "Abu Dhabi", "notes": ""}

def order(c, lines, token=None, customer=None):
    token = token or str(uuid.uuid4())
    rows, err = run(c, "select place_order(%s::uuid, %s::jsonb, %s::jsonb)",
                    (token, json.dumps(customer or CUSTOMER), json.dumps(lines)))
    return (rows[0][0] if rows else None), err

anon = conn("anon")
admin = conn("authenticated", ADMIN)
user = conn("authenticated", OTHER_USER)

# ---------------- Access control ----------------
rows, err = run(anon, "select count(*) from products")
check("anon can read catalogue", rows and rows[0][0] == 24, str(rows or err))
for t in ["orders", "order_lines", "order_line_items", "contact_messages", "analytics_events", "admins"]:
    rows, err = run(anon, f"select * from {t} limit 1")
    check(f"anon cannot read {t}", err and "permission denied" in err, str(rows or err))
rows, err = run(anon, "insert into products(name,price_aed,category) values ('Hack',1,'X')")
check("anon cannot insert products", err is not None, str(err))
rows, err = run(anon, "update products set price_aed = 0.01")
check("anon cannot update products", err is not None, str(err))
rows, err = run(anon, "delete from products")
check("anon cannot delete products", err is not None, str(err))
rows, err = run(anon, "update site_settings set content='{}'")
check("anon cannot edit site content", err is not None, str(err))
rows, err = run(anon, "insert into collection_items values (1, 24, 1)")
check("anon cannot change box contents", err is not None, str(err))

rows, err = run(user, "insert into products(name,price_aed,category) values ('Hack',1,'Xx') returning id")
check("signed-in NON-admin cannot insert products", err and "row-level security" in err, str(rows or err))
rows, err = run(user, "update products set price_aed = 0.01 returning id")
check("signed-in NON-admin update affects 0 rows", rows == [], str(rows or err))
rows, err = run(user, "select count(*) from orders")
check("signed-in NON-admin sees 0 orders", rows and rows[0][0] == 0, str(rows or err))

rows, err = run(admin, "insert into products(name,price_aed,category,stock) values ('Admin Test Item',10,'Test',5) returning id")
check("admin can add product", rows is not None, str(err))
new_id = rows[0][0] if rows else None
rows, err = run(admin, "update products set price_aed=12.5, stock=7 where id=%s returning price_aed, stock", (new_id,))
check("admin can edit product", rows and float(rows[0][0]) == 12.5 and rows[0][1] == 7, str(rows or err))
rows, err = run(admin, "update products set is_archived=true where id=%s returning id", (new_id,))
check("admin can archive product", rows is not None, str(err))
rows, err = run(anon, "select count(*) from products where id=%s", (new_id,))
check("archived product hidden from public", rows and rows[0][0] == 0, str(rows or err))
rows, err = run(admin, "select count(*) from products where id=%s", (new_id,))
check("archived product still visible to admin", rows and rows[0][0] == 1, str(rows or err))
rows, err = run(admin, "delete from products where id=%s returning id", (new_id,))
check("admin can delete product", rows is not None, str(err))
rows, err = run(admin, "update collections set discount_pct=15 where slug='travel' returning discount_pct")
check("admin can edit a themed box", rows is not None, str(err))
run(admin, "update collections set discount_pct=10 where slug='travel'")
rows, err = run(admin, "insert into products(name,price_aed,category) values ('Bad price',-5,'Test')")
check("negative price rejected by constraint", err is not None, str(err))
rows, err = run(admin, "insert into products(name,price_aed,category,stock) values ('Bad stock',5,'Test',-1)")
check("negative stock rejected by constraint", err is not None, str(err))
rows, err = run(admin, "insert into products(name,price_aed,category,image_url) values ('Bad url',5,'Test','javascript:alert(1)')")
check("unsafe image URL rejected by constraint", err is not None, str(err))

# ---------------- Orders: pricing & inventory ----------------
focus_items = ["Linen A5 Dotted Journal", "Matte Gel Pen Trio", "Pomodoro Desk Timer",
               "Pastel Highlighter Set (6)", "Focus Herbal Tea (20 bags)"]
before = {n: stock(n) for n in focus_items}
res, err = order(anon, [{"type": "signature", "collection_id": cid("focus"), "quantity": 2}])
check("signature box order succeeds", res and not err, str(err))
check("signature price = items × (1 − 10%) × qty, free delivery ≥ 200",
      res and float(res["subtotal_aed"]) == 352.80 and float(res["delivery_aed"]) == 0 and float(res["total_aed"]) == 352.80, str(res))
check("each item in signature box deducted ×2",
      all(stock(n) == before[n] - 2 for n in focus_items), str({n: (before[n], stock(n)) for n in focus_items}))

b_candle, b_socks, b_cable = stock("Lavender Soy Candle 200 g"), stock("Cloud Fleece Socks"), stock("Cable Management Kit")
res, err = order(anon, [{"type": "custom", "gift_message": "Happy birthday!",
                         "items": [{"product_id": pid("Lavender Soy Candle 200 g"), "quantity": 1},
                                   {"product_id": pid("Cloud Fleece Socks"), "quantity": 2},
                                   {"product_id": pid("Cable Management Kit"), "quantity": 1, "price": 0.01}]}])
# 65 + 2*29 + 35 = 158 + 15 packaging = 173 ; delivery 15 → 188
check("custom box price = items + AED 15 wrapping; browser 'price' ignored",
      res and float(res["subtotal_aed"]) == 173 and float(res["delivery_aed"]) == 15 and float(res["total_aed"]) == 188, str(res or err))
check("custom box deducts exact chosen quantities",
      stock("Lavender Soy Candle 200 g") == b_candle - 1 and stock("Cloud Fleece Socks") == b_socks - 2 and stock("Cable Management Kit") == b_cable - 1)

c = su(); cur = c.cursor()
cur.execute("""select ol.line_type, ol.gift_message, sum(oli.qty_total) from orders o join order_lines ol on ol.order_id=o.id
               join order_line_items oli on oli.order_line_id=ol.id where o.reference=%s group by 1,2""", (res["reference"],))
r = cur.fetchone(); c.close()
check("order stored with box line, gift message and item breakdown", r == ("custom", "Happy birthday!", 4), str(r))

# Combined demand across boxes: Relax signature (includes candle) + custom with 3 diffusers (stock 3)
diff = pid("Ceramic Aroma Diffuser")
res, err = order(anon, [{"type": "custom", "items": [{"product_id": diff, "quantity": 3},
                                                     {"product_id": pid("Cloud Fleece Socks"), "quantity": 1},
                                                     {"product_id": pid("Mulberry Silk Sleep Mask"), "quantity": 1}]}])
check("ordering the last 3 units of an item works", res and stock("Ceramic Aroma Diffuser") == 0, str(err))
s_socks = stock("Cloud Fleece Socks")
res, err = order(anon, [{"type": "custom", "items": [{"product_id": diff, "quantity": 1},
                                                     {"product_id": pid("Cloud Fleece Socks"), "quantity": 1},
                                                     {"product_id": pid("Mulberry Silk Sleep Mask"), "quantity": 1}]}])
check("sold-out item rejected with INSUFFICIENT_STOCK", err and "INSUFFICIENT_STOCK:Ceramic Aroma Diffuser:0" in err, str(err))
check("failed order deducts nothing (atomic)", stock("Cloud Fleece Socks") == s_socks)

# Same item demanded by two boxes in one order: Gaming signature (desk mat ×1) ×N + custom with desk mat
mat = pid("XL RGB Desk Mat"); mat_stock = stock("XL RGB Desk Mat")  # 20
c = su(); c.cursor().execute("update products set stock=2 where id=%s", (mat,)); c.close()
res, err = order(anon, [{"type": "signature", "collection_id": cid("gaming"), "quantity": 2},
                        {"type": "custom", "items": [{"product_id": mat, "quantity": 1},
                                                     {"product_id": pid("Keyboard Cleaning Kit"), "quantity": 1},
                                                     {"product_id": pid("Cable Management Kit"), "quantity": 1}]}])
check("demand for one item is summed across ALL boxes in the order", err and "INSUFFICIENT_STOCK:XL RGB Desk Mat:2" in err, str(res or err))
c = su(); c.cursor().execute("update products set stock=%s where id=%s", (mat_stock, mat)); c.close()

res, err = order(anon, [{"type": "custom", "items": [{"product_id": pid("Anti-Sweat Gaming Gloves"), "quantity": 1},
                                                     {"product_id": mat, "quantity": 1},
                                                     {"product_id": pid("Keyboard Cleaning Kit"), "quantity": 1}]}])
check("out-of-stock item (stock 0) rejected", err and "INSUFFICIENT_STOCK" in err, str(err))

c = su(); c.cursor().execute("update products set is_available=false where name='Universal Travel Adapter'"); c.close()
res, err = order(anon, [{"type": "signature", "collection_id": cid("travel"), "quantity": 1}])
check("box containing an unavailable item cannot be ordered", err and "PRODUCT_UNAVAILABLE:Universal Travel Adapter" in err, str(err))
c = su(); c.cursor().execute("update products set is_available=true where name='Universal Travel Adapter'"); c.close()

# Idempotency
tok = str(uuid.uuid4()); j0 = stock("Linen A5 Dotted Journal")
r1, e1 = order(anon, [{"type": "signature", "collection_id": cid("focus"), "quantity": 1}], token=tok)
r2, e2 = order(anon, [{"type": "signature", "collection_id": cid("focus"), "quantity": 1}], token=tok)
check("duplicate submission returns the same reference", r1 and r2 and r1["reference"] == r2["reference"] and r2["duplicate"] is True, f"{r1} {r2}")
check("duplicate submission does not deduct stock twice", stock("Linen A5 Dotted Journal") == j0 - 1)

# Validation
def expect(name, lines, code, customer=None):
    _, err = order(anon, lines, customer=customer)
    check(name, err and code in err, str(err))
three = [{"product_id": pid("Matte Gel Pen Trio"), "quantity": 1}, {"product_id": pid("Bamboo Phone Stand"), "quantity": 1}]
expect("custom box with < 3 items rejected", [{"type": "custom", "items": three}], "CUSTOM_BOX_SIZE")
nine = [{"product_id": i, "quantity": 1} for i in range(1, 10)]
expect("custom box with > 8 items rejected", [{"type": "custom", "items": nine}], "CUSTOM_BOX_SIZE")
expect("item quantity 0 rejected", [{"type": "custom", "items": three + [{"product_id": pid("Cloud Fleece Socks"), "quantity": 0}]}], "INVALID_QUANTITY")
expect("item quantity > 3 rejected", [{"type": "custom", "items": three + [{"product_id": pid("Cloud Fleece Socks"), "quantity": 4}]}], "INVALID_QUANTITY")
expect("box quantity 11 rejected", [{"type": "signature", "collection_id": cid("focus"), "quantity": 11}], "INVALID_QUANTITY")
expect("negative box quantity rejected", [{"type": "signature", "collection_id": cid("focus"), "quantity": -1}], "INVALID_QUANTITY")
expect("unknown box rejected", [{"type": "signature", "collection_id": 99999, "quantity": 1}], "BOX_UNAVAILABLE")
expect("empty cart rejected", [], "INVALID_CART")
expect("unknown line type rejected", [{"type": "free", "quantity": 1}], "INVALID_CART")
expect("invalid email rejected", [{"type": "signature", "collection_id": cid("focus"), "quantity": 1}], "INVALID_EMAIL", {**CUSTOMER, "email": "not-an-email"})
expect("invalid phone rejected", [{"type": "signature", "collection_id": cid("focus"), "quantity": 1}], "INVALID_PHONE", {**CUSTOMER, "phone": "abc"})
expect("invalid emirate rejected", [{"type": "signature", "collection_id": cid("focus"), "quantity": 1}], "INVALID_EMIRATE", {**CUSTOMER, "emirate": "Paris"})
expect("short name rejected", [{"type": "signature", "collection_id": cid("focus"), "quantity": 1}], "INVALID_NAME", {**CUSTOMER, "name": "A"})

# Concurrency: two customers race for the last 2 units
c = su(); c.cursor().execute("update products set stock=2 where name='Passport & Card Wallet'"); c.close()
wallet = pid("Passport & Card Wallet")
outcomes = []
def racer():
    cc = conn("anon")
    outcomes.append(order(cc, [{"type": "custom", "items": [{"product_id": wallet, "quantity": 2},
                                                           {"product_id": pid("Leak-Proof Toiletry Bottles (4)"), "quantity": 1},
                                                           {"product_id": pid("Memory-Foam Neck Pillow"), "quantity": 1}]}]))
threads = [threading.Thread(target=racer) for _ in range(4)]
[t.start() for t in threads]; [t.join() for t in threads]
ok = sum(1 for r, e in outcomes if r); fail = sum(1 for r, e in outcomes if e and "INSUFFICIENT_STOCK" in e)
check("4 concurrent orders for last 2 units → exactly 1 succeeds, no overselling",
      ok == 1 and fail == 3 and stock("Passport & Card Wallet") == 0, f"ok={ok} fail={fail} stock={stock('Passport & Card Wallet')}")

# ---------------- Contact, analytics ----------------
rows, err = run(anon, "select submit_contact('Sara','sara@example.com','Question','Do you deliver to Al Ain?')")
check("contact form submission stored", rows is not None, str(err))
rows, err = run(anon, "select submit_contact('Sara','bad','Question','Do you deliver to Al Ain?')")
check("contact form rejects bad email", err and "INVALID_EMAIL" in err, str(err))
sid = str(uuid.uuid4())
run(anon, "select track_event('page_view','home',%s::uuid,'mobile',null,null,'google.com',null)", (sid,))
run(anon, "select track_event('box_view','shop',%s::uuid,'mobile',null,%s,null,null)", (sid, cid("focus")))
rows, err = run(anon, "select track_event('evil_type','home',%s::uuid,'mobile')", (sid,))
check("malformed analytics event ignored without error", err is None, str(err))
for _ in range(70):
    run(anon, "select track_event('page_view','flood',%s::uuid,'desktop')", (sid,))
c = su(); cur = c.cursor(); cur.execute("select count(*) from analytics_events where session_id=%s", (sid,)); n = cur.fetchone()[0]; c.close()
check("analytics flood from one session capped at 60/min", n == 60, str(n))

rows, err = run(anon, "select analytics_report(now() - interval '7 days', now() + interval '1 day')")
check("anon cannot run analytics report", err and "permission denied" in err, str(err))
rows, err = run(user, "select analytics_report(now() - interval '7 days', now() + interval '1 day')")
check("non-admin cannot run analytics report", err and "FORBIDDEN" in err, str(err))
rows, err = run(admin, "select analytics_report('2026-11-01T00:00:00+04', '2026-12-01T00:00:00+04')")
rep = rows[0][0] if rows else {}
check("admin analytics report returns real totals",
      rep and rep["totals"]["orders"] >= 5 and rep["totals"]["sessions"] >= 1 and len(rep["daily"]) == 30, json.dumps(rep.get("totals")) if rep else str(err))

rows, err = run(admin, "select count(*) from orders")
check("admin can review orders", rows and rows[0][0] >= 5, str(rows or err))
rows, err = run(admin, "update orders set status='processing' where id=(select id from orders limit 1) returning status")
check("admin can update order status", rows and rows[0][0] == "processing", str(rows or err))
rows, err = run(admin, "update orders set status='hacked' where id=(select id from orders limit 1)")
check("invalid order status rejected", err is not None, str(err))

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{passed}/{len(results)} database tests passed")
sys.exit(0 if passed == len(results) else 1)
