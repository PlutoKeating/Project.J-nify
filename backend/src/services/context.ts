import type { Db } from '../db';
import { restRpc } from '../db';

export async function ingestSignal(
  db: Db,
  userId: string,
  input: { signalType: string; payload: Record<string, unknown>; occurredAt: Date },
): Promise<void> {
  await restRpc(db, 'fn_ingest_signal', {
    p_user_id: userId,
    p_signal_type: input.signalType,
    p_payload: input.payload,
    p_occurred_at: input.occurredAt.toISOString(),
  });
}