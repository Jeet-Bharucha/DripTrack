# DripTrack

Website: https://driptrack-fgvs.onrender.com

Product listing discovery for sneakers, watches, bags and accessories. The UI shows original source titles, source images, USD prices, condition when supplied, and server fetch timestamps. DripTrack does not sell or independently authenticate products.

## Run locally

Use Node.js 20 or newer. Install backend dependencies with `npm install --prefix backend`, copy `.env.example` to `backend/.env`, supply your own settings, then run `npm start`. Open http://localhost:3001.

`npm run build` regenerates the HTML pages from `build-pages.js`. Shared layout and behavior live in `site.css` and `site.js`.

## Data providers

- eBay Browse API: individual fixed-price listings, condition, images, shipping when supplied, and product details.
- Rainforest: Amazon search listings. HTTP 402 means the provider needs billing/credit attention; the application does not invent replacements.
- SerpAPI Google Shopping: indexed listings. Google product links are explicitly labeled as shopping results, not direct seller pages.

Only priced USD results with a source-provided HTTPS URL and matching title are displayed. Results are cached in memory for up to one hour. Concurrent identical searches share a single provider request. Billing, authentication and rate-limit failures have cooldowns. Provider status reflects actual requests; configuration alone is not reported as a working connection.

No hardcoded product prices, testimonials, usage statistics, simulated history, authenticity guarantees or image substitutions are used. Descriptions and item facts come from providers; missing information is disclosed. A listed price is not a checkout quote and may vary with size, condition, shipping and taxes.

History observations use stable listing IDs and are recorded only after fresh search fetches. Old mixed-query history is excluded. Alerts match the exact listing ID, and old alerts without an ID are paused. The alert checker runs approximately every 30 minutes while the server is active; free hosting may sleep. Email delivery depends on the configured mail service.

## Accounts

Email/password and configured Google OAuth sign-in are supported. Saved listings and alerts are held in MongoDB. The site checks source data again when saving a listing or alert. Passwords are hashed, OAuth uses a state cookie, and the OAuth return token is passed in a URL fragment rather than the query string. Account deletion removes the profile and push subscriptions.

## Configuration

See `.env.example`. Required for accounts: `MONGODB_URI` and a persistent random `JWT_SECRET`. Email uses `GMAIL_USER` and `GMAIL_PASS` (an app password). Google login requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and the matching redirect URI. Provider keys are optional; unavailable sources are disclosed.

Set `PUBLIC_URL` to the deployed HTTPS origin when needed. The application automatically uses `RENDER_EXTERNAL_URL` on Render or `RAILWAY_PUBLIC_DOMAIN` on Railway. Never commit credentials.

## Checks

Run `npm test`. Tests cover source filtering, unsafe URLs, source provenance, provider failures, request deduplication and cache timestamps. Route tests use an isolated in-memory model and real password hashing/JWT middleware to check registration, login, watchlist deduplication, exact-listing alerts, profile updates and account deletion. They do not write to production or send email.

## Hosting

Render service uses branch `master`, build command `cd backend && npm install`, and start command `node backend/server.js`. The server listens on `0.0.0.0` and `PORT`. `/api/status` reports database and provider status. Public assets are explicitly allowlisted. Unknown pages return the custom 404 page.
