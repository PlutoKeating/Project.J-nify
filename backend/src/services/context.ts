import type { Db } from '../db';
import { dbSchema as s } from '../db';

export async function ingestSignal(
  db: Db,
  userId: string,
  input: { signalType: string; payload: Record<string, unknown>; occurredAt: Date },
): Promise<void> {
  const occurredAt = input.occurredAt;
  const [signal] = await db
    .insert(s.signalEvents)
    .values({ userId, signalType: input.signalType, payload: input.payload, occurredAt })
    .returning({ id: s.signalEvents.id });
  const features = input.payload;
  const availability = features.free_slot ? 0.6 : 0.3;
  const friction = features.low_friction ? 0.2 : 0.7;
  const [snapshot] = await db
    .insert(s.contextSnapshots)
    .values({
      userId,
      snapshotKey: `${input.signalType}:${occurredAt.toISOString()}`,
      contextFeatures: features,
      availabilityScore: availability,
      frictionScore: friction,
    })
    .returning({ id: s.contextSnapshots.id });
  await db.insert(s.contextSnapshotSignals).values({ contextSnapshotId: snapshot.id, signalEventId: signal.id });
}
