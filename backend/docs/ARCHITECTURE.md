# Backend 架构

模块化单体（modular monolith）。服务边界严格对应 SPEC §7.1。

## 服务边界

| 模块 | 输入 | 输出 | 不做 |
| --- | --- | --- | --- |
| Capture Service | raw_text/share/voice | ItemCommitment + 初始策略 | 不立刻生成计划压迫 |
| Context Engine | SignalEvent | ContextSnapshot | 不直接发通知 |
| Opportunity Window Engine | Item + Context + Preference | OpportunityWindow | 不生成文案 |
| Escalation Engine | Item 状态 + Decision 历史 + Policy | intensity / should_nudge | 不突破安静时段与预算 |
| Jennifer Brain | window + item + memory | title/body/options/rescue draft | 不决定何时打扰 |
| Notification Orchestrator | nudge job | sent/cancelled/replaced | 无理由不发送（reason gate） |
| Decision Feedback | decision + feedback | preference/memory update | 不用于羞辱排名 |

## 数据模型

`app/models.py` 严格对应 SPEC §6 的 15 个实体，字段与关系照 ER 图实现（用例映射见下表）。

| SPEC 关键字段 | 实体字段 | 设计原因 |
| --- | --- | --- |
| fit_score | OpportunityWindow.fit_score | 让 UI 只呈现最值得的一件事 |
| reason_code / reason_text | OpportunityWindow.reason_code / reason_text | 没有理由不通知 |
| abandon_cost | ItemCommitment.abandon_cost | 决定体面放弃还是升温兜底 |
| est_minutes | ItemCommitment.est_minutes | 只接受足够小的下一步 |
| nudge_count / max_nudges | EscalationPolicy.nudge_count / max_nudges | 反打扰红线 |
| effect_metrics | Decision.effect_metrics | 校准而非惩罚 |

## 端口与配置

后端作为独立云端部署单元，暴露**唯一端口**，全部由 `.env` 控制：

- `APP_HOST`（默认 `0.0.0.0`）
- `APP_PORT`（默认 `8000`）—— 唯一对外端口
- `DATABASE_URL`（默认 `sqlite:///./data/jnify.db`）

这保证后期把内网穿透挂到该端口即可映射到生产 URL，无需改动代码。
