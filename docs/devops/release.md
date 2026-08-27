# 发布流程（RELEASE）

> 适用版本：J-nify 前端 APP（Android APK/AAB + iOS ipa）。
> 后端部署**不在此流程内**：生产后端维持 Cloudflare Dashboard git 集成（Root directory=`backend`，Worker 地址见下），GitHub Actions 只做 CI 门禁与前端打包发布。

## 版本规范（唯一来源）

- **唯一版本来源：`frontend/pubspec.yaml` 的 `version` 字段**（如 `0.1.0+1`）。
- 发布 tag 格式：`vX.Y.Z`（**不带 build number**，即 `0.1.0+1` 对应 tag `v0.1.0`）。
- 流水线会在打包前用 Python 提取 `pubspec.yaml` 的 version 并与 tag 比对：
  - 一致 → 继续构建；
  - **不一致 → 立即失败（exit 1），不产出任何产物**。
- 版本升级：先改 `frontend/pubspec.yaml` 的 `version` 并提交，再按新版本打 tag。

## 触发方式

```bash
# 1) 确认 frontend/pubspec.yaml 的 version 已更新并提交
# 2) 打 tag（tag 名必须 = v + pubspec version，如 version=0.1.0+1 则 tag=v0.1.0）
git tag v0.1.0
git push origin v0.1.0
```

推送 tag 后，GitHub Actions 自动运行 `.github/workflows/release-frontend.yml`：

```
validate（tag 与 pubspec version 一致？）
   ├── android（ubuntu）：flutter build apk --release + appbundle --release
   └── ios（macos-latest）：flutter build ipa --no-codesign
          └── release：创建 GitHub Release，挂载 APK / AAB / ipa 三个资产
```

> 前端生产构建无需 `.env`：`frontend/lib/core/config/app_config.dart` 的
> `prodBackendBaseUrl` 即生产后端默认值，未提供 `.env` 时自动使用它。
> **生产后端唯一 Base URL = `https://jnify.williamhvollita.dpdns.org`**（Cloudflare Worker，已配置）。

## 产物清单

| 产物 | 路径（构建产物，不入库） | 用途 |
| --- | --- | --- |
| APK | `frontend/build/app/outputs/flutter-apk/app-release.apk` | Android 直接安装 |
| AAB | `frontend/build/app/outputs/bundle/release/app-release.aab` | Google Play 上架 |
| IPA | `frontend/build/ios/ipa/*.ipa` | iOS 安装包（未签名） |

GitHub Release 资产名：`app-release.apk` / `app-release.aab` / `*.ipa`。

## 当前签名状态（⚠️ 无签名）

- **Android**：尚未配置 keystore，`--release` 构建实际使用调试签名占位。**不可上架 Google Play**，仅可用于内测安装。
- **iOS**：`flutter build ipa --no-codesign`，未签名，**无法直接安装到真机**；需开发者证书签名/公证。
- Release 正文与本文档均明确标注「无签名构建」，后续接入签名后再发布正式版。

## 签名接入步骤（后续执行，接入后正式发布）

### Android（keystore 签名）

1. 生成 keystore（本机执行，产物与口令**均不入库**）：
   ```bash
   keytool -genkey -v -keystore jnify-release.jks -alias jnify -keyalg RSA -keysize 2048 -validity 10000
   ```
2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 添加（值与 keystore 一起放入密码管理器）：
   - `ANDROID_KEYSTORE_BASE64`（keystore 文件 base64）
   - `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`
3. 修改 `frontend/android/app/build.gradle.kts`：release 构建类型读取上述 secret 环境变量完成签名（`v2SigningEnabled true`）。
4. `release-frontend.yml` 的 android job 增加「写 keystore 文件 + 签名」步骤。
5. 更新 `docs/devops/SECRETS_REGISTRY.md` 与本文档的签名状态。

### iOS（Apple 签名）

1. 在 Apple Developer 创建 App ID / 证书 / 描述文件（Release 用 Distribution）。
2. 证书 `.p12` 与描述文件以 GitHub Actions Secrets 存储（如 `IOS_CERT_BASE64` / `IOS_CERT_PASSWORD` / `IOS_PROFILE_BASE64`）。
3. `release-frontend.yml` 的 ios job 改为：`flutter build ipa`（去掉 `--no-codesign`）+ `fastlane match`/`xcodebuild -exportArchive` 签名。
4. 更新台账与本文档。

## 回滚说明

GitHub Release 是「tag + 资产」的不可变快照：

- **发现该版本有问题**：
  1. 删除/编辑该 Release 并移除误导资产，或直接删除 tag：
     ```bash
     git tag -d v0.1.0 && git push origin :refs/tags/v0.1.0
     ```
  2. 修复代码 → 按新版本号打新 tag（推荐 `v0.1.1`）重新发布；
  3. 若必须复用旧版本号，确认 pubspec 已改回旧版本后再重打 tag。
- **用户侧回滚**：客户端指向的生产后端不变（`https://jnify.williamhvollita.dpdns.org`），后端回滚走 Cloudflare Dashboard（历史部署/重传旧版本），与前端 Release 无关；客户端本身卸载重装上一版 APK/ipa 即可。

## 相关文档

- CI 门禁：`.github/workflows/ci.yml`（push/PR 自动跑后端 test+typecheck、前端 analyze+test）
- 密钥台账：`docs/devops/SECRETS_REGISTRY.md`
- 邮件/SMTP：`docs/devops/smtp.md`
