import { getClient } from '../db/poolManager.js';

const MAX_SIGNALS_PER_PLAN = 20;

export async function appendCoachingSignal(
  userId: string,
  planId: string,
  sessionId: string | null,
  signalText: string
): Promise<void> {
  const trimmed = signalText.trim().slice(0, 500);
  if (!trimmed) return;
  const client = await getClient(userId);
  try {
    await client.query(
      `INSERT INTO training_coaching_signals (user_id, plan_id, session_id, signal_text)
       VALUES ($1, $2, $3, $4)`,
      [userId, planId, sessionId, trimmed]
    );
    await client.query(
      `DELETE FROM training_coaching_signals
       WHERE plan_id = $1 AND user_id = $2
         AND id NOT IN (
           SELECT id FROM training_coaching_signals
           WHERE plan_id = $1 AND user_id = $2
           ORDER BY created_at DESC
           LIMIT $3
         )`,
      [planId, userId, MAX_SIGNALS_PER_PLAN]
    );
  } finally {
    client.release();
  }
}

export async function listRecentCoachingSignals(
  userId: string,
  planId: string,
  limit = 5
): Promise<string[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query<{ signal_text: string }>(
      `SELECT signal_text FROM training_coaching_signals
       WHERE user_id = $1 AND plan_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, planId, limit]
    );
    return result.rows.map((row) => row.signal_text);
  } finally {
    client.release();
  }
}

export default { appendCoachingSignal, listRecentCoachingSignals };
