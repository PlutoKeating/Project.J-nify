-- 护栏键唯一约束（评审建议，golden rule 迁移）
create unique index if not exists uq_user_preferences_user_scene_key
  on public.user_preferences (user_id, scene, key);
