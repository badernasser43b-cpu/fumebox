# BIS 2103 Portfolio — Requirement-to-deliverable checklist

Source: *BIS 2103 Portfolio Guidelines 202610 V2* (Dr. Yasser Bentahar). Weight 40% = Report 20% + individual oral defense 20%. Due Week 15.

Status key: ✅ done and tested · 🟡 ready, needs your input · ⬜ not started · ⛔ blocked or needs the instructor

## Part A — Written report (100 marks)

| Guide section | Marks | Requirement (from the guide) | Deliverable | Status |
|---|---|---|---|---|
| 1. Introduction | 2 | Company: business, products and services, target customers | Site About page + report template | 🟡 replace team placeholders |
| | 1 | Website link | Live GitHub Pages URL | 🟡 after SETUP.md steps 1–6 |
| | 2 | Summary of all stages, including how ERP supports the website | Report template | ⬜ next |
| 2. Stage 1 mock-ups | 6 | Desktop mock-up made in a listed free tool (Adobe XD, Visio, Canva, Mockplus, Mockflow, Word/PowerPoint) | Mock-up file | ⬜ next. **Must be made in a listed tool**: the website itself or my screenshots do not count |
| | 4 | Justify desktop anatomy (design + content) | Justification text | ⬜ next |
| | 6 | Mobile mock-up in a listed tool | Mock-up file | ⬜ next |
| | 4 | Justify mobile anatomy | Justification text | ⬜ next |
| 3. Stage 2 website | 5 | Home page: appropriate, professional content | `index.html` | ✅ |
| | 5 | About Us: management and employment, mission/vision/strategy, owners (group members) | `about.html` + Admin → Site content | 🟡 add real names |
| | 5 | Products/Services: information page **and** order form page | `shop.html`, `box.html`, `builder.html`, `cart.html` | ✅ |
| | 3 | Contact: all contact info, map, form | `contact.html` | 🟡 add real contact email |
| | 2 | One of: FAQ / returns or service-quality policy / feedback / link to another company / other | `faq.html` (FAQ + returns + delivery + support) | ✅ |
| | — | Free hosting, no purchased URL; "preferably wix" | GitHub Pages + Supabase free | ⛔ **confirm with instructor** (see INSTRUCTOR_QUESTION.md) |
| 4. Stage 3 analytics | 4 + 4 + 4 | Weeks 12, 13, 14: download the report, analyse graphs, decide on actions for the next week | Admin → Analytics (date range, charts, funnel, CSV, print to PDF) | ⛔ **Week 12 likely not measurable**: site not live on 22 Nov. Ask instructor. Weeks 13–14 possible once live |
| | 8 | Cumulative review of the 3 cycles after Week 14 | Report section | ⬜ after Week 14 (real data only) |
| 5. Stage 4 ERP | 2 | Session 3 (Fri 13 Nov): screenshots of PO (number, supplier, item, qty, status), goods receipt, stock issue, stock movement | **Each student's own** ERP screenshots | 🟡 students supply; checklist next |
| | 2 | Session 4 (Fri 20 Nov): supplier invoice, balanced debit/credit entries, linked document chain | **Each student's own** ERP screenshots | 🟡 students supply |
| | 2 + 2 + 2 | ERP importance: procurement/inventory, finance/accounting, integrated workflow linked to 2+ KPIs and Stage 3 analytics, plus one limitation | Group analysis | ⬜ next (website is not integrated with the ERP; explained conceptually) |
| 6. Stage 5 security & ethics | 20 | Evaluate the hosting platform's security (encryption, access control, fraud detection), advantages/disadvantages, ethics (privacy, data handling, transparency, platform responsibility) | Report section; fact sheet `docs/SECURITY.md` | 🟡 facts ready; essay next. Platform is Supabase + GitHub Pages, not Wix: depends on instructor answer |
| 7. Conclusion | 5 | Challenges, lessons, specific evidence-based recommendations | Report section | ⬜ after Stage 3 |
| Coversheet | — | Names, HCT IDs, signed academic-integrity declaration | Cover page | 🟡 students |
| AI statement | — | State prompts; AI responses in **red font** | AI-use appendix | ⬜ next; students must review |

## Part B — Oral presentation (individual, 100 marks)

| Requirement | Deliverable | Status |
|---|---|---|
| Rubric | "BIS 2103 – Oral Presentation Rubric – 202610" is referenced but **was not attached** | ⛔ get the rubric |
| Explain and defend all sections, including the ERP chain (PO → receipt → stock issue → invoice → accounting entries), ERP support for website performance, and weekly analytics decisions | Slides outline, demo script, practice questions | ⬜ next |
| Report submitted before the presentation | — | Students |

## Website quality acceptance (from the project brief)

| Check | Result |
|---|---|
| Required pages exist and work | ✅ 8 public pages + admin; 13 internal links checked |
| Responsive desktop/mobile | ✅ 1440 px and 390 px, no overflow (real phones still to check) |
| Admin can add, edit, remove items and boxes | ✅ tested |
| Changes persist | ✅ stored in the database, verified after reload |
| Cart and demonstration order work | ✅ tested, including double-click and stock edge cases |
| Customer/admin permissions separated | ✅ 25 access-control and data-integrity checks |
| Forms handle invalid data | ✅ browser + database validation |
| Analytics track real activity only | ✅ automated browsers excluded; team opt-out |
| Live link accessible to instructor | 🟡 after setup |
