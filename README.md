# MOODBOX — BIS 2103 e-commerce demonstration

Themed gift and lifestyle boxes (Focus, Relax, Gaming, Travel) plus a **Build-Your-Own Box** where customers choose 3–8 items and watch the price update. Built for the BIS 2103 Portfolio (HCT, Fall 202610). **Demonstration only: no payments are taken and nothing is shipped.**

| Part | Technology | Cost |
|---|---|---|
| Website (8 public pages + admin) | Plain HTML, CSS and JavaScript: no build step | GitHub Pages, free |
| Database, admin login, image storage | Supabase (Postgres + Row Level Security) | Free plan |
| Keep-alive and deploy | GitHub Actions | Free for public repos |

## Pages
`index.html` Home · `about.html` About (mission, vision, strategy, team) · `shop.html` Shop (search, mood and category filters, item details) · `box.html?slug=…` Box details · `builder.html` Build your own box · `cart.html` Cart, checkout form and confirmation · `contact.html` Contact form and map · `faq.html` FAQ, ordering, delivery, returns · `admin.html` Store admin

## How the main rules work
- **Prices are calculated by the database**, never trusted from the browser. Signature box = sum of its items × (1 − discount, default 10%). Custom box = items + AED 15 wrapping. Delivery is free from AED 200, otherwise AED 15.
- **Stock is kept per item.** Selling a box deducts every item inside it. All boxes in one order are checked together inside one database transaction, with rows locked, so two customers can't buy the last unit (tested with 4 concurrent orders).
- **No duplicate orders:** each checkout carries a one-time token, so a double-click or a retry returns the same order.
- **Admin rights live in the database** (`public.admins` + Row Level Security). Hiding admin screens is only for convenience.

## Folders
```
site/                 the website that gets published
supabase/             schema.sql → storage.sql → seed.sql (run in this order)
tests/                database tests, browser tests, local test server
tools/make_images.py  regenerates the illustrative product images
docs/                 setup, security, testing and assignment checklists
.github/workflows/    GitHub Pages deploy + Supabase keep-alive
```

## Go live
Follow **[docs/SETUP.md](docs/SETUP.md)** (about 20 minutes).

## Run the tests locally
Needs Postgres 16, Node 20+, Python 3 with `psycopg2` and `playwright`, and Chrome.
```
npm install
npm run test:db     # 63 database security and business-logic checks
npm run dev &       # local HTTPS server that emulates the Supabase API
npm run test:e2e    # 51 real-browser checks
```
Results and what they cover: [docs/TESTING.md](docs/TESTING.md).
