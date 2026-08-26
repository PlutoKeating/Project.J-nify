export const DECISION_MESSAGES: Record<string, string> = {
  now: '完成。这个窗口有效，Jennifer 记住了。',
  later: '好，晚点。它不会消失，等下一个顺手窗口。',
  drop: '已体面放弃，这件事收口了。',
  rescue: '已接手兜底，需要真实动作时会先跟您确认。',
};

export function decisionMessage(decision: string): string {
  return DECISION_MESSAGES[decision] ?? '记下了。';
}

export function nextState(decision: string, currentStatus = ''): { status: string; closedAt: boolean; touchUpdatedAt: boolean } {
  switch (decision) {
    case 'now':
      return { status: 'done', closedAt: true, touchUpdatedAt: false };
    case 'drop':
      return { status: 'abandoned', closedAt: true, touchUpdatedAt: false };
    case 'later':
      // 同一事务内回 parked：Task 10 的 DB 层执行时先置 deferred 再回 parked 并 touch updated_at
      return { status: 'deferred', closedAt: false, touchUpdatedAt: true };
    case 'rescue':
      return { status: 'rescued', closedAt: false, touchUpdatedAt: false };
    default:
      return { status: currentStatus || decision, closedAt: false, touchUpdatedAt: false };
  }
}

export function effectMetrics(decision: string, reason: string): Record<string, unknown> {
  return { decision, reason };
}
