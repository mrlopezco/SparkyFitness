import { getClient } from '../db/poolManager.js';

const TABLE_NAME = 'user_module_preferences';

export interface UserModulePreferencesRow {
  user_id: string;
  modules: Record<string, boolean>;
  created_at: Date;
  updated_at: Date;
}

async function getModulePreferences(
  userId: string
): Promise<UserModulePreferencesRow | null> {
  const client = await getClient(userId);
  try {
    const { rows } = await client.query(
      `SELECT user_id, modules, created_at, updated_at
       FROM ${TABLE_NAME}
       WHERE user_id = $1`,
      [userId]
    );
    if (rows.length === 0) return null;
    return {
      user_id: rows[0].user_id,
      modules: rows[0].modules ?? {},
      created_at: rows[0].created_at,
      updated_at: rows[0].updated_at,
    };
  } finally {
    client.release();
  }
}

async function upsertModulePreferences(
  userId: string,
  modules: Record<string, boolean>
): Promise<UserModulePreferencesRow> {
  const client = await getClient(userId);
  try {
    const { rows } = await client.query(
      `INSERT INTO ${TABLE_NAME} (user_id, modules)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id)
       DO UPDATE SET modules = EXCLUDED.modules, updated_at = NOW()
       RETURNING user_id, modules, created_at, updated_at`,
      [userId, JSON.stringify(modules)]
    );
    return {
      user_id: rows[0].user_id,
      modules: rows[0].modules ?? {},
      created_at: rows[0].created_at,
      updated_at: rows[0].updated_at,
    };
  } finally {
    client.release();
  }
}

export default {
  getModulePreferences,
  upsertModulePreferences,
};
