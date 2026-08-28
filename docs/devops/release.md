# 发布流程（RELEASE）

> 适用：J-nify 前端 APP（Android APK/AAB + iOS 归档）。后端部署**不在此流程内**（`deploy-backend.yml`：push main 自动 `wrangler deploy`）。

## 版本规范（唯一来源）

- **唯一版本来源**：`frontend/pubspec.yaml` 的 `version`（如 `0.1.0+1`；`+1` 为 Android build number）。
- 发布 tag = `v` + 去 build number：`0.1.0+1` → `v0.1.0`。
- 流水线第一步校验 tag 与 pubspec version 一致，**不一致即失败**。
- **About us 版本显示**：前端用 `package_info_plus` 从已安装包运行时读取 `version+buildNumber`，升版**只需改 pubspec**，无需手动同步显示；`AppConfig.appVersion` 仅作读取失败时的回退默认。

## 触发

```bash
# 1) 确 like pubspec version 已提交
# 2) 打 tag 推送
git tag v0.1.0 && git push origin v0.1.0
```

运行时：`validate`（版本比对）→ `android`（ubuntu：apk + appbundle --release，dart-define 注入 `SUPABASE_URL/SUPABASE_ANON_KEY` secrets）→ `ios`（macos：`--no-codesign` 产 xcarchive）→ `release`（**仅依赖 android**，iOS 失败不阻塞发布）→ GitHub Release。

## 产物与 Release 资产

| 产物 | 用途 | Release 资产名 |
| --- | --- | --- |
| `app-release.apk` | Android 直接安装（**release keystore 签名**，v0.1.2 起；可覆盖更新） | `app-release.apk` |
| `app-release.aab` | Google Play 上架（**release keystore 签名**） | `app-release.aab` |
| `Runner.xcarchive` | iOS 归档（CI 运行内 Artifacts，**不挂 Release**；需 Apple 签名后分发） | — |

> 前端构建在 `frontend/` 下运行；`upload-artifact@v4` 会自动**剥离共同根目录**——挂载到 Release 的通配须用被剥离后的相对结构（本次 v0.1.0 排坑后为 `android/flutter-apk/*.apk` 与 `android/bundle/release/*.aab`）。改路径前先 `unzip -l` 验证产物真实结构，避免反复重切 tag。

## 已踩的坑（记录，防重踩）

1. **upload-artifact@v4 剥离共同根目录**：`frontend/build/app/outputs/...` 上传后内容变 `flutter-apk/...` 与 `bundle/release/...`（V4 行为）。**解法**：以真实产物结构写 `files:`；拿捏不定时先下载 artifact zip 验结构。
2. **构建在 `frontend/` 子目录**：upload 路径与 release 挂载路径均需 `frontend/` 前缀（repo 根相对），此前漏前缀导致「构建成功但 Release 空」。
3. **`flutter build ipa --no-codesign` 不产 ipa**：只产 `Runner.xcarchive`。iOS 安装包必须 Apple 签名（后续接入）；Release 现挂 Android 产物。
4. **release 作业依赖**：`needs: [android]`（iOS 独立 job），保证 MVP 安装包发布不被签名类问题阻塞。
5. **tag 重切**：工作流修改后需 `git tag -d` + 删远端 tag + 重新打 tag 指向新提交（tag 内嵌工作流快照）。
6. **不要打断构建**：勿在 `flutter build`/gradle 运行中 kill 守护进程（会 assembleRelease 失败）；`/tmp FileAlreadyExistsException` 为良性告警；首次 release 构建较慢（R8）。
7. **发布前确认 GH Secrets**：`SUPABASE_URL` / `SUPABASE_ANON_KEY` 缺失会让 release 包指向 localhost（登录必坏）。
8. **App Link 验证资产（邮件回调，需真实值）**：邮件确认/重置回调用 `https://j-nify.arr2018.dpdns.org` App Link 唤起 App。由于 release 包用**固定签名**（见坑 10），`website/public/.well-known/assetlinks.json` 里的 `sha256_cert_fingerprints` 必须是**该 release 签名证书**的 SHA-256（`keytool -list -v -keystore <release.keystore> -alias <alias>`），否则 Android 不会静默唤起 App（走浏览器回退）。拿到指纹后替换进文件并部署 CF Pages；忘记替换 = 回调落到网站首页（功能不完整）。详见 `docs/devops/email-callback.md`。
9. **`.env` 缺失导致启动黑屏（v0.1.1 修复）**：`main()` 里 `AppConfig.load()` → `dotenv.load('.env')` 默认 `isOptional: false`，而 release APK 无 `.env` 资产（pubspec 未声明 assets、`.env` 在 .gitignore）→ `load()` 抛 `FileNotFoundError` → `runApp` 未执行 → **完全黑屏**。修复：`dotenv.load(fileName: '.env', isOptional: true)` 静默回退到编译期默认值（`String.fromEnvironment` + 内置 prod Base URL）。回归测试：`frontend/test/app_config_test.dart`。
9. **release 缺 `INTERNET` 权限致注册 DNS 失败（v0.1.2 修复）**：Flutter 默认模板只在 debug/profile manifest 声明 `INTERNET`，release 只合入 `src/main/AndroidManifest.xml` → release APK 无网络权限，任何网络请求（含 DNS 解析）立即失败（`Failed host lookup, errno=7`），与 WiFi/流量卡/代理无关、瞬间报错。修复=主清单声明 `<uses-permission android:name="android.permission.INTERNET"/>`；验证 `aapt dump permissions <apk>`。
10. **release 必须固定签名 keystore（v0.1.2 修复）**：release 用 `signingConfigs.getByName("debug")` 时，CI 每次全新 runner 生成**不同** debug keystore → 相邻版本签名不一致 → Android 拒绝覆盖安装（提示"版本有问题无法更新"）。修复=固定 release keystore（secrets `ANDROID_KEYSTORE_BASE64/PASSWORD/ALIAS/KEY_PASSWORD`；`build.gradle.kts` 读环境变量，未配置回退 debug 保本地构建）。⚠️ 首次换签名版本需用户**卸载重装一次**，之后签名固定可覆盖更新。
11. **GitHub Actions：`runner` 上下文不可用于 job 级 `env`（v0.1.2 踩坑）**：`jobs.<id>.env` 中写 `${{ runner.temp }}/...` 会致 workflow 解析失败（run 0s 失败、打 tag 不触发任何 run）。job 级 `env` 改用 `${{ github.workspace }}`（`runner` 仅 step 级可用）。改 workflow 后须重切 tag（见坑 5）。

## ⚠️ 版本号规则（versionCode 必须单调递增，防覆盖更新被拒）

- Flutter 用 `pubspec.yaml` 的 `version: <name>+<N>`：`<name>`=versionName，`+<N>`=Android **versionCode**（也=iOS `CFBundleVersion`）。
- **`+<N>` 必须随每次发版严格递增，且大于历史最大值**。Android 以此判定升级/降级：新包 `versionCode` 小于已装版本会返回 `INSTALL_FAILED_VERSION_DOWNGRADE`（安装时提示"即将安装的版本比已安装的版本落后"）。
- 历史已发布 versionCode：`v0.1.0=1`、`v0.1.1=2`、`v0.1.2=3`、`v0.1.3=1`、`v0.1.4=1`。⚠️ **v0.1.3/v0.1.4 误用 `+1`（versionCode=1 < v0.1.2 的 3），导致从 v0.1.2 覆盖安装 v0.1.4 被系统以"版本落后"拒绝**（本次修复背景）。故当前最大 versionCode=3，新版本必须 ≥ `+4`。
- 发版动作：改 `pubspec.yaml`（及 `lib/core/config/app_config.dart` 的 `appVersion` 回退值）→ commit → 打 `v<name>` tag → push tag（CI 校验 tag=pubspec 版本后构建并发布）。

## 当前签名状态（✅ 已接入固定 release 签名，v0.1.2 起）

> 当前最新版本：**v0.1.5**（已发布，2026-08-28；自 v0.1.2 起均为固定 release keystore 签名，可覆盖安装更新）。App Link 校验指纹（`website/public/.well-known/assetlinks.json`）取自该固定 release 证书：`9d9018a5…369d6b3`。
> 下一版：**v0.2.0**（M0.5+M1，实施中，versionCode 须 ≥ `+5`）。

- Android：**固定 release keystore 签名**（secrets：`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`）。**从 v0.1.2 起所有版本签名一致，可覆盖安装更新**；⚠️ 但因 v0.1.0/v0.1.1 为 debug 签名（每次 CI runner 各不相同），**从旧版升级到首个签名版（v0.1.2）仍需卸载重装一次**。
- iOS：无签名，不可装真机；需 Apple Developer 证书/公证（接入步骤见下）。

> keystore 与口令**不入库**：keystore/口令仅存 GH Secrets + 本机 `~/.android/jnify-release.jks`（`jnify-ks-pass.txt`）。**请务必备份**——丢失将无法再对已发布版本做覆盖更新（只能换新签名，用户需重装）。

## 签名接入（Android 已完成；iOS 待接）

### Android（✅ 已完成，v0.1.2 起生效）
1. 本机生成：`keytool -genkey -v -keystore ~/.android/jnify-release.jks -alias jnify -keyalg RSA -keysize 2048 -validity 10000`（keystore 与口令**不入库**，本机 `~/.android/jnify-ks-pass.txt`）。
2. GH Secrets 已设：`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`。
3. `frontend/android/app/build.gradle.kts` release 读环境变量签名（未配置时回退 debug，保证本地构建）；`release-frontend.yml` android job 解 keystore + 注入签名 env。
4. 台账已更新，本文档签名状态改为「已接入」。

> ⚠️ **备份 keystore**：`~/.android/jnify-release.jks` + `jnify-ks-pass.txt` 是长期签名资产。请备份到安全处；丢失将无法对已发布版本做覆盖更新，只能换新签名（老用户需重装）。

### iOS
1. Apple Developer 建 App ID/证书（Distribution）/描述文件。
2. Secrets：`IOS_CERT_BASE64` / `IOS_CERT_PASSWORD` / `IOS_PROFILE_BASE64`。
3. ios job 改为 `flutter build ipa`（去 `--no-codesign`）+ `fastlane match`/`xcodebuild -exportArchive` 签名。
4. 更新台账与本文档。

## 回滚

- GitHub Release 为不可变快照：删 tag → 修 → 打新 tag 重新发布（推荐升版本号，如 `v0.1.5`）。
- 客户端回退：Release 页安装旧版；后端回滚 = 修复后 push main 重新部署（生产 URL 不变）。

## 相关文档

- CI：`.github/workflows/ci.yml`；后端部署：`.github/workflows/deploy-backend.yml`
- 密钥台账：`docs/devops/SECRETS_REGISTRY.md`；邮件/SMTP：`docs/devops/smtp.md`
