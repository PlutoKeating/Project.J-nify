# Profile & Settings / SafeArea / Deep-Link Callback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the J-nify Flutter app's status-bar/safe-area overlap, add a user-profile + settings page (nickname/password/email), fix the email confirmation callback that currently points to localhost:3000 via App Links, and make the "关于"/"隐私说明" sections collapsible.

**Architecture:** Frontend-only changes for SafeArea + collapsible sections; a small backend Worker addition (`GET/PUT /v1/me/profile`) for the nickname (the client has zero DB access under RLS, so writes must go through the service-key Worker); Deep Link handling via `app_links` + `auth.handleDeepLink` with app-side manifest/entitlement config and documented Supabase Dashboard Site URL / Additional Redirect URLs + hosted `/.well-known` verification assets on the Cloudflare Pages website domain.

**Tech Stack:** Flutter 3.47.1 / Dart 3.13.1, supabase_flutter 2.17.2, app_links (transitive via supabase_flutter), Cloudflare Workers (TS + Hono), Supabase (PostgREST + Auth), Cloudflare Pages website (React).

## Global Constraints

- Client (publishable/anon key) has **zero data access** under RLS (migration `0004`). Nickname writes MUST go through the backend Worker `service_key` (PostgREST `users` table).
- Nickname is stored in `public.users.nickname` (existing column, **non-unique** by design — SPEC §6 USER.nickname).
- Email comes from Supabase Auth (`auth.currentUser.email`), NOT the `users` table.
- Backend route convention: `Hono` app under `/v1`, all `GET/POST/PUT/DELETE` under `requireAuth` middleware (`app.ts`), `db` + `userId` set in context.
- Frontend API convention: `ApiService` wraps `ApiClient` (`get/post/put`); backend errors are `{"detail":"<msg>"}`.
- Supabase Auth email redirect uses `emailRedirectTo`/`RedirectTo`; the email template embeds `{{ .ConfirmationURL }}` (baked from Site URL). Changing the Supabase Dashboard Site URL + Additional Redirect URLs, and hosting `.well-known/assetlinks.json` + `apple-app-site-association` on the App Link domain, are **manual dashboard/deploy steps** documented for the user (cannot be done from the repo).
- Android package `com.jnify.jnify_app`; iOS bundle id `com.jnify.jnifyApp`.
- App Link host (single source): `https://j-nify.arr2018.dpdns.org` (official website, CF Pages, serves `/public` static files).
- No secrets in repo; no `.env` committed; `flutter analyze` / `flutter test` must stay clean; backend `npm test` + `npx tsc --noEmit` must stay clean.

## Deployment of App Link verification assets

App Link verification requires the signing cert SHA-256 (Android `assetlinks.json`) and Apple Team ID (AASA). These values are **not in the repo** (release keystore + Apple Team ID live in GH Secrets / password manager). The plan adds the correctly-formatted files under `website/public/.well-known/` with clearly-marked placeholder values and a dedicated operator doc (`docs/devops/email-callback.md`) telling the user exactly what to fill in. Do not ship a fabricated fingerprint.

---

### Task 1: Fix SafeArea overlap (Req 1)

**Covers:** [S1] (frontend canvas must avoid the system status bar / notch)

**Files:**
- Modify: `frontend/lib/screens/home_shell.dart` (wrap Scaffold body in `SafeArea`)

**Interfaces:**
- Consumes: nothing new.
- Produces: three screens (`NowScreen`/`AllScreen`/`MeScreen`) no longer render under the status bar.

- [ ] **Step 1: Edit `home_shell.dart`**

```dart
return Scaffold(
  // 避免刘海/状态栏遮挡；底部由 NavigationBar 自行处理安全区，故 bottom:false。
  body: SafeArea(top: true, bottom: false, child: _screens[_index]),
  bottomNavigationBar: NavigationBar(...),
);
```

- [ ] **Step 2: Verify** — `cd frontend && flutter analyze` (0 issues). Visual: the "全部"/"我的" headings now sit below the status bar.

- [ ] **Step 3: Commit**
```bash
git add frontend/lib/screens/home_shell.dart
git commit -m "fix(app): wrap HomeShell body in SafeArea to avoid status-bar/notch overlap"
```

---

### Task 2: Backend `GET/PUT /v1/me/profile` (Req 2 support)

**Covers:** [S2]

**Files:**
- Modify: `backend/src/routes/me.ts` (add GET/PUT `/profile`)
- Test: `backend/test/me.test.ts` (unit; auth/stub via same pattern as existing tests)

**Interfaces:**
- Consumes: `restGet`/`restUpdate` from `../db`; `c.get('userId')`; `c.get('db')`.
- Produces:
  - `GET /v1/me/profile` → `{ id, nickname }` (`nickname` may be null).
  - `PUT /v1/me/profile` body `{ nickname: string }` (1..64 chars, trimmed) → `{ id, nickname }`; 400 on missing/blank/too-long.

- [ ] **Step 1: Add routes to `me.ts`**

```ts
import { restDelete, restGet, restUpdate } from '../db';

const MAX_NICK = 64;
me.get('/profile', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const rows = await restGet<{ id: string; nickname: string | null }>(db, 'users', {
    select: 'id,nickname', params: { id: userId }, limit: 1,
  });
  const u = rows[0];
  return c.json({ id: u?.id ?? userId, nickname: u?.nickname ?? null });
});

me.put('/profile', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const body = await c.req.json<{ nickname?: unknown }>();
  if (typeof body.nickname !== 'string') return c.json({ detail: 'nickname 不能为空' }, 400);
  const nickname = body.nickname.trim();
  if (!nickname) return c.json({ detail: 'nickname 不能为空' }, 400);
  if (nickname.length > MAX_NICK) return c.json({ detail: `昵称最长 ${MAX_NICK} 个字符` }, 400);
  await restUpdate(db, 'users', { id: userId }, { nickname });
  return c.json({ id: userId, nickname });
});
```

- [ ] **Step 2: Add `/v1/me/profile` unit test** (mirror existing test harness; assert GET returns id+null, PUT persists a nickname, blank nickname → 400).

- [ ] **Step 3: Verify** — `cd backend && npx tsc --noEmit && npm test` (all green).

- [ ] **Step 4: Commit**
```bash
git add backend/src/routes/me.ts backend/test/me.test.ts
git commit -m "feat(backend): add GET/PUT /v1/me/profile for nickname updates"
```

---

### Task 3: Settings screen + profile card in "我的" (Req 2)

**Covers:** [S2]

**Files:**
- Modify: `frontend/lib/services/api_service.dart` (add `getProfile`/`updateNickname`)
- Modify: `frontend/lib/screens/me_screen.dart` (profile card + nickname/email display + settings entry + collapsible sections → Task 5)
- Create: `frontend/lib/screens/settings_screen.dart`
- Test: `frontend/test/me_screen_test.dart`, `frontend/test/settings_screen_test.dart` (widget, no network mocks per project policy)

**Interfaces:**
- Consumes: `ApiService` (new `getProfile`/`updateNickname`), `Supabase.instance.client.auth` (email/password/updateUser/reauthenticate).
- Produces: `SettingsScreen` with sections (昵称/邮箱/密码); profile card shows `nickname` + `email`; gear entry navigates to `SettingsScreen`.

- [ ] **Step 1: `api_service.dart`**

```dart
Future<Map<String, dynamic>> getProfile() async {
  final data = await _client.get('/v1/me/profile');
  return data as Map<String, dynamic>;
}

Future<Map<String, dynamic>> updateNickname(String nickname) async {
  final data = await _client.put('/v1/me/profile', body: {'nickname': nickname});
  return data as Map<String, dynamic>;
}
```

- [ ] **Step 2: `me_screen.dart`** — add profile header (CircleAvatar + nickname + email, gear `IconButton` → `Navigator.push(SettingsScreen())`). Load nickname via `_api.getProfile()`, email via `Supabase.instance.client.auth.currentUser?.email`.

- [ ] **Step 3: `settings_screen.dart`** — single page, sections:
  - 账户资料: nickname `TextField` + save; email display + "修改邮箱" flow.
  - 安全: 修改密码 (current + new password, reauthenticate then `updateUser({password})`).
  - Email change: `auth.updateUser({ email }, emailRedirectTo: AppConfig.appLinkVerify)` → on success show "确认邮件已发送到新邮箱".
  - Reauth guard: for email/password changes, prompt current password → `auth.signInWithPassword` (verify) before `updateUser`.

- [ ] **Step 4: Add widget tests** for nickname edit + password/email form presence.

- [ ] **Step 5: Verify** — `cd frontend && flutter analyze && flutter test` (all green).

- [ ] **Step 6: Commit**
```bash
git add frontend/lib/services/api_service.dart frontend/lib/screens/me_screen.dart frontend/lib/screens/settings_screen.dart frontend/test/me_screen_test.dart frontend/test/settings_screen_test.dart
git commit -m "feat(app): profile card + settings screen (nickname/password/email)"
```

---

### Task 4: Deep Link / App Link callback (Req 3)

**Covers:** [S3]

**Files:**
- Modify: `frontend/pubspec.yaml` (add `app_links` direct dep)
- Modify: `frontend/lib/main.dart` (subscribe `uriLinkStream` → `auth.handleDeepLink`)
- Modify: `frontend/lib/core/config/app_config.dart` (add `appLinkHost`/`appLinkVerify` consts)
- Modify: `frontend/lib/auth/auth_gate.dart` or a new `DeepLinkListener` (handle cold-start initial link)
- Modify: `frontend/android/app/src/main/AndroidManifest.xml` (App Links intent-filter, `autoVerify`)
- Modify: `frontend/ios/Runner/Info.plist` + a new `frontend/ios/Runner/Runner.entitlements` (associated domains) + `frontend/ios/Runner.xcodeproj/project.pbxproj` (entitlements ref) — OR document iOS as manual if signing absent
- Create: `website/public/.well-known/assetlinks.json` + `website/public/.well-known/apple-app-site-association` (placeholder values, documented)
- Create: `docs/devops/email-callback.md` (root cause + exact Dashboard steps + asset contents)

**Interfaces:**
- Consumes: `AppLinks` from `app_links`; `Supabase.instance.client.auth.handleDeepLink(Uri)`.
- Produces: signup/email-change redirect to `https://j-nify.arr2018.dpdns.org/auth/verify` (App Link) opens the app and exchanges the token.

- [ ] **Step 1: `pubspec.yaml`** — add `app_links: ^6.0.0` under dependencies; run `flutter pub get`.

- [ ] **Step 2: `app_config.dart`** — add
```dart
/// App Link 域名（与官网一致；用于邮件确认/重置回调与 Deep Link）。
static const appLinkHost = 'j-nify.arr2018.dpdns.org';
static const appLinkVerify = 'https://$appLinkHost/auth/verify';
```

- [ ] **Step 3: `main.dart` / deep-link listener** — after Supabase.initialize, subscribe:
```dart
final _appLinks = AppLinks();
_appLinks.uriLinkStream.listen((uri) {
  if (uri.host == AppConfig.appLinkHost) {
    Supabase.instance.client.auth.handleDeepLink(uri);
  }
});
```
Add a cold-start handler (in `AuthGate.initState` or a top-level `getInitialLink`) so a link that launched the app is also consumed.

- [ ] **Step 4: Android manifest** — add to `MainActivity`:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="https" android:host="j-nify.arr2018.dpdns.org" android:pathPrefix="/auth"/>
</intent-filter>
```

- [ ] **Step 5: iOS** — add `applinks:j-nify.arr2018.dpdns.org` associated domain + AASA hosting note. If the Xcode project has no signing/signing team, document as a manual step in `email-callback.md` rather than committing a broken entitlement (AGENTS.md: don't guess secrets).

- [ ] **Step 6: Website well-known files** — `website/public/.well-known/assetlinks.json`:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.jnify.jnify_app",
    "sha256_cert_fingerprints": ["REPLACE_WITH_RELEASE_SIGNING_SHA256"]
  }
}]
```
And `index` AASA (no extension):
```json
{
  "applinks": {
    "apps": [],
    "details": [
      { "appID": "REPLACE_WITH_TEAM_ID.com.jnify.jnifyApp", "paths": ["/auth/*"] }
    ]
  }
}
```
Add a `website/public/_redirects` note (CF Pages static passthrough of `/\.well-known/.*` does not need a redirect — confirm assets aren't rewritten by the SPA fallback; if so, exempt with an exact-match rule before the catch-all).

- [ ] **Step 7: `docs/devops/email-callback.md`** — root cause (Supabase Site URL = `http://localhost:3000`), exact Dashboard steps (Site URL + Additional Redirect URLs = `https://j-nify.arr2018.dpdns.org/auth/verify` and wildcard), the asset contents above, where to get the SHA-256 (from `keytool`/CI) and Apple Team ID.

- [ ] **Step 8: Verify** — `cd frontend && flutter analyze && flutter test`; `cd website && npm run build` succeeds. Commit.

```bash
git add frontend/pubspec.yaml frontend/pubspec.lock frontend/lib/main.dart frontend/lib/core/config/app_config.dart frontend/lib/auth/auth_gate.dart frontend/android/app/src/main/AndroidManifest.xml frontend/ios/Runner/Info.plist website/public/.well-known/assetlinks.json website/public/.well-known/apple-app-site-association docs/devops/email-callback.md
git commit -m "feat(app): email-callback via App Link deep link; fix localhost:3000 redirect root cause"
```

---

### Task 5: Collapsible 关于 / 隐私说明 (Req 4)

**Covers:** [S4]

**Files:**
- Modify: `frontend/lib/screens/me_screen.dart` (replace the two `ListTile`s + about block with `ExpansionTile`s, default collapsed)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ExpansionTile(key: ValueKey('about'))` and `ValueKey('privacy')`, `initiallyExpanded: false`.

- [ ] **Step 1: `me_screen.dart`** — convert the "隐私说明" ListTile and the "关于 J-nify" block into two `ExpansionTile`s with `initiallyExpanded: false`. Keep `Divider`s and the version/website text inside the about tile's `children`.

- [ ] **Step 2: Verify** — `cd frontend && flutter analyze && flutter test`.

- [ ] **Step 3: Commit**
```bash
git add frontend/lib/screens/me_screen.dart
git commit -m "feat(app): make 关于/隐私说明 collapsible (ExpansionTile), default collapsed"
```

---

### Task 6: Docs + release/deploy notes (Req 3 config summary) + final pass

**Covers:** [S5]

**Files:**
- Modify: `docs/ARCHITECTURE.md` (SafeArea/profile endpoint/auth-callback note)
- Modify: `docs/API.md` (add `GET/PUT /v1/me/profile`)
- Modify: `docs/devops/release.md` (App Link asset note: fingerprint/team-id required)
- Modify: `docs/HANDOVER.md` (state summary)

- [ ] **Step 1: Update docs** per above (concise, current-code-accurate, no stale content).
- [ ] **Step 2: Full verification** — `cd backend && npx tsc --noEmit && npm test`; `cd frontend && flutter analyze && flutter test`; `cd website && npm run build`.
- [ ] **Step 3: Commit** docs.
```bash
git add docs/ARCHITECTURE.md docs/API.md docs/devops/release.md docs/HANDOVER.md
git commit -m "docs: profile endpoint, app-link callback, safe-area, settings"
```

---

## Self-Review Notes

- **Spec coverage:** SafeArea → T1; profile/settings → T2/T3; deep link → T4; collapsible → T5; docs → T6. No uncovered sections, no dangling anchors.
- **Placeholder scan:** The only deliberate placeholders are in the App Link verification assets (SHA-256 / Team ID) — these are operator-supplied secrets-by-action and are clearly marked `REPLACE_WITH_...` in code and in the doc; they are not TBD plan steps.
- **Type consistency:** `AppConfig.appLinkHost`/`appLinkVerify`, `ApiService.getProfile/updateNickname`, `GET/PUT /v1/me/profile` shapes agree across T2/T3/T4.
