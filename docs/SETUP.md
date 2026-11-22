# FUMEBOX — Go-live setup (about 20 minutes)

Everything here is free. No credit card is needed. Steps marked **(you)** need your own accounts and must be done by you; nothing else needs code changes except step 3.

Architecture in one line: **GitHub Pages** serves the website files; **Supabase** (free plan) stores products, boxes, orders, messages and analytics, handles the admin login, and stores uploaded images.

---

## 1. Create the Supabase project (you)

1. Go to <https://supabase.com>, sign up (GitHub sign-in is fine) and click **New project**.
2. Name it `moodbox`. Generate a strong database password and save it in your password manager (you will not need it for the website).
3. Choose the region closest to the UAE that the dashboard offers. Free plan.
4. Wait until the project shows **Healthy**.

## 2. Create the database

In the Supabase dashboard open **SQL Editor → New query**, then paste and **Run** each file from the `supabase/` folder, **in this order**:

| Order | File | What it does |
|---|---|---|
| 1 | `schema.sql` | Tables, security policies, order/stock logic, analytics report |
| 2 | `storage.sql` | Image bucket (public read, admin-only upload, 2 MB, images only) |
| 3 | `seed.sql` | The 4 themed boxes, 24 sample items and placeholder site text |

Each should finish with "Success. No rows returned".

## 3. Connect the website to Supabase

1. In Supabase open **Project Settings → API** (or **API Keys**).
2. Copy the **Project URL** and the **anon / publishable** key.
   - The anon/publishable key is meant to be public; the database's security policies protect the data.
   - **Never** use the `service_role` / secret key in the website.
3. Paste both into `site/js/config.js`.

## 4. Create the administrator account (you)

1. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up". This stops anyone from creating accounts.
2. **Authentication → Users → Add user → Create new user**: enter the admin email and a strong password, and tick **Auto confirm user**.
3. Copy the new user's **UID**.
4. In **SQL Editor** run (replace the UID):
   ```sql
   insert into public.admins (user_id, note) values ('PASTE-UID-HERE', 'Store owner');
   ```
   Only accounts listed in `admins` can manage the store. A signed-in account that is not listed sees nothing.

## 5. Publish the website on GitHub Pages (you)

1. Create a **new public repository** on GitHub, for example `fumebox`. Keep it separate from any October AI repositories. (GitHub Pages is free for public repositories.)
2. Push this whole project folder to the `main` branch.
3. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Open **Actions**: the "Deploy website to GitHub Pages" workflow publishes the `site/` folder. It also refuses to publish if a secret Supabase key is ever pasted into the site.
5. After about a minute the site is live at `https://<your-username>.github.io/fumebox/`. This is the link for the instructor.
6. In Supabase **Authentication → URL Configuration**, set **Site URL** to that address.

## 6. Keep the free database awake until grading (you)

Supabase pauses free projects that have too little database activity over 7 days, and a paused project makes the website show "could not load" errors. The included workflow `.github/workflows/keep-alive.yml` queries the database every day.

1. In the GitHub repository: **Settings → Secrets and variables → Actions → New repository secret**.
2. Add `SUPABASE_URL` (Project URL) and `SUPABASE_ANON_KEY` (anon/publishable key).
3. **Actions → Supabase keep-alive → Run workflow** once, and check it ends green with `HTTP 200 ok:24`.

Also: open the live site yourself the day before the presentation. If it was paused anyway, open the Supabase dashboard and click **Resume project** (takes a few minutes).

## 7. First checks on the live site

- [ ] Home page shows the four boxes with prices.
- [ ] `admin.html` → sign in with the admin account → Overview loads.
- [ ] Admin → **Site content**: replace every `[Group member]` placeholder, the email, phone and map location. **Do not publish student ID numbers.**
- [ ] Admin → **Analytics**: tick "Don't count visits from this browser" on every team member's browser, so your own testing does not distort the Week 12–14 data.
- [ ] Place one test order and see it under Admin → **Orders**.

## Important limits of the free setup

- **No backups on the Supabase free plan.** Export orders and analytics CSVs from the admin dashboard every week and keep them with your report evidence.
- GitHub Pages cannot send custom security headers; a Content-Security-Policy is set in each page instead (see `docs/SECURITY.md`).
- The public anon key is visible in the page source by design. Security comes from Row Level Security, which is tested in `tests/test_database.py`.
