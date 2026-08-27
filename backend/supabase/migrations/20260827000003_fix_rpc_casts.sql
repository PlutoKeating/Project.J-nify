-- 修复 RPC：availability/friction/salience 为 jsonb 列，须 to_jsonb 包装数值（42804 修复）
create or replace function public.fn_decide(
  p_item_id uuid,
  p_user_id uuid,
  p_decision text,
  p_reason text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_status text; v_closed_at timestamptz; v_now timestamptz := now();
begin
  v_status := case p_decision
    when 'now' then 'done'
    when 'drop' then 'abandoned'
    when 'later' then 'parked'
    when 'rescue' then 'rescued'
    else null end;
  if v_status is null then
    raise exception 'invalid decision: %', p_decision;
  end if;

  insert into public.decisions (user_id, item_id, decision, reason, effect_metrics, decided_at)
  values (p_user_id, p_item_id, p_decision, p_reason, jsonb_build_object('decision', p_decision, 'reason', p_reason), v_now);

  if p_decision = 'later' then
    update public.item_commitments set status='deferred', updated_at=v_now where id=p_item_id;
    update public.item_commitments set status='parked', updated_at=v_now + interval '1 millisecond' where id=p_item_id;
    v_status := 'parked';
  else
    v_closed_at := case when p_decision in ('now','drop') then v_now else null end;
    update public.item_commitments
      set status=v_status, closed_at=v_closed_at
      where id=p_item_id and user_id=p_user_id;
  end if;

  insert into public.memory_notes (user_id, item_id, memory_type, content, salience)
  values (p_user_id, p_item_id, 'decision_effect',
          'decision=' || p_decision || '; reason=' || p_reason,
          to_jsonb(case when p_decision = 'rescue' then 0.8 else 0.5 end));

  return jsonb_build_object('status', v_status);
end;
$$;

create or replace function public.fn_ingest_signal(
  p_user_id uuid,
  p_signal_type text,
  p_payload jsonb,
  p_occurred_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_signal_id uuid; v_snapshot_id uuid;
begin
  insert into public.signal_events (user_id, signal_type, payload, occurred_at)
  values (p_user_id, p_signal_type, p_payload, p_occurred_at) returning id into v_signal_id;

  insert into public.context_snapshots (user_id, snapshot_key, context_features, availability_score, friction_score)
  values (p_user_id, p_signal_type || ':' || p_occurred_at::text,
          p_payload,
          to_jsonb(case when p_payload ? 'free_slot' then 0.6 else 0.3 end),
          to_jsonb(case when p_payload ? 'low_friction' then 0.2 else 0.7 end))
  returning id into v_snapshot_id;

  insert into public.context_snapshot_signals (context_snapshot_id, signal_event_id)
  values (v_snapshot_id, v_signal_id);
end;
$$;