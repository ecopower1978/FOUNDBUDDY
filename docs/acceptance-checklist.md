# Production acceptance checklist

## Security and dependencies

- [ ] Frozen Node 22 / pnpm 11 install succeeds without configuration warnings.
- [ ] `pnpm audit --prod --audit-level=high` reports no high or critical issue.
- [ ] Every accepted moderate advisory has exploit conditions, owner and review date.
- [ ] Production refuses missing database, site, secret, S3, Redis or mail settings.
- [ ] CSP report-only staging review is complete; enforcing CSP is enabled.
- [ ] No public seed route, fixed demo password, localhost URL or old brand remains.

## Data and infrastructure

- [ ] Migrations pass from an empty PostgreSQL database and a staging copy.
- [ ] Legacy import dry-run has no blockers; apply and repeat-run counts match.
- [ ] Product, post, media, user and per-locale counts match source reports.
- [ ] Every imported relationship and media URL is valid.
- [ ] Object versioning/lifecycle/CORS are verified; integrity check passes.
- [ ] Daily database backup and quarterly isolated restore drill succeed.

## Merchant workflow

- [ ] Owner/editor/anonymous permission matrix passes.
- [ ] Last-owner, self-delete and exact-name permanent-delete protections pass.
- [ ] Draft, publish, unlist and retryable bulk-unlist flows pass.
- [ ] Homepage accepts ordered published products and rejects more than eight.
- [ ] Translation success, partial failure, timeout, stale job, retry and manual lock pass.
- [ ] Invitation and password-reset email delivery pass.

## Public experience

- [ ] All nine locale routes, cookie detection, 307 root and 308 legacy redirects pass.
- [ ] Arabic and Hebrew pages have correct RTL layout and control direction.
- [ ] Canonical, hreflang, x-default, robots and locale sitemaps contain only production URLs.
- [ ] Mobile menu, language listbox, carousel and AI dialog pass keyboard testing.
- [ ] 320, 360, 390, 768, 1024 and 1440 px layouts have no overflow.
- [ ] Axe has no serious/critical issue; a keyboard-only manual pass is recorded.
- [ ] Mobile Lighthouse Performance is at least 85 and Accessibility at least 95.
- [ ] Field measurements meet CLS < 0.1 and LCP < 2.5 s.

## Cutover

- [ ] Real-data staging rehearsal is approved.
- [ ] Final backup and incremental import complete while old writes are frozen.
- [ ] New instances are ready and internal smoke tests pass before traffic switch.
- [ ] Merchant writes are enabled only after reconciliation.
- [ ] Old data/media/image remain read-only for at least 30 days.
- [ ] Rollback owner and decision window are recorded.
