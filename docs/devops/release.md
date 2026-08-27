# 发布流程（RELEASE）

> 适用：J-nify 前端 APP（Android APK/AAB + iOS 归档）。后端部署**不在此流程内**（`deploy-backend.yml`：push main 自动 `wrangler deploy`）。

## 版本规范（唯一来源）

- **唯一版本来源**：`frontend/pubspec.yaml` 的 `version`（如 `0.1.0+1`；`+1` 为 Android build number）。
- 发布 tag = `v` + 去 build number：`0.1.0+1` → `v0.1.0`。
- 流水线第一步校验 tag 与 pubspec version 一致，**不一致即失败**。

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
| `app-release.apk` | Android 直接安装（未签名，侧载用） | `app-release.apk` |
| `app-release.aab` | Google Play 上架（未签名 keystore，需先接入签名） | `app-release.aab` |
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

## 当前签名状态（⚠️ 无签名）

- Android：调试签名占位，**不可上架**，可侧载内测。
- iOS：无签名，不可装真机；需 Apple Developer 证书/公证（接入步骤见下）。

## 签名接入（后续）

### Android
1. `keytool -genkey -v -keystore jnify-release.jks -alias jnify -keyalg RSA -keysize 2048 -validity 10000`（keystore 与口令**不入库**）。
2. GH Secrets：`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`。
3. `frontend/android/app/build.gradle.kts` release 类型读环境变量签名；`release-frontend.yml` android job 加写 keystore+签名步骤。
4. 更新台账与本文档签名状态。

### iOS
1. Apple Developer 建 App ID/证书（Distribution）/描述文件。
2. Secrets：`IOS_CERT_BASE64` / `IOS_CERT_PASSWORD` / `IOS_PROFILE_BASE64`。
3. ios job 改为 `flutter build ipa`（去 `--no-codesign`）+ `fastlane match`/`xcodebuild -exportArchive` 签名。
4. 更新台账与本文档。

## 回滚

- GitHub Release 为不可变快照：删 tag → 修 → 打新 tag 重新发布（推荐升版本号 `v0.1.1`）。
- 客户端回退：Release 页安装旧版；后端回滚 = 修复后 push main 重新部署（生产 URL 不变）。

## 相关文档

- CI：`.github/workflows/ci.yml`；后端部署：`.github/workflows/deploy-backend.yml`
- 密钥台账：`docs/devops/SECRETS_REGISTRY.md`；邮件/SMTP：`docs/devops/smtp.md`