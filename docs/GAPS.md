# J-nify 缺口登记（GAP REGISTER）

> 本文件汇总「暂不实现、条件成熟时补齐」的能力缺口与恢复条件（权威源：`docs/DECISION_REGISTER.md` §四）。运营/宣传侧新增项也在本文件登记。

## 功能缺口

| 编号 | 缺口 | 触发条件/备注 |
| --- | --- | --- |
| GAP-FCM | 后端主动推送（FCM/APNs） | 当前本地通知已覆盖核心体验；若需"后端跨端主动触达"，需 Firebase/APNs 凭据（Q3/Q9 定案不引入） |
| GAP-CAL-OAUTH | 第三方日历源：Google / Outlook / 飞书 / 钉钉 OAuth 接入 | 需各平台 OAuth 应用凭据（Client ID/Secret）与企业授权；provider 适配器框架已预留（Q4/Q6/Q11） |
| GAP-WECHAT | 微信消息/日程读取 | 个人微信无官方 API（企业微信会话存档为付费企业功能）；替代=分享到 J-nify / 手动录入 |
| GAP-EXPORT | 数据导出（JSON） | M3 再做（D4 定案） |
| GAP-IOS | iOS 安装包 / Universal Link / APNs | 需 Apple Developer 账号 + macOS 签名链路（I4 定案暂缓） |
| GAP-RATE-LIMIT | CF Rate Limiting 跨实例限流 | 单实例规模内进程内限流够用；多实例部署前接入（F2） |
| GAP-OFFLINE-CLOUD | 离线/弱网下云端同步冲突合并策略 | 本期离线队列为 last-write-wins；冲突合并后续细化 |
| GAP-DUAL-ENGINE | 本地窗口引擎与后端 /v1/now 双实现 | 执行层本地优先后，两端规则需保持同步；建议后续统一为共享规则文档 |
| GAP-TIANDITU-ROTATE | 轮换曾出现于公开 Git 历史的 `TIANDITU_KEY` | ✅ 可达历史已于 2026-08-30 重写并验证无剩余匹配；⏳ 仍需在供应商控制台轮换，再更新 GH Secret、同步 Worker 并运行生产冒烟 |

## 已解决的运维项（保留审计）

| 原编号 | 结果 |
| --- | --- |
| GAP-ADMIN-CREDS | ✅ `ADMIN_USERNAME` / `ADMIN_PASSWORD` 已于 2026-08-30 更新 GH Secrets、同步 CF Worker，并通过 Admin 只读生产冒烟；不再是功能缺口。 |
| GAP-GH_PAT | ✅ fine-grained PAT（仅 Issues read/write）已配置并同步 CF Worker；不再是功能缺口。 |

## 运营/宣传侧缺口

| 缺口 | 说明 | 状态 |
| --- | --- | --- |
| OpenWeather 署名义务 | 免费商用许可要求 App「关于/隐私」页与官网标注 "Weather by OpenWeather" | ✅ 已全部完成（官网 Footer + 隐私页；App「关于」页 v0.2.0 已补） |
| 内测计划 | 团队成员内测（F4 定案：邮件模板先不验证，内测时一起看） | 待用户安排 |
| 场景文案"示意"标注 | 官网场景卡片标注"示意，即将上线" | 已完成（H1/Q2） |
| iOS 发布说明 | 下载页已注明 iOS 未签名需 Apple 证书 | 保持 |

> 维护规则：任何"暂不实现"的决定必须同步登记到 `docs/DECISION_REGISTER.md` §四 与本文档；条件成熟时从本表移除并更新 README 路线图。
