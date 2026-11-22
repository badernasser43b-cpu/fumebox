# FUMEBOX — Test evidence

Last run: 22 Nov 2026, on a local copy of the database built from the same `supabase/*.sql` files that go live. Full output is in `evidence/database-results.txt` and `evidence/e2e-results.txt`. Screenshots are in `evidence/screenshots/` (user flows) and `evidence/pages/` (every page, desktop 1440 px and mobile 390 px).

| Suite | Result | What it proves |
|---|---|---|
| `tests/test_database.py` | **63 / 63 passed** | Access control for visitors, signed-in non-admins and admins; pricing; per-item stock deduction for signature and custom boxes; combined demand across boxes; atomic rollback; duplicate-submission protection; input validation; 4 concurrent buyers for the last 2 units with no overselling; analytics permissions and flood cap |
| `tests/test_e2e.py` (real Chrome) | **51 / 51 passed** | Customer journey (box → builder → cart → checkout → confirmation), client validation, double-click, stock running out between cart and checkout, contact form, search and filters, admin login (wrong password, non-admin, admin), add/edit/unavailable/archive/delete item with image upload, box editing, orders, messages, analytics and CSV export, site content, sign-out, 13 internal links, mobile panel and menu, zero JavaScript errors |
| `tests/screens.py` | **No console errors, failed requests or horizontal overflow** | All 9 pages × 2 viewports |

## What these tests do NOT prove yet

| Not verified | Why | How to verify after go-live |
|---|---|---|
| Behaviour on the real Supabase service | The harness (`tests/dev-server.mjs`) emulates the Supabase HTTP API locally; the **database and its security rules are the real ones**, but the API layer is an emulation | After setup, run the "First checks" in SETUP.md, place one order and confirm it in the admin |
| Image upload to Supabase Storage | Upload ran against the harness, not the real bucket | Add one item with a photo in the live admin |
| Real iPhone / Android devices | Mobile was tested by Chrome device emulation (390 × 844, touch) | Open the live link on one iPhone and one Android phone and add a box to the cart |
| Keep-alive workflow | Needs your GitHub secrets | Run it once from the Actions tab (SETUP.md step 6) |
| HTTPS and provider security features | Provided by GitHub and Supabase | Check the padlock and cite provider documentation in Stage 5 |
