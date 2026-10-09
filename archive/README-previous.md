# IDLE — frontend control-plane simulation

A browser-only coordination MVP with a declared-capability registry, deterministic routing policy, concurrency reservations, execution traces, and saved fixture outputs. There is no remote backend, model inference, wallet, or token settlement.

## Open locally

Double-click `dist/index.html` to open the prebuilt app directly in your browser. Keep the other files in `dist` beside it. No installation or server is required for this mode. The bundled classic script avoids the browser's restrictions on JavaScript modules under `file://`.

## Develop and verify

From this project directory:

```sh
npm ci
npm run dev
npm run build
npm run check
npm test
```

Open http://localhost:4173. The development server rebuilds the browser bundle when source modules change. `npm run build` refreshes the prebuilt bundle for direct file opening and deployment. esbuild is a development dependency; the app has no runtime dependencies. `dist` is the complete static site.

## Product behavior

- Twenty sample agents expose declared capabilities and background concurrency occupancy.
- Online agents are Idle with zero occupied slots, Available with some free slots, or Busy when full. Offline agents offer no capacity.
- Auto routing first filters by capability and free slots, then ranks using 60% capacity ratio, 25% normalized fixture endpoint RTT, and 15% historical success. New agents use a neutral reliability prior. Scores rank endpoints; they do not measure answer quality.
- Manual routing honors the eligible endpoint selected by the user.
- Selection rechecks availability and reserves one slot. Every terminal outcome releases it.
- High/Normal/Low priority applies 250/650/1,150ms simulated admission delay; the demo runs one foreground task at a time.
- Successful run, agent timeout, and invalid-response scenarios exercise completion and failure. Cancellation is supported. Retry prepares a new trace linked to the original task.
- Actual browser timestamps measure routing, admission, execution, and verification. Phase durations sum to wall-clock duration.
- Six categories provide saved output fixtures. Verification validates the response envelope, not factual accuracy or model quality. Analysis output preserves registry state at output receipt.
- Agent registration validates names, endpoint aliases, declared capability names, runtime names, and concurrency limits. Checks never contact endpoints. New agents have no success rate before completed attempts.
- Online/offline management changes routing eligibility. Reserved agents cannot be made offline mid-execution.
- Network totals sum per-agent fixture archive counters and local outcomes. Timing averages use measured local traces. Offline capacity is excluded from utilization and Idle Score, which are weighted by online concurrency.
- Chart history is illustrative before the first saved local sample; recent samples come from registry state. Its final point equals current utilization.
- Heartbeats update simulated capacity; they never invent completed tasks. Pausing freezes the visible feed while execution and telemetry continue.

## Persistence

Agents, traces, events, and slot samples use `idle-devnet-v2` in browser storage. v0.4.2 snapshots are migrated; legacy outputs have no reconstructable result snapshot. Unfinished persisted tasks become Interrupted after reload and their reservations are released. All traces remain stored; the history view shows the latest 100. Clear local data using Documentation → Devnet → Reset local demo data.

Browser storage failures show a visible session-only notice. The demo is designed for one active tab, without multi-user synchronization, authentication, or a durable shared scheduler. Starting another tab is not a production coordination test.

## Project structure

- `dist/engine.js`: shared registry, metrics, routing, task state transitions, registration, and persistence.
- `dist/app.bundle.js`: generated classic browser script for both file opening and hosting.
- `dist/app.js`: source views, controls, dialogs, trace presentation, and clipboard actions.
- `dist/style.css`: responsive theme and reduced-motion support.
- `dist/logo.svg` / `dist/logo-wordmark.svg`: original symbol and geometric wordmark.
- `tests/engine.test.mjs`: behavioral regression tests using Node's built-in test runner.
- `AUDIT.md`: product credibility assessment, corrected inconsistencies, verification, and remaining limitations.

Fonts use Google Fonts with system fallbacks. Browser WebMCP tools are feature-detected. A supporting browser is needed to validate native WebMCP registration; the local test browser does not supply that capability.

## Optional browser audit

`tests/browser-audit.cjs` exercises the visible workflows and five viewport sizes. It requires Playwright in a separate test environment and a running local app. Point `IDLE_PLAYWRIGHT_PATH` at that installation; optionally set `IDLE_CHROME_PATH` to a Chrome executable and `IDLE_QA_OUTPUT` to an existing screenshot directory. The runtime app remains dependency-free.

## GitHub Pages

The prebuilt app uses relative asset URLs and hash navigation. It works at both an account root and a repository subpath such as `https://username.github.io/idle/`.

### Upload static files

Upload the **contents** of `dist` into the root of your GitHub repository, including `index.html`, `style.css`, `app.bundle.js`, the SVG logos, and `.nojekyll`. Under repository **Settings → Pages**, choose **Deploy from a branch**, the branch containing those files, and **/ (root)**. The entry file must be at the publishing root; uploading an enclosing `dist` folder and choosing repository root will not put the app at the site root.

### Deploy the source with GitHub Actions

Upload this project's source with `package.json` at the repository root. The included `.github/workflows/pages.yml` installs dependencies, builds, checks, tests, and deploys `dist` on pushes to `main`. Under **Settings → Pages**, choose **GitHub Actions**. If your default branch is different, adjust the workflow branch. No backend, secrets, custom domain, or absolute base URL are required.

Reference: [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Ambient simulation

Every five seconds while the page is visible, sample workers gain or release occupied slots. Some briefly become offline and return after a simulated 15-second heartbeat gap. User registrations, manual availability overrides, and agents involved in foreground execution are protected. These changes drive the same routing eligibility, metrics, slot snapshots, activity events, and Idle Score as actual local task transitions. Background activity never invents completed task counts.

The default Live chart shows a rolling two-minute view, with a slow 3.6-second transition between samples. Agent capacity bars and Idle Score follow the same cadence. Reduced-motion preferences disable the interpolation while retaining state updates.

Visitors arriving without a section hash open `#introduction`. Existing section links such as `#network` continue to open their destination. The header Twitter button opens X in a new tab; set its profile URL in `dist/index.html`.
