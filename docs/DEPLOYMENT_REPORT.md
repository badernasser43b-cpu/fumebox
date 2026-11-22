# BLOOMBOX — live deployment report (22 Nov 2026)

Hand-off for the BIS 2103 portfolio and presentation. Everything below was
checked on the **live** site, not the local mock.

## Live links

| What | Where |
|---|---|
| Public store | https://badernasser43b-cpu.github.io/bloombox/ |
| Admin dashboard | https://badernasser43b-cpu.github.io/bloombox/admin.html |
| Code (public) | https://github.com/badernasser43b-cpu/bloombox |
| Database | Supabase project `moodbox` (free plan, Mumbai), organization "MOODBOX BIS 2103" |

The store is branded **BLOOMBOX** (renamed from MOODBOX on 22 Nov 2026; the
old `…/moodbox/` address no longer works).

## Architecture

- **GitHub Pages** (free) serves the static site from `site/`. Every push to
  `main` republishes it; the workflow refuses to publish if a secret Supabase
  key is ever found in the site.
- **Supabase** (free) stores products, boxes, orders, messages and analytics,
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
| Catalogue | 4 themed boxes, 24 items, prices and 10% box discount load from the database |
| Custom box | 3 items + AED 15 wrapping = AED 214 |
| Cart and checkout | Focus Box + custom box = AED 390.40, free delivery applied |
| Demo order | Reference `MB-261122-97AD0` recorded (clearly marked TEST data) |
| Stock | Each ordered item's stock dropped by exactly the quantity ordered |
| Admin: products | Added an item with an **image upload**, edited price and stock, deleted it |
| Admin: orders | The test order shows with all lines, totals and customer details |
| Public lock-out | Anonymous visitors **cannot** add/edit/delete products, read orders, messages, analytics or the admin list, change site text, upload images or sign up (all refused by the database) |
| Price tampering | Prices are recalculated by the database |
| Mobile | All customer pages fit a 375 px phone screen with no sideways scrolling |

## Product images

The flat illustrations were replaced with 29 real photographs from Unsplash
(free licence), with credits in `docs/IMAGE_CREDITS.md`. They are illustrative
stock photos; a few are close matches rather than the exact product.

## Known items

- The test order `MB-261122-97AD0` (TEST Customer Demo, AED 390.40) is still in
  Orders and counts toward demo revenue and analytics. Mark it *cancelled* or
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
