<div align="center">

# 🟠 J-nify

[[README.md]]

**Jennifer — Your low-key action secretary**

> Not urgent — but I'll keep an eye on it.

Hand the things that aren't urgent but easy to forget to Jennifer. She won't nag you — she only shows up at the moment that *truly fits*, and slides it gently to you.

**Do it now · Do it later · Forget it · Cover for me** — you always have a graceful way out.

[AGPL-3.0](LICENSE) · Flutter · Cloudflare Workers · Supabase

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
| Frontend | Flutter (Dart) + supabase_flutter | Auth (Supabase Auth); three-screen UI + capture/decision loop; prod backend default `https://jnify.williamhvollita.dpdns.org` |
| Backend | **Cloudflare Worker**: TypeScript + Hono | Deploy = GitHub Actions `wrangler deploy` (auto on push to main) |
| Data | **Supabase Postgres** (REST/PostgREST + RPC) | 15 entity tables + transactional RPC; full-table RLS (zero client-role data access) |
| Accounts/email | **Supabase Auth + prod SMTP** | Confirmation/reset via j_nify@yeah.net (smtp.yeah.net:465) |
| Modeling | 15 entities in SPEC §6 | USER / ITEM_COMMITMENT / OPPORTUNITY_WINDOW / NUDGE / DECISION … |

**Runtime secrets** live only on the backend: `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (CF Worker secrets); the frontend only uses a client-level publishable key for Auth; no plaintext secrets in the repo.

## Quick start

**Backend (local development):**

```bash
cd backend
npm ci                                  # install deps
cp .dev.vars.example .dev.vars          # fill SUPABASE_URL / SUPABASE_SERVICE_KEY / DATABASE_URL
npx wrangler dev                        # run Worker locally
```

**Backend (deploy):** push `main` (changing `backend/**`) → GitHub Actions auto `wrangler deploy` to prod; or manually Actions → Deploy Backend → Run workflow.

**Frontend (Flutter):**

```bash
cd frontend
cp .env.example .env                    # optional: override BACKEND_BASE_URL / SUPABASE_* (prod defaults are built in)
flutter pub get
flutter run
# Release packages: see docs/devops/release.md (tag vX.Y.Z auto-builds APK/AAB and publishes a GitHub Release)
```

📖 Full details in [`docs/QUICK_START.md`](docs/QUICK_START.md).

## Repository structure

```
frontend/      Flutter client (auth + three screens + capture/decision loop)
backend/       Cloudflare Worker backend (TS + Hono; Supabase REST/RPC data layer)
docs/          Docs: SPEC / ARCHITECTURE / API / QUICK_START / HANDOVER
docs/devops/   Release guide / SMTP / secrets registry
.github/       GitHub Actions (CI / backend deploy / frontend release)
LICENSE        AGPL-3.0
```

## Documentation

- 📘 [`docs/SPEC.md`](docs/SPEC.md) —— full project spec (data model / architecture / interaction / acceptance)
- 🏛️ [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) —— system architecture
- 🔌 [`docs/API.md`](docs/API.md) —— REST API
- 🚀 [`docs/QUICK_START.md`](docs/QUICK_START.md) —— quick start
- 🗂️ [`docs/HANDOVER.md`](docs/HANDOVER.md) —— project handoff (latest implementation / deployment / ops notes)

## Website

Product landing site: [https://j-nify.arr2018.dpdns.org](https://j-nify.arr2018.dpdns.org)

- Source: `website/` (Vite + React + TypeScript + React Router + Tailwind CSS 4)
- Content: Home (marketing) / Features / Download (reads the latest release live from GitHub Release, no redirect away)
- Deploy: Cloudflare Pages (git integration, auto publish on push `main`); custom domain `https://j-nify.arr2018.dpdns.org`
- Local preview: `cd website && npm ci && npm run dev`
- Full deploy & custom-domain config: [`docs/devops/website-deploy.md`](docs/devops/website-deploy.md)

## CI/CD & releases

- ✅ **CI gate** (`.github/workflows/ci.yml`): on push / PR, parallel checks —— backend `npm test` + typecheck, frontend `flutter analyze` + `flutter test`.
- 📦 **Frontend auto build & release** (`.github/workflows/release-frontend.yml`): trigger on tag `vX.Y.Z`, verify the tag matches `frontend/pubspec.yaml`'s version, build Android APK/AAB (ubuntu) and publish a GitHub Release; iOS archive (xcarchive, macos). `SUPABASE_URL/SUPABASE_ANON_KEY` injected into the build via GH Secrets (dart-define). See [`docs/devops/release.md`](docs/devops/release.md).
- 🚢 **Backend deploy** (`.github/workflows/deploy-backend.yml`): on push to main (backend/**) auto `wrangler deploy`; the single prod backend Base URL = **`https://jnify.williamhvollita.dpdns.org`**.
- 📧 **Email & SMTP** (Supabase custom SMTP, j_nify@yeah.net): live (confirm-email on); templates in [`docs/devops/smtp.md`](docs/devops/smtp.md).
- 🔐 **Secrets registry**: all prod secrets live in GitHub Actions Secrets / Cloudflare Worker Secrets / Supabase; no plaintext secrets in the repo; see [`docs/devops/SECRETS_REGISTRY.md`](docs/devops/SECRETS_REGISTRY.md).

## Roadmap

- ✅ **M0 Skeleton** — capture → drift → manual window → three-option loop (**v0.1.2 released**; Android packages in GitHub Releases; v0.1.0 → v0.1.1 fixed the black-screen startup: a missing `.env` caused `dotenv.load` to throw and `main` to crash; v0.1.2 fixed the missing `INTERNET` permission causing registration failure + fixed release signing for overlay updates)
- ⏳ **M1 Signals** — calendar / weather / coarse location / usage + anti-nag red lines (signal ingestion ready; real data sources to be connected)
- ⏳ **M2 Jennifer brain** — LLM multi-provider hot-reload model management (zero hardcoding on the deploy side)
- ⏳ **M3 Gradual rollout** — 100–300 seed users + metrics dashboard

## License

This project is licensed under the [**GNU AGPL-3.0**](LICENSE). The full license text is in the root `LICENSE`.
