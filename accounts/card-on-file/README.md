# Pay With Card on File — prototype build

A static build of the card-on-file prototype, for walking the demo journeys in
a browser. It is a prototype: every API call is answered by a fake backend
that runs inside the page and keeps its state in this browser's localStorage.
Stripe runs on a test publishable key (pk_test), so no card can be charged.
Nothing in this build points at The Atlantic's real systems: no accounts API,
analytics, consent manager, error reporting, support widget or PayPal.

- Source: theatlantic/accounts-frontend, branch `john/card-on-file-pages`, commit `9454c1f5898d16bd388e7bca5da8384b6d738dfd`
- Built: 2026-10-23 15:34 EDT
- Packaged: 2026-10-23 15:34 EDT
- Built by: `scripts/pages/build.sh` (env in `.env.pages`), packaged by `scripts/pages/package.sh`
- Base path: `/atlantic-prototypes/accounts/card-on-file/`

Deep links (for example `products/restart/`) rely on `404.html`, which
redirects into `index.html` and restores the path. GitHub Pages only serves a
custom 404 page from the site root, so deep links on the live site need this
`404.html` copied to the root of the library as well.

Do not edit files here by hand; rebuild from the source branch.
