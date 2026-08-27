-- 数据安全加固（用户 2026-08-27 要求）：封死「解包 APK → 用 publishable key 直读数据」路径。
-- 方案：全表 RLS + 零 policy + 回收 anon/authenticated 权限 → 客户端角色对数据层零访问；
-- Worker 走 service_role（BYPASSRLS），业务不受影响。前端仅经 Auth 拿 JWT，永不直连数据层。

alter table public.users enable row level security;
alter table public.user_preferences enable row level security;
alter table public.integration_sources enable row level security;
alter table public.signal_events enable row level security;
alter table public.context_snapshots enable row level security;
alter table public.context_snapshot_signals enable row level security;
alter table public.item_commitments enable row level security;
alter table public.item_steps enable row level security;
alter table public.escalation_policies enable row level security;
alter table public.opportunity_windows enable row level security;
alter table public.message_templates enable row level security;
alter table public.nudges enable row level security;
alter table public.nudge_options enable row level security;
alter table public.decisions enable row level security;
alter table public.feedback enable row level security;
alter table public.memory_notes enable row level security;

-- 客户端角色（anon/authenticated）对 public 数据层的默认授权全部回收；
-- 不创建任何 RLS policy → 二者对每张表都是全拒（RLS 无 policy = deny all）。
-- service_role 具备 BYPASSRLS，Worker 读写完全不受影响。
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke usage on schema public from anon, authenticated;
-- authenticated 角色需要再授 schema usage 供后续按需加 policy（先不授，留最小面）——
-- 如需未来客户端直连，再加 policy + grant 具体权限（届时单独迁移）。