# FUMEBOX — live deployment report (22 Nov 2026)

Hand-off for the BIS 2103 portfolio and presentation. Everything below was
checked on the **live** site, not the local mock.

## Live links

| What | Where |
|---|---|
| Public store | https://badernasser43b-cpu.github.io/fumebox/ |
| Admin dashboard | https://badernasser43b-cpu.github.io/fumebox/admin.html |
| Code (public) | https://github.com/badernasser43b-cpu/fumebox |
| Database | Supabase project `moodbox` (free plan, Mumbai), organization "MOODBOX BIS 2103" |

The store is **FUMEBOX**, an online perfume store: women's and men's perfumes
from Chanel, Dior, Yves Saint Laurent and Versace, two ready-made gift sets and
a build-your-own gift box. It was renamed from MOODBOX/BLOOMBOX on 22 Nov 2026;
the old `/moodbox/` and `/bloombox/` addresses no longer work.

## Architecture

- **GitHub Pages** (free) serves the static site from `site/`. Every push to
  `main` republishes it; the workflow refuses to publish if a secret Supabase
  key is ever found in the site.
- **Supabase** (free) stores perfumes, gift sets, orders, messages and analytics,
  handles the admin login, and stores uploaded product images.
- A daily GitHub Action (`keep-alive.yml`) pings the database so the free
  project is not paused for inactivity.

## Administrator login

1. Open `admin.html` and sign in with **badernasser43b@gmail.com** and the
   password the owner set in Supabase (only the owner knows it).
2. Public sign-up is **disabled**; only accounts listed in `public.admins`
   can manage the store. There is exactly one admin.
3. Forgotten password: in Supabase, delete and recreate the user
   (Authentication → Users), then re-add its UID to `public.admins`.

## Verified on the live site

| Area | Result |
|---|---|
| Catalogue | 14 perfumes (8 women's, 6 men's) and 2 gift sets load from the database, all photos load |
| Gift sets | Women's AED 1,775 → AED 1,597.50 and Men's AED 1,480 → AED 1,332 (10% off) |
| Custom gift box | Chanel N°5 + Bleu de Chanel + Coco Mademoiselle + AED 15 wrapping = AED 1,900 in the cart |
| Order placement | Tested before the perfume switch: reference `MB-261122-97AD0` recorded and stock dropped by exactly the quantity ordered (same database function today) |
| Admin: products | Added a product with an **image upload**, edited price and stock, deleted it |
| Admin: orders | The test order shows with all lines, totals and customer details |
| Public lock-out | Anonymous visitors **cannot** add/edit/delete products, read orders, messages, analytics or the admin list, change site text, upload images or sign up (all refused by the database) |
| Price tampering | Prices are recalculated by the database |
| Mobile | All customer pages fit a 375 px phone screen with no sideways scrolling |

## Product images

17 real photographs from Unsplash (free licence) of the actual perfume bottles
and gift packaging, credited in `docs/IMAGE_CREDITS.md`. The footer states that
FUMEBOX is not affiliated with the brands. Checkout says that no payment is
taken online and orders are not shipped; all other "demo" notices were removed.

## Known items

- The test order `MB-261122-97AD0` (TEST Customer Demo, AED 390.40, from the old
  gift-box catalogue; its product links are now empty) is still in Orders and counts toward demo revenue and analytics. Mark it *cancelled* or
  ignore it before collecting Week 12–14 data.
- Order references still start with `MB-` (from the old name).
- Site content placeholders (`[Group member]`, phone, map) still need real
  values: Admin → Site content. Do not publish student ID numbers.
- On every team member's browser, tick Admin → Analytics → "Don't count visits
  from this browser" so testing does not distort the data.
- No backups on the Supabase free plan: export the order and analytics CSVs
  from the admin dashboard weekly.
- One leftover 180-byte test image remains in the `product-images` storage
  bucket (harmless; can be deleted in Supabase Storage).
