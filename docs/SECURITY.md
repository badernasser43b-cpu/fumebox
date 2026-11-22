# FUMEBOX — Security and privacy fact sheet

Source material for **Stage 5 (security and ethics)**. Each control is marked as one of three kinds:

- **Built and tested:** implemented in this project and covered by an automated test.
- **Configured by you:** a setting you switch on during setup (docs/SETUP.md). Check it is done before claiming it.
- **Provider claim:** offered by GitHub or Supabase according to their documentation. We have not verified it ourselves, so cite their documents rather than presenting it as our own result.

## Technical controls

| Area | Control | Kind |
|---|---|---|
| Encryption in transit | HTTPS on `*.github.io` and `*.supabase.co` | Provider claim (check the padlock on the live site) |
| Encryption at rest | Supabase states that data is encrypted at rest | Provider claim |
| Admin authentication | Email + password through Supabase Auth; public sign-up disabled | Built (login, wrong password and non-admin tests) + Configured by you (sign-up off) |
| Authorisation | Row Level Security on every table. Visitors can only read the active catalogue and site text. Only users in `admins` can change products, boxes, orders and content | Built and tested (25 access-control and data-integrity checks as anon, signed-in non-admin and admin) |
| Least privilege | Table grants revoked and re-granted per role, on top of RLS | Built and tested |
| Customer data protection | Orders, messages and analytics cannot be read by visitors (HTTP 403) | Built and tested |
| Input validation | Browser checks **and** the same rules enforced in the database (name, email, phone, address, emirate, quantities, box size, lengths) | Built and tested |
| Price tampering | Prices sent by the browser are ignored; the database recalculates every total | Built and tested |
| Overselling and race conditions | Per-item stock check with row locks in one transaction | Built and tested (concurrency test) |
| Duplicate orders | Idempotency token per checkout | Built and tested (double-click test) |
| Abuse and rate limits | Global caps: 60 orders / 10 min, 30 messages / 10 min, 60 analytics events per visitor per minute; contact-form honeypot | Built and tested. **Limitation:** caps are global, not per visitor, so a determined attacker could block ordering for 10 minutes |
| Cross-site scripting | All dynamic text is HTML-escaped; Content-Security-Policy allows scripts only from the site itself | Built (CSP active during browser tests) |
| Image uploads | Admin only; JPG/PNG/WebP only; 2 MB limit enforced by the storage bucket | Built (upload tested in harness) + Provider (bucket limits enforced by Supabase) |
| Secret keys | Only the public anon/publishable key is in the site. The deploy workflow refuses to publish a service-role or secret key | Built and tested |
| Availability | Free plan pauses after low activity, so a daily keep-alive runs; no backups on the free plan, so weekly CSV exports are needed | Configured by you |
| Security headers | GitHub Pages cannot set custom headers (no HSTS preload, no `frame-ancestors`, no X-Frame-Options) | **Known limitation** |

## Privacy and ethics design

- **No real payments.** No card data is ever collected, so PCI-DSS does not apply to this demonstration. A real launch would need a certified payment provider.
- **Analytics without tracking.** No cookies, no IP address, no device fingerprint, no names. A random session ID lives only in the visitor's tab (`sessionStorage`). There is therefore no cookie banner. A real business would still need a privacy notice.
- **Data minimisation.** Checkout asks only for what delivery needs. Customers are told to use test details.
- **Transparency.** A banner on every page says it is a student demonstration. Policies state their assumptions.
- **Honest analytics.** Team members can exclude their own browsers, and automated browsers are not counted, so the Week 12–14 numbers reflect real visitors.
- **Team privacy.** The admin content page warns against publishing student ID numbers.
- **UAE context to discuss in the report:** Federal Decree-Law No. 45 of 2021 on personal data protection (PDPL). Check its current status and requirements with a source before citing it.

## Residual risks to discuss honestly

1. One admin password protects the whole store. Supabase offers MFA (multi-factor authentication), but it is not enabled in this demonstration.
2. Global rate limits can be abused to cause a short denial of service.
3. No automatic backups on the free plan.
4. Dependency on third parties (GitHub, Supabase, Google Maps embed): their outages or policy changes affect the store.
5. Without server-side security headers, clickjacking protection relies on browsers' defaults.
