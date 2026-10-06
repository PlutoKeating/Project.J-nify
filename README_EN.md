<div align="center">

# 🟠 J-nify

**Jennifer says: “Not urgent — but I’ll keep an eye on it.”**

Hand the small things that aren’t urgent but easy to forget to her — she’ll gently remind you at the moment that truly fits.

[中文](README.md) · [Website](https://j-nify.arr2018.dpdns.org) · [AGPL-3.0](LICENSE)

</div>

---

## Ever caught in this loop?

> Not urgent → set it aside → gone for good → deadline panic → too late

P people aren't unwilling to do well — it's that many things, once set down, genuinely evaporate. Until the last-hour all-nighter, or forgotten forever.

The classic to-do app's answer is "**ring at a set time + shame you with overdue red**". But that only makes you more anxious — and more likely to mute the notifications.

**J-nify takes a completely different path.**

## Jennifer isn't an alarm. She's a secretary who "keeps watch."

She won't set an alarm that says "must do it at 3 PM." She lets each of your things drift on **low battery** in the background, then waits for a real **window that fits**:

| Signal | When she shows up |
| --- | --- |
| 📅 Calendar gap | The 15 minutes you happen to be free |
| ☀️ Weather | Clear skies and a breeze — good for airing the quilt |
| 📍 On your way | You're heading out, and the locker is downstairs |
| 📱 Usage state | You've been scrolling 20 minutes — reply in passing |
| ⏳ Deadline distance | 10 days left — enough, not "too late" |

And every time she surfaces, she tells you **why now** — no reason, no nudge.

> 💡 **Core principle:** Jennifer doesn't solve "self-discipline." She solves timing and friction. She makes the next step small enough to finish in 30 seconds, and always leaves you a graceful exit.

## One line, and it's Jennifer's

Open the app and just say: "pay the card by month-end" / "air the quilt when you can" / "remind me to reply to Xiaoming."

She notes it, then disappears. When the **truly fitting** moment comes, she returns with the reason and the options:

- ✅ **Do it now** — fill the little hole while you're at it
- ⏰ **Later, another window** — she really won't bother you again
- 🚪 **Forget this one** — a graceful close, no shame
- 🛟 **Cover for me** — draft the extension / schedule a pickup / speak on your behalf

## Why "J-nify"?

**J-nify is the product's name** — literally "make a P person into a J": turn someone who plans weakly and tends to procrastinate into someone with more order.

**Jennifer** is the in-app agent, and the brand mascot. Her name is a near-homophone of "**J-nifier**" — the one who turns a P person into a J. She's a J-person assistant who truly understands P people: she doesn't force discipline on you, but translates J-type order into the "timing nudges" a P person can comfortably accept.

## Engineering implementation

| Layer | Tech | Notes |
| --- | --- | --- |
| Frontend | Flutter (Dart) + flutter_appauth | Sign-in with a PlutoKeating account (OIDC authorization code + PKCE); three-screen UI + capture/decision loop; prod backend default `https://j-nify.williamhvollita.dpdns.org` |
| Backend | **Cloudflare Worker**: TypeScript + Hono | Deploy = GitHub Actions `wrangler deploy` (auto on push to main) |
| Data | **jnify-data** (`data/`: Node 24 + Hono + node:sqlite, Docker) | 23 tables + 3 transactional operations; runs on the author's server (Shenzhen, China), reachable only by the Worker via Cloudflare Tunnel |
| Account | **PlutoKeating account** (`id.plutokeating.beer`) | One account shared by the author's products: email code / passkey / GitHub, no password |
| Modeling | 15 entities in SPEC §6 | USER / ITEM_COMMITMENT / OPPORTUNITY_WINDOW / NUDGE / DECISION … |

**Runtime secrets** live only on the backend: `JNIFY_DATA_URL` + `JNIFY_DATA_KEY` (CF Worker secrets); the app holds no server-side keys; no plaintext secrets in the repo.

**Where data lives (plainly):** items, decisions, memories and rhythm policies are stored in plain text in a database on the author's server in Shenzhen, China, protected by "only the Worker holds the service key, and every request is checked against your own account" plus server isolation. Jennifer needs to see item content when she uses a model, and Quetzal needs to read it once you authorize it. Raw signals (calendar / weather / location / usage) are processed only on the device.

## Quick start

**Data service + backend (local development):**

```bash
cd data && npm ci && npm run dev        # jnify-data on 127.0.0.1:8789
cd backend
npm ci                                  # install deps
cp .dev.vars.example .dev.vars          # already points at the local jnify-data
npx wrangler dev                        # run Worker locally
```

**Backend (deploy):** push `main` (changing `backend/**`) → GitHub Actions auto `wrangler deploy` to prod; or manually Actions → Deploy Backend → Run workflow.

**Frontend (Flutter):**

```bash
cd frontend
cp .env.example .env                    # optional: override BACKEND_BASE_URL (prod default is built in)
flutter pub get
flutter run
# Release packages: see docs/devops/release.md (tag vX.Y.Z auto-builds APK/AAB and publishes a GitHub Release)
```

📖 Full details in [`docs/QUICK_START.md`](docs/QUICK_START.md).

## Repository structure

```
frontend/      Flutter client (sign-in + three screens + capture/decision loop)
backend/       Cloudflare Worker backend (TS + Hono; data via jnify-data)
data/          jnify-data service (Node + SQLite, Docker; see data/README.md)
docs/          Docs: SPEC / ARCHITECTURE / API / QUICK_START / HANDOVER
docs/devops/   Release guide / alert SMTP / secrets registry
.github/       GitHub Actions (CI / backend & website deploy / app release / ops / production smoke)
LICENSE        AGPL-3.0
```

## Documentation

- 📘 [`docs/SPEC.md`](docs/SPEC.md) —— full project spec (data model / architecture / interaction / acceptance)
- 🏛️ [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) —— system architecture
- 🔌 [`docs/API.md`](docs/API.md) —— REST API
- 🚀 [`docs/QUICK_START.md`](docs/QUICK_START.md) —— quick start
- 🗂️ [`docs/HANDOVER.md`](docs/HANDOVER.md) —— project handoff (implementation / deployment / ops snapshot as of 2026-08-30)
- 📐 [`docs/compose/specs/2026-08-29-jennifer-agent-complete-spec.md`](docs/compose/specs/2026-08-29-jennifer-agent-complete-spec.md) —— Jennifer agent complete implementation spec (official doc set / MCP-style context / structured memory / streaming / change cards & undo / admin surface)

> Documentation freshness: `README`, `ARCHITECTURE`, `API`, `QUICK_START`, `data/README`, and `docs/devops/*` describe the current implementation and operations. Dated files under `docs/compose/plans|specs|reports` and `DECISION_QUESTIONNAIRE` are historical records. [`docs/HANDOVER.md`](docs/HANDOVER.md) stops at 2026-08-30; data and sign-in changed on 2026-10-07 (see `ARCHITECTURE` and `DECISION_REGISTER` §7), so its Supabase parts are out of date.

## Website

Product landing site: [https://j-nify.arr2018.dpdns.org](https://j-nify.arr2018.dpdns.org)

- Source: `website/` (Vite + React + TypeScript + React Router + Tailwind CSS 4)
- Content: Home (marketing) / Features / Download (reads the latest release live from GitHub Release, no redirect away)
- Deploy: GitHub Actions `deploy-website.yml` verifies and deploys `website/**` changes on `main` directly to Cloudflare Pages; custom domain `https://j-nify.arr2018.dpdns.org`
- Local preview: `cd website && npm ci && npm run dev`
- Full deploy & custom-domain config: [`docs/devops/website-deploy.md`](docs/devops/website-deploy.md)

## CI/CD & releases

- ✅ **CI gate** (`.github/workflows/ci.yml`): on push / PR, parallel checks —— data-service tests + type check, backend unit/type checks (incl. five integration tests: real Worker + in-process jnify-data + local fake JWKS), frontend analysis + tests, and website tests + lint + build.
- 🩺 **Production smoke** (`.github/workflows/smoke-production.yml`): daily/manual public-site, backend, read-only Admin API checks, plus Android-emulator launch verification.
- 📦 **Frontend auto build & release** (`.github/workflows/release-frontend.yml`): trigger on tag `vX.Y.Z`, verify the tag matches `frontend/pubspec.yaml`'s version, build Android APK/AAB (ubuntu, **fixed release-keystore signed**), and publish a GitHub Release; iOS archive (xcarchive, macos, unsigned — needs Apple cert). ⚠️ The `+N` in `pubspec.yaml` (= Android `versionCode`) must strictly increase per release (a decrease once blocked overlay installs); see [`docs/devops/release.md`](docs/devops/release.md).
- 🚢 **Backend deploy** (`.github/workflows/deploy-backend.yml`): on push to main (backend/**) auto `wrangler deploy`; the single prod backend Base URL = **`https://j-nify.williamhvollita.dpdns.org`**.
- 🗄️ **Data service**: on the server, `cd data && ./start.sh` starts / updates it (first run generates `.env` and the service key); daily backups, 7 kept. See [`data/README.md`](data/README.md).
- 📧 **Alert email**: Worker alerts go out over SMTP; see [`docs/devops/smtp.md`](docs/devops/smtp.md). Sign-in no longer sends email links (codes are sent by the PlutoKeating account service).
- 🔐 **Secrets registry**: all prod secrets live in GitHub Actions Secrets / Cloudflare Worker Secrets / `data/.env` on the server; no plaintext secrets in the repo; see [`docs/devops/SECRETS_REGISTRY.md`](docs/devops/SECRETS_REGISTRY.md).

## Roadmap

- ✅ **M0 Skeleton** (**v0.1.x released**) — capture → drift → manual window → four-choice loop; accounts/settings, email deep links, 30-day sessions (v0.1.5).
- ✅ **M0.5 + M1 (v0.2.0 released, 2026-08-29)** — local execution layer (local notifications + "never again"), four signal sources (screen usage / system calendar / weather / location, processed locally), local window engine, offline queue, natural-language chat (Jennifer agent harness), admin panel (hot-reloadable multi-provider LLM + metrics dashboard + alerts), reminder rhythm policies, anonymous metrics & closure rate.
- ✅ **M2 Jennifer brain (v0.3.0 released, 2026-08-29)** — official doc set (identity/workflow/tools + skills, admin-editable with hot reload), structured memory & per-user memory doc, MCP-style local data context, streaming chat, change cards with one-click undo, admin docs/memory/playground/cost dashboard, 15 tools incl. LLM-powered rescue drafts.
- ⏳ **M3 Gradual rollout** — metrics dashboard is in place (admin panel); seed-user recruiting and distribution later.

> **Status badges (H2)**: ✅ shipped · 🚧 in progress · ⏳ planned. Only shipped capabilities appear in marketing copy; planned ones live on the roadmap. See [`docs/DECISION_REGISTER.md`](docs/DECISION_REGISTER.md).

## License

This project is licensed under the [**GNU AGPL-3.0**](LICENSE). The full license text is in the root `LICENSE`.
