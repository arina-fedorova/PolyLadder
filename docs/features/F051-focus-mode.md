# F051: Focus Mode

**Feature Code**: F051
**Created**: 2025-12-17
**Phase**: 14 - Parallel Learning Support
**Status**: Not Started

---

## Description

Implement focus mode that temporarily restricts learning to one language for intensive practice.

## Success Criteria

- [ ] Focus mode toggle in settings
- [ ] Language selector for focus language
- [ ] Dashboard shows only focus language when enabled
- [ ] Practice sessions only include focus language
- [ ] Easy toggle on/off
- [ ] Focus language switchable anytime

---

## Tasks

### Task 1: Focus Mode Service

**File**: `packages/api/src/services/learning/focus-mode.service.ts`

**Description**: Service to manage focus mode settings and apply language filtering across all learning features. When enabled, all practice sessions, reviews, and learning content are restricted to the selected language.

**Implementation**:

```typescript
import { Pool } from 'pg';

interface FocusModeSettings {
  userId: string;
  enabled: boolean;
  focusLanguage: string | null;
  activatedAt: Date | null;
  lastToggled: Date;
}

interface FocusModeStats {
  totalFocusSessions: number;
  currentStreak: number; // Days with focus mode active
  longestStreak: number;
  totalFocusedMinutes: number;
  languageBreakdown: Array<{
    language: string;
    sessionsCount: number;
    minutesPracticed: number;
  }>;
}

export class FocusModeService {
  constructor(private pool: Pool) {}

  /**
   * Get focus mode settings for user
   */
  async getFocusModeSettings(userId: string): Promise<FocusModeSettings> {
    const result = await this.pool.query(
      `SELECT
         focus_mode_enabled,
         focus_language,
         focus_activated_at,
         focus_last_toggled
       FROM user_preferences
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User preferences not found');
    }

    const row = result.rows[0];

    return {
      userId,
      enabled: row.focus_mode_enabled || false,
      focusLanguage: row.focus_language || null,
      activatedAt: row.focus_activated_at ? new Date(row.focus_activated_at) : null,
      lastToggled: new Date(row.focus_last_toggled || new Date())
    };
  }

  /**
   * Enable focus mode for a specific language
   */
  async enableFocusMode(
    userId: string,
    language: string
  ): Promise<FocusModeSettings> {
    // Verify user is learning this language
    const languageCheck = await this.pool.query(
      `SELECT language FROM user_language_progress
       WHERE user_id = $1 AND language = $2 AND is_active = true`,
      [userId, language]
    );

    if (languageCheck.rows.length === 0) {
      throw new Error(`User is not actively learning ${language}`);
    }

    // Enable focus mode
    const result = await this.pool.query(
      `UPDATE user_preferences
       SET
         focus_mode_enabled = true,
         focus_language = $2,
         focus_activated_at = NOW(),
         focus_last_toggled = NOW()
       WHERE user_id = $1
       RETURNING
         focus_mode_enabled,
         focus_language,
         focus_activated_at,
         focus_last_toggled`,
      [userId, language]
    );

    const row = result.rows[0];

    // Log focus mode activation
    await this.pool.query(
      `INSERT INTO focus_mode_history (user_id, language, action, created_at)
       VALUES ($1, $2, 'enabled', NOW())`,
      [userId, language]
    );

    return {
      userId,
      enabled: row.focus_mode_enabled,
      focusLanguage: row.focus_language,
      activatedAt: new Date(row.focus_activated_at),
      lastToggled: new Date(row.focus_last_toggled)
    };
  }

  /**
   * Disable focus mode (return to parallel learning)
   */
  async disableFocusMode(userId: string): Promise<FocusModeSettings> {
    const result = await this.pool.query(
      `UPDATE user_preferences
       SET
         focus_mode_enabled = false,
         focus_last_toggled = NOW()
       WHERE user_id = $1
       RETURNING
         focus_mode_enabled,
         focus_language,
         focus_activated_at,
         focus_last_toggled`,
      [userId]
    );

    const row = result.rows[0];

    // Log focus mode deactivation
    await this.pool.query(
      `INSERT INTO focus_mode_history (user_id, language, action, created_at)
       VALUES ($1, $2, 'disabled', NOW())`,
      [userId, row.focus_language]
    );

    return {
      userId,
      enabled: row.focus_mode_enabled,
      focusLanguage: row.focus_language,
      activatedAt: row.focus_activated_at ? new Date(row.focus_activated_at) : null,
      lastToggled: new Date(row.focus_last_toggled)
    };
  }

  /**
   * Switch focus language (keeps focus mode enabled)
   */
  async switchFocusLanguage(
    userId: string,
    newLanguage: string
  ): Promise<FocusModeSettings> {
    // Verify user is learning the new language
    const languageCheck = await this.pool.query(
      `SELECT language FROM user_language_progress
       WHERE user_id = $1 AND language = $2 AND is_active = true`,
      [userId, newLanguage]
    );

    if (languageCheck.rows.length === 0) {
      throw new Error(`User is not actively learning ${newLanguage}`);
    }

    // Get current focus language for history
    const currentSettings = await this.getFocusModeSettings(userId);

    // Update focus language
    const result = await this.pool.query(
      `UPDATE user_preferences
       SET
         focus_language = $2,
         focus_activated_at = NOW(),
         focus_last_toggled = NOW()
       WHERE user_id = $1
       RETURNING
         focus_mode_enabled,
         focus_language,
         focus_activated_at,
         focus_last_toggled`,
      [userId, newLanguage]
    );

    const row = result.rows[0];

    // Log language switch
    await this.pool.query(
      `INSERT INTO focus_mode_history (user_id, language, action, created_at, metadata)
       VALUES ($1, $2, 'switched', NOW(), $3::jsonb)`,
      [
        userId,
        newLanguage,
        JSON.stringify({ from: currentSettings.focusLanguage })
      ]
    );

    return {
      userId,
      enabled: row.focus_mode_enabled,
      focusLanguage: row.focus_language,
      activatedAt: new Date(row.focus_activated_at),
      lastToggled: new Date(row.focus_last_toggled)
    };
  }

  /**
   * Apply focus mode filter to a language list
   * Returns filtered list if focus mode is enabled, otherwise returns original list
   */
  async applyFocusFilter(
    userId: string,
    languages: string[]
  ): Promise<string[]> {
    const settings = await this.getFocusModeSettings(userId);

    if (!settings.enabled || !settings.focusLanguage) {
      return languages; // No filtering
    }

    // Filter to only focus language if it's in the list
    if (languages.includes(settings.focusLanguage)) {
      return [settings.focusLanguage];
    }

    // Focus language not in provided list - return empty
    return [];
  }

  /**
   * Get focus mode statistics
   */
  async getFocusModeStats(userId: string): Promise<FocusModeStats> {
    // Total focus sessions (distinct days)
    const totalSessionsResult = await this.pool.query(
      `SELECT COUNT(DISTINCT DATE(created_at)) as total
       FROM focus_mode_history
       WHERE user_id = $1 AND action = 'enabled'`,
      [userId]
    );

    // Current streak (consecutive days with focus mode)
    const streakResult = await this.pool.query(
      `WITH focus_days AS (
         SELECT DISTINCT DATE(created_at) as focus_date
         FROM focus_mode_history
         WHERE user_id = $1 AND action = 'enabled'
         ORDER BY focus_date DESC
       ),
       streaks AS (
         SELECT
           focus_date,
           focus_date - (ROW_NUMBER() OVER (ORDER BY focus_date))::int AS streak_group
         FROM focus_days
       )
       SELECT COUNT(*) as current_streak
       FROM streaks
       WHERE streak_group = (
         SELECT streak_group FROM streaks ORDER BY focus_date DESC LIMIT 1
       )`,
      [userId]
    );

    // Longest streak
    const longestStreakResult = await this.pool.query(
      `WITH focus_days AS (
         SELECT DISTINCT DATE(created_at) as focus_date
         FROM focus_mode_history
         WHERE user_id = $1 AND action = 'enabled'
         ORDER BY focus_date
       ),
       streaks AS (
         SELECT
           focus_date,
           focus_date - (ROW_NUMBER() OVER (ORDER BY focus_date))::int AS streak_group
         FROM focus_days
       ),
       streak_counts AS (
         SELECT streak_group, COUNT(*) as streak_length
         FROM streaks
         GROUP BY streak_group
       )
       SELECT COALESCE(MAX(streak_length), 0) as longest_streak
       FROM streak_counts`,
      [userId]
    );

    // Total focused minutes (when focus mode was active)
    const focusedMinutesResult = await this.pool.query(
      `SELECT COALESCE(SUM(time_spent), 0) / 60 as total_minutes
       FROM practice_attempts pa
       JOIN user_preferences up ON up.user_id = pa.user_id
       WHERE pa.user_id = $1
         AND up.focus_mode_enabled = true
         AND pa.created_at >= up.focus_activated_at`,
      [userId]
    );

    // Language breakdown
    const languageBreakdownResult = await this.pool.query(
      `SELECT
         fmh.language,
         COUNT(DISTINCT DATE(fmh.created_at)) as sessions_count,
         COALESCE(SUM(pa.time_spent), 0) / 60 as minutes_practiced
       FROM focus_mode_history fmh
       LEFT JOIN practice_attempts pa ON pa.user_id = fmh.user_id
         AND pa.created_at >= fmh.created_at
         AND pa.created_at < COALESCE(
           (SELECT created_at FROM focus_mode_history
            WHERE user_id = fmh.user_id
              AND created_at > fmh.created_at
              AND action IN ('disabled', 'switched')
            ORDER BY created_at ASC
            LIMIT 1),
           NOW()
         )
       WHERE fmh.user_id = $1 AND fmh.action = 'enabled'
       GROUP BY fmh.language
       ORDER BY sessions_count DESC`,
      [userId]
    );

    return {
      totalFocusSessions: parseInt(totalSessionsResult.rows[0]?.total || '0'),
      currentStreak: parseInt(streakResult.rows[0]?.current_streak || '0'),
      longestStreak: parseInt(longestStreakResult.rows[0]?.longest_streak || '0'),
      totalFocusedMinutes: parseFloat(focusedMinutesResult.rows[0]?.total_minutes || '0'),
      languageBreakdown: languageBreakdownResult.rows.map(r => ({
        language: r.language,
        sessionsCount: parseInt(r.sessions_count),
        minutesPracticed: parseFloat(r.minutes_practiced)
      }))
    };
  }

  /**
   * Get focus mode history
   */
  async getFocusModeHistory(
    userId: string,
    limit: number = 30
  ): Promise<Array<{
    language: string;
    action: 'enabled' | 'disabled' | 'switched';
    timestamp: Date;
    metadata?: any;
  }>> {
    const result = await this.pool.query(
      `SELECT language, action, created_at, metadata
       FROM focus_mode_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(r => ({
      language: r.language,
      action: r.action,
      timestamp: new Date(r.created_at),
      metadata: r.metadata
    }));
  }
}
```

**Database Schema Extensions**:

```sql
-- Extend user_preferences table with focus mode fields
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS
  focus_mode_enabled BOOLEAN DEFAULT false,
  focus_language VARCHAR(20),
  focus_activated_at TIMESTAMP,
  focus_last_toggled TIMESTAMP;

-- Focus mode history tracking
CREATE TABLE focus_mode_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language VARCHAR(20) NOT NULL,
  action VARCHAR(20) CHECK (action IN ('enabled', 'disabled', 'switched')),
  metadata JSONB, -- Additional data (e.g., previous language on switch)
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_focus_mode_history_user ON focus_mode_history(user_id, created_at DESC);
CREATE INDEX idx_focus_mode_history_language ON focus_mode_history(language);
```

**Key Features**:
1. **Focus Mode Toggle**: Enable/disable with automatic timestamp tracking
2. **Language Switching**: Change focus language while keeping mode enabled
3. **Filter Application**: Helper method to filter language lists based on focus settings
4. **Statistics**: Track streaks, total sessions, practice time per language
5. **History**: Complete audit trail of all focus mode changes

---

### Task 2: Focus Mode API Endpoints

**File**: `packages/api/src/routes/learning/focus-mode.routes.ts`

**Description**: RESTful API endpoints for managing focus mode settings, switching languages, and retrieving statistics.

**Implementation**:

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FocusModeService } from '../../services/learning/focus-mode.service.ts';

// Request/Response Schemas
const EnableFocusModeSchema = z.object({
  language: z.string().min(2).max(20)
});

const SwitchFocusLanguageSchema = z.object({
  language: z.string().min(2).max(20)
});

const GetHistoryQuerySchema = z.object({
  limit: z.string().transform(val => parseInt(val, 10)).optional()
});

export async function focusModeRoutes(fastify: FastifyInstance) {
  const focusModeService = new FocusModeService(fastify.pg.pool);

  /**
   * GET /learning/focus/settings
   * Get current focus mode settings
   */
  fastify.get('/learning/focus/settings', {
    schema: {
      response: {
        200: z.object({
          enabled: z.boolean(),
          focusLanguage: z.string().nullable(),
          activatedAt: z.string().nullable(),
          lastToggled: z.string()
        })
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.id;

    try {
      const settings = await focusModeService.getFocusModeSettings(userId);

      return reply.status(200).send({
        enabled: settings.enabled,
        focusLanguage: settings.focusLanguage,
        activatedAt: settings.activatedAt?.toISOString() || null,
        lastToggled: settings.lastToggled.toISOString()
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to fetch focus mode settings',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /learning/focus/enable
   * Enable focus mode for a specific language
   */
  fastify.post('/learning/focus/enable', {
    schema: {
      body: EnableFocusModeSchema,
      response: {
        200: z.object({
          enabled: z.boolean(),
          focusLanguage: z.string().nullable(),
          activatedAt: z.string().nullable(),
          message: z.string()
        })
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.id;
    const { language } = request.body;

    try {
      const settings = await focusModeService.enableFocusMode(userId, language);

      return reply.status(200).send({
        enabled: settings.enabled,
        focusLanguage: settings.focusLanguage,
        activatedAt: settings.activatedAt?.toISOString() || null,
        message: `Focus mode enabled for ${language}`
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(400).send({
        error: 'Failed to enable focus mode',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /learning/focus/disable
   * Disable focus mode (return to parallel learning)
   */
  fastify.post('/learning/focus/disable', {
    schema: {
      response: {
        200: z.object({
          enabled: z.boolean(),
          message: z.string()
        })
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.id;

    try {
      const settings = await focusModeService.disableFocusMode(userId);

      return reply.status(200).send({
        enabled: settings.enabled,
        message: 'Focus mode disabled. Returned to parallel learning.'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to disable focus mode',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /learning/focus/switch
   * Switch to a different focus language (keeps focus mode enabled)
   */
  fastify.post('/learning/focus/switch', {
    schema: {
      body: SwitchFocusLanguageSchema,
      response: {
        200: z.object({
          enabled: z.boolean(),
          focusLanguage: z.string().nullable(),
          activatedAt: z.string().nullable(),
          message: z.string()
        })
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.id;
    const { language } = request.body;

    try {
      const settings = await focusModeService.switchFocusLanguage(userId, language);

      return reply.status(200).send({
        enabled: settings.enabled,
        focusLanguage: settings.focusLanguage,
        activatedAt: settings.activatedAt?.toISOString() || null,
        message: `Switched focus to ${language}`
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(400).send({
        error: 'Failed to switch focus language',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /learning/focus/stats
   * Get focus mode statistics
   */
  fastify.get('/learning/focus/stats', {
    schema: {
      response: {
        200: z.object({
          totalFocusSessions: z.number(),
          currentStreak: z.number(),
          longestStreak: z.number(),
          totalFocusedMinutes: z.number(),
          languageBreakdown: z.array(z.object({
            language: z.string(),
            sessionsCount: z.number(),
            minutesPracticed: z.number()
          }))
        })
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.id;

    try {
      const stats = await focusModeService.getFocusModeStats(userId);

      return reply.status(200).send(stats);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to fetch focus mode stats',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /learning/focus/history
   * Get focus mode history
   */
  fastify.get('/learning/focus/history', {
    schema: {
      querystring: GetHistoryQuerySchema,
      response: {
        200: z.object({
          history: z.array(z.object({
            language: z.string(),
            action: z.enum(['enabled', 'disabled', 'switched']),
            timestamp: z.string(),
            metadata: z.any().optional()
          }))
        })
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.id;
    const { limit } = request.query;

    try {
      const history = await focusModeService.getFocusModeHistory(
        userId,
        limit || 30
      );

      return reply.status(200).send({
        history: history.map(h => ({
          language: h.language,
          action: h.action,
          timestamp: h.timestamp.toISOString(),
          metadata: h.metadata
        }))
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to fetch focus mode history',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
```

**API Endpoints Summary**:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/learning/focus/settings` | Get current focus mode settings |
| POST | `/learning/focus/enable` | Enable focus mode for a language |
| POST | `/learning/focus/disable` | Disable focus mode |
| POST | `/learning/focus/switch` | Switch focus language |
| GET | `/learning/focus/stats` | Get statistics (streaks, time) |
| GET | `/learning/focus/history` | Get history of focus mode changes |

**Key Features**:
1. **Simple Enable/Disable**: One-click toggle for focus mode
2. **Language Switching**: Change focus without disabling mode
3. **Statistics Tracking**: Streaks, total sessions, practice time
4. **History Audit**: Complete log of all focus mode changes
5. **Validation**: Ensures user is learning the selected language

---

### Task 3: Focus Mode UI Component

**File**: `packages/web/src/components/FocusModeControl.tsx`

**Description**: React component for managing focus mode with toggle, language selector, and statistics display. Integrates into main navigation and settings.

**Implementation**:

```typescript
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface FocusModeSettings {
  enabled: boolean;
  focusLanguage: string | null;
  activatedAt: string | null;
  lastToggled: string;
}

interface FocusModeStats {
  totalFocusSessions: number;
  currentStreak: number;
  longestStreak: number;
  totalFocusedMinutes: number;
  languageBreakdown: Array<{
    language: string;
    sessionsCount: number;
    minutesPracticed: number;
  }>;
}

interface UserLanguage {
  language: string;
  languageName: string;
  nativeName: string;
  proficiencyScore: number;
}

const LANGUAGE_NAMES: Record<string, string> = {
  'ru': 'Russian',
  'zh': 'Chinese',
  'ar': 'Arabic',
  'es': 'Spanish',
  'it': 'Italian',
  'fr': 'French',
  'de': 'German',
  'pt': 'Portuguese',
  'ja': 'Japanese',
  'ko': 'Korean'
};

const LANGUAGE_COLORS: Record<string, string> = {
  'ru': 'bg-red-100 text-red-800 border-red-300',
  'zh': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'ar': 'bg-green-100 text-green-800 border-green-300',
  'es': 'bg-orange-100 text-orange-800 border-orange-300',
  'it': 'bg-blue-100 text-blue-800 border-blue-300',
  'fr': 'bg-purple-100 text-purple-800 border-purple-300',
  'de': 'bg-indigo-100 text-indigo-800 border-indigo-300',
  'pt': 'bg-pink-100 text-pink-800 border-pink-300'
};

export function FocusModeControl() {
  const queryClient = useQueryClient();
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);

  // Fetch focus mode settings
  const { data: settings, isLoading: settingsLoading } = useQuery<FocusModeSettings>({
    queryKey: ['focus-mode-settings'],
    queryFn: async () => {
      const response = await api.get('/learning/focus/settings');
      return response.data;
    }
  });

  // Fetch user's active languages
  const { data: languagesData } = useQuery<{ languages: UserLanguage[] }>({
    queryKey: ['user-languages'],
    queryFn: async () => {
      const response = await api.get('/learning/languages');
      return response.data;
    }
  });

  // Fetch stats
  const { data: stats } = useQuery<FocusModeStats>({
    queryKey: ['focus-mode-stats'],
    queryFn: async () => {
      const response = await api.get('/learning/focus/stats');
      return response.data;
    },
    enabled: settings?.enabled || false
  });

  // Enable focus mode
  const enableFocusMode = useMutation({
    mutationFn: async (language: string) => {
      const response = await api.post('/learning/focus/enable', { language });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['focus-mode-settings'] });
      queryClient.invalidateQueries({ queryKey: ['focus-mode-stats'] });
      setShowLanguageSelector(false);
    }
  });

  // Disable focus mode
  const disableFocusMode = useMutation({
    mutationFn: async () => {
      const response = await api.post('/learning/focus/disable');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['focus-mode-settings'] });
    }
  });

  // Switch focus language
  const switchFocusLanguage = useMutation({
    mutationFn: async (language: string) => {
      const response = await api.post('/learning/focus/switch', { language });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['focus-mode-settings'] });
      queryClient.invalidateQueries({ queryKey: ['focus-mode-stats'] });
      setShowLanguageSelector(false);
    }
  });

  const handleToggleFocusMode = () => {
    if (settings?.enabled) {
      // Disable focus mode
      disableFocusMode.mutate();
    } else {
      // Show language selector to enable
      setShowLanguageSelector(true);
    }
  };

  const handleSelectLanguage = (language: string) => {
    if (settings?.enabled && settings.focusLanguage === language) {
      return; // Already focused on this language
    }

    if (settings?.enabled) {
      // Switch to new language
      switchFocusLanguage.mutate(language);
    } else {
      // Enable focus mode with this language
      enableFocusMode.mutate(language);
    }
  };

  if (settingsLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
        <div className="text-sm text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Focus Mode Toggle */}
      <div className="flex items-center justify-between p-4 bg-white rounded-lg shadow">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">Focus Mode</h3>
          <p className="text-sm text-gray-600">
            {settings?.enabled
              ? `Practicing ${LANGUAGE_NAMES[settings.focusLanguage || '']} exclusively`
              : 'Practice all languages (parallel learning)'}
          </p>
        </div>
        <button
          onClick={handleToggleFocusMode}
          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
            settings?.enabled ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
              settings?.enabled ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Current Focus Language Display */}
      {settings?.enabled && settings.focusLanguage && (
        <div className="p-4 bg-white rounded-lg shadow">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900">Current Focus</h4>
            <button
              onClick={() => setShowLanguageSelector(!showLanguageSelector)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Change Language
            </button>
          </div>
          <div className={`inline-block px-4 py-2 rounded-lg font-semibold border-2 ${LANGUAGE_COLORS[settings.focusLanguage]}`}>
            {LANGUAGE_NAMES[settings.focusLanguage]}
          </div>

          {/* Focus Session Stats */}
          {stats && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-gray-50 rounded">
                <div className="text-2xl font-bold text-gray-900">{stats.currentStreak}</div>
                <div className="text-xs text-gray-600">Day Streak</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                <div className="text-2xl font-bold text-gray-900">{stats.totalFocusSessions}</div>
                <div className="text-xs text-gray-600">Sessions</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                <div className="text-2xl font-bold text-gray-900">
                  {Math.round(stats.totalFocusedMinutes)}
                </div>
                <div className="text-xs text-gray-600">Minutes</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Language Selector */}
      {(showLanguageSelector || !settings?.enabled) && languagesData && (
        <div className="p-4 bg-white rounded-lg shadow">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900">Select Focus Language</h4>
            {showLanguageSelector && (
              <button
                onClick={() => setShowLanguageSelector(false)}
                className="text-sm text-gray-600 hover:text-gray-700"
              >
                Cancel
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {languagesData.languages.map((lang) => (
              <button
                key={lang.language}
                onClick={() => handleSelectLanguage(lang.language)}
                disabled={enableFocusMode.isPending || switchFocusLanguage.isPending}
                className={`px-4 py-3 rounded-lg border-2 font-semibold transition-all ${
                  settings?.focusLanguage === lang.language
                    ? LANGUAGE_COLORS[lang.language]
                    : 'border-gray-300 hover:border-gray-400'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="text-sm">{LANGUAGE_NAMES[lang.language]}</div>
                <div className="text-xs text-gray-600 mt-1">
                  {Math.round(lang.proficiencyScore)}% proficiency
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Focus Mode Benefits */}
      {!settings?.enabled && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-semibold text-blue-900 mb-2">Why Use Focus Mode?</h4>
          <ul className="space-y-1 text-sm text-blue-800">
            <li>• Deep immersion in one language</li>
            <li>• Build stronger neural pathways</li>
            <li>• Reduce language switching fatigue</li>
            <li>• Perfect for intensive study sessions</li>
          </ul>
        </div>
      )}

      {/* Quick Tips */}
      {settings?.enabled && (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <h4 className="font-semibold text-green-900 mb-2">Focus Mode Active</h4>
          <p className="text-sm text-green-800">
            All practice sessions will use {LANGUAGE_NAMES[settings.focusLanguage || '']} only.
            Toggle off to return to parallel learning.
          </p>
        </div>
      )}
    </div>
  );
}
```

**Additional Component**: Compact Focus Mode Indicator for Navigation

```typescript
// packages/web/src/components/FocusModeIndicator.tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface FocusModeSettings {
  enabled: boolean;
  focusLanguage: string | null;
}

const LANGUAGE_NAMES: Record<string, string> = {
  'ru': 'Russian',
  'zh': 'Chinese',
  'ar': 'Arabic',
  'es': 'Spanish',
  'it': 'Italian',
  'fr': 'French',
  'de': 'German',
  'pt': 'Portuguese'
};

export function FocusModeIndicator() {
  const { data: settings } = useQuery<FocusModeSettings>({
    queryKey: ['focus-mode-settings'],
    queryFn: async () => {
      const response = await api.get('/learning/focus/settings');
      return response.data;
    }
  });

  if (!settings?.enabled || !settings.focusLanguage) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
      <span className="inline-block w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
      <span>Focus: {LANGUAGE_NAMES[settings.focusLanguage]}</span>
    </div>
  );
}
```

**Integration Points**:

1. **Settings Page**: Full `FocusModeControl` component
2. **Navigation Bar**: Compact `FocusModeIndicator`
3. **Practice Session Start**: Check focus mode and filter languages
4. **Dashboard**: Show focus mode badge if enabled

**Component Features**:
1. **One-Click Toggle**: Simple switch to enable/disable
2. **Language Selector**: Grid of available languages with proficiency scores
3. **Statistics Display**: Current streak, total sessions, practice time
4. **Visual Feedback**: Color-coded language badges, pulsing indicator
5. **Quick Switch**: Change focus language without disabling mode
6. **Benefits Display**: Explains why to use focus mode

---

## Open Questions

### 1. **Focus Mode Persistence Across Sessions**
- **Question**: Should focus mode automatically disable after a certain period (e.g., 24 hours) or persist indefinitely until manually disabled?
- **Options**:
  - Persist indefinitely (user must manually toggle off)
  - Auto-disable after 24 hours of inactivity
  - Add expiration setting (user chooses duration: 1 day, 1 week, indefinite)
- **Recommendation**: Persist indefinitely. Users who want focus mode likely want it to stay on until they explicitly turn it off.

### 2. **Focus Mode During Mixed Practice**
- **Question**: What happens if user tries to start a mixed practice session (F049) while focus mode is enabled?
- **Options**:
  - Block mixed practice entirely, show error message
  - Temporarily disable focus mode for that session
  - Auto-convert mixed session to single-language session
- **Recommendation**: Block mixed practice with friendly message: "Mixed practice is not available in Focus Mode. Switch to parallel learning to practice multiple languages."

### 3. **Focus Mode Gamification**
- **Question**: Should we add achievements/badges for focus mode usage (e.g., "7-day focus streak")?
- **Options**:
  - No gamification (keep it simple)
  - Basic streaks only (current implementation)
  - Full achievement system (badges for milestones)
- **Recommendation**: Start with basic streaks (already implemented), add achievements in phase 2 based on user engagement data

---

## Dependencies

- **Blocks**: None
- **Depends on**: F005 (User Preferences), F030 (Language Selection), F046 (SRS System)

---

## Notes

- Focus mode persisted in user_preferences table with activation timestamp
- Can be toggled on/off at any time
- Switching languages keeps focus mode enabled (no need to toggle off/on)
- All learning endpoints should check focus mode and filter accordingly
- Focus mode history tracked for analytics and streak calculations
- Statistics include streaks (current and longest) and total practice time per language
