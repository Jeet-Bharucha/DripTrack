# DripTrack verification — October 27, 2026

## Result

63 automated tests passed on Node.js 20 and the production-pinned Node.js 24.22.1 runtime on Windows. Browser flows were also checked in an isolated local version using disposable accounts and fixture listings. The dependency audit reports **zero known production vulnerabilities** after updates (the initial audit reported nine: one critical, five high, three moderate).

This is an application review and regression suite, not a guarantee that every vulnerability has been found or an independent penetration-test certification.

## Changes verified

| Area | Checks |
| --- | --- |
| Sessions | Random opaque identifiers; only hashes stored in MongoDB; Secure, HttpOnly, SameSite and host-prefixed production cookies; no session tokens in browser storage or OAuth redirect URLs. |
| Revocation | Captured cookies stop working after sign-out, sign-out-all, password change, password reset, account deletion or expiry. |
| Request protection | Same-origin and Fetch Metadata checks, session-bound CSRF tokens, custom request header, JSON-only mutations, 24 KB request limit, no wildcard CORS. |
| Authentication | Incorrect login messages do not disclose account existence; nonexistent-user password checks perform bcrypt work; brute-force throttling; password byte limits; reset and verification links are purpose-bound and single-use (including concurrent reset attempts); only their hashes are retained in the database. |
| Authorization | Two-account tests for private watchlists and alerts; server-side ownership for push subscriptions; fresh sign-in and explicit confirmation for account deletion. |
| Input and output | MongoDB injection-shaped values, malformed JSON, arrays, oversized bodies, invalid queries, bad targets, traversal and private-file requests; escaped source HTML and attributes; spreadsheet formula neutralization in CSV exports. |
| Product integrity | Server ignores caller-supplied listing prices and sellers; saves and alerts resolve a current exact listing; history remains listing-specific; unsupported currencies and unsafe URLs are rejected. |
| Alerts | Verified email required; exact-match checks; pause/resume and target edits; delivery failures do not count as delivered; repeat notifications suppressed until rearmed. |
| Failure handling | Provider failures, cooldowns, request deduplication, cache timestamps, expired sessions, account-service outage and rate-limit retry guidance. |

## Browser checks

- Price filtering, clearing filters and listing comparison.
- Sign-in with a disposable fixture account and session persistence after navigation.
- Saving a source listing and reopening the watchlist.
- Refreshing a saved snapshot and displaying the observed difference.
- Downloading a shortlist CSV.
- Creating an alert, editing its target, pausing and resuming it.
- Signing out through the browser.
- Mobile comparison layout at 390 px; no document-level horizontal overflow.
- No JavaScript errors were observed during these fixture flows.

The route tests use an isolated in-memory model with real hashing and session middleware. They do not establish production MongoDB performance or test real customer accounts. Transactional email and external OAuth completion were not exercised using customer credentials. Actual provider searches and live database status are checked separately after deployment.

## Repeatable checks

Run `npm ci --prefix backend`, `npm run build`, and `npm test` from the repository root. Run `npm audit --omit=dev` from `backend`. GitHub Actions repeats build, tests and the advisory audit on Windows and Linux for pushes and pull requests.

For manual UI checks, `node backend/preview-fixture.js` starts an explicitly isolated server on port 3177. This uses in-memory data and intercepts mail; it is never the production start command and its source is not publicly served.

## Operational limits

- Amazon / Rainforest currently requires credits. The app discloses unavailable sources; it cannot repair a provider billing account through code.
- Free Render instances may sleep. Alert checks run while the server is active; guaranteed scheduling requires an always-on deployment or a separate scheduler.
- Rate-limit counters are per running process. Multi-instance deployments need shared counters or upstream protection.
- Dependency advisory results are a snapshot. Production and CI are pinned to the supported Node.js 24 LTS line. Keep the CI audit enabled and investigate newly reported advisories.
- This review does not cover the owner's Atlas/Render account permissions, backup restoration, external sellers' authenticity or checkout security, or infrastructure-level DDoS protection.
- Existing browser-token sign-ins must sign in again after the session migration. Existing users and password hashes are retained. Older unverified accounts must verify their email before enabling alerts. Previously issued recovery links must be requested again after migration.

## Reference guidance

- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Express production security](https://expressjs.com/advanced/best-practice-security/)
