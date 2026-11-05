# Plan — Jielien E-Commerce CMS implementation

## Project context and guardrails
Node.js HTTP `server.mjs`, PostgreSQL17 + `pg`, vanilla JS/CSS `public/`, Docker compose. Legacy migration 001,002 immutable, existing users, products/variants, orders and movements preserved. UI rebrand does not require backend rewrite. Execute through independent test database, not running customer data. Refer to `.specify/memory/constitution.md` first.

## Technology approach
- Server: modularize route handlers/services only as necessary, keep existing API response compatibility; split new catalog/media/CMS/admin services into `lib/*` or `server/*` with explicit auth middleware.
- DB: forward-only numbered checksummed migrations, FK/UNIQUE/CHECK/indexes, old IDs and VND BIGINT intact; use PG transactions/row lock for stock/order/payment, optimistic `version` for editable content.
- Client: shared `brand.css` tokens loaded before `style.css`/`management.css`, reuse semantic components within existing JS or small modules, no unplanned full SPA replatform.
- Media: durable volume/object adapter with controlled upload, image optimization and metadata; internal file serving secured for drafts.
- SEO: server-side HTML/SSR or pre-render with proper 301/404, canonical, sitemap, Product/Article JSON-LD, no indexing LAN.
- Background: scheduled publisher uses PG `FOR UPDATE SKIP LOCKED` or advisory lock/lease, idempotent; initialize jobs only once; audit publish.

## Architecture gates
1. Baseline test report before coding; DB dump and restore drill before migrations.
2. P0 LAN and config gate.
3. P1 brand and a11y screenshot gate.
4. P2 catalog/CRUD and image gate.
5. P3 stock RBAC gate.
6. P4 CMS+SEO HTML crawler gate.
7. P5 admin/marketing/report gate.
8. P6 security/performance/operations gate.

## Risks and mitigations
- Existing routes rely on SKU variant slug: preserve and alias/301 rather than repurpose identifiers.
- Concurrent staff edits: add version check server and conflict UI, don't trust browser.
- Inconsistent SEO when rendered only JS shell: choose SSR/re-render by URL for core, test via `curl`.
- Data loss if destroying Docker PG volume: test restore, never `down -v`.
- PII exposure through public project/repo/cache: separate secrets & private endpoints, no real dumps/screenshots.
- Full feature list too large for one atomic PR: incremental PRs each usable and passing test; show remaining scope.

## Code baseline mapping
`server.mjs`, `lib/auth.mjs`, `lib/cart.mjs`, `db/store.mjs`, `db/migrate.mjs`, `db/migrations/*`, `public/app.js`, `public/admin.js`, `public/account.js`, `public/style.css`, `public/management.css`, `public/index.html`, `public/admin.html`, `public/account.html`, `public/catalog.json`, `compose.yaml`, `scripts/local.mjs`, `tests/*`, `docs/*`. New files are allowed and encouraged when responsible modularization.

## QA and rollback
Each PR requires `npm test`, relevant browser tests, isolated database migration, manual UAT, documented screenshots. Rollback code compatible with forward-migrated DB; if not feasible, stop before deploying production and plan restore with downtime approved by owner. Deploy public only after explicit authorization.
