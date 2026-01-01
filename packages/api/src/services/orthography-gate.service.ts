import { Pool } from 'pg';

export interface OrthographyGateProgress {
  language: string;
  status: 'locked' | 'unlocked' | 'completed';
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GateRow {
  language: string;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export class OrthographyGateService {
  constructor(private readonly pool: Pool) {}

  async checkGateStatus(userId: string, language: string): Promise<boolean> {
    const gateResult = await this.pool.query<GateRow>(
      `SELECT status FROM user_orthography_gates
       WHERE user_id = $1 AND language = $2`,
      [userId, language]
    );

    if (gateResult.rows.length === 0) {
      await this.initializeGateForLanguage(userId, language);
      return false;
    }

    return gateResult.rows[0].status === 'completed';
  }

  async getGateProgress(userId: string, language: string): Promise<OrthographyGateProgress> {
    const gateResult = await this.pool.query<GateRow>(
      `SELECT language, status, completed_at, created_at, updated_at
       FROM user_orthography_gates
       WHERE user_id = $1 AND language = $2`,
      [userId, language]
    );

    if (gateResult.rows.length === 0) {
      await this.initializeGateForLanguage(userId, language);

      const newGateResult = await this.pool.query<GateRow>(
        `SELECT language, status, completed_at, created_at, updated_at
         FROM user_orthography_gates
         WHERE user_id = $1 AND language = $2`,
        [userId, language]
      );

      const gate = newGateResult.rows[0];
      return {
        language: gate.language,
        status: gate.status as 'locked' | 'unlocked' | 'completed',
        completedAt: gate.completed_at,
        createdAt: gate.created_at,
        updatedAt: gate.updated_at,
      };
    }

    const gate = gateResult.rows[0];
    return {
      language: gate.language,
      status: gate.status as 'locked' | 'unlocked' | 'completed',
      completedAt: gate.completed_at,
      createdAt: gate.created_at,
      updatedAt: gate.updated_at,
    };
  }

  async getAllGatesProgress(userId: string): Promise<OrthographyGateProgress[]> {
    const prefsResult = await this.pool.query<{ studied_languages: string[] }>(
      `SELECT studied_languages FROM user_preferences WHERE user_id = $1`,
      [userId]
    );

    if (prefsResult.rows.length === 0) {
      return [];
    }

    const languages = Array.isArray(prefsResult.rows[0].studied_languages)
      ? prefsResult.rows[0].studied_languages
      : [];

    const progressPromises = languages.map((lang: string) => this.getGateProgress(userId, lang));

    return Promise.all(progressPromises);
  }

  async initializeGateForLanguage(userId: string, language: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_orthography_gates (user_id, language, status)
       VALUES ($1, $2, 'locked')
       ON CONFLICT (user_id, language) DO NOTHING`,
      [userId, language]
    );
  }

  async markGateCompleted(userId: string, language: string): Promise<void> {
    await this.pool.query(
      `UPDATE user_orthography_gates
       SET status = 'completed',
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND language = $2`,
      [userId, language]
    );
  }

  async unlockGate(userId: string, language: string): Promise<void> {
    await this.pool.query(
      `UPDATE user_orthography_gates
       SET status = 'unlocked',
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND language = $2 AND status = 'locked'`,
      [userId, language]
    );
  }

  async bypassGate(userId: string, language: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_orthography_gates (user_id, language, status, completed_at)
       VALUES ($1, $2, 'completed', CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, language)
       DO UPDATE SET
         status = 'completed',
         completed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, language]
    );
  }

  async canAccessLevel(userId: string, language: string, cefrLevel: string): Promise<boolean> {
    if (cefrLevel === 'A0') {
      return true;
    }

    return this.checkGateStatus(userId, language);
  }

  async resetGate(userId: string, language: string): Promise<void> {
    await this.pool.query(
      `UPDATE user_orthography_gates
       SET status = 'locked',
           completed_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND language = $2`,
      [userId, language]
    );
  }
}
