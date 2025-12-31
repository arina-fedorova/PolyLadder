import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema, SuccessResponseSchema } from '../../schemas/common';

const UserPreferencesSchema = Type.Object({
  baseLanguage: Type.String(),
  studiedLanguages: Type.Array(Type.String()),
  focusModeEnabled: Type.Boolean(),
  focusLanguage: Type.Union([Type.String(), Type.Null()]),
  onboardingCompleted: Type.Boolean(),
  settings: Type.Any(),
});

const UpdatePreferencesSchema = Type.Object({
  studiedLanguages: Type.Optional(Type.Array(Type.String())),
  focusModeEnabled: Type.Optional(Type.Boolean()),
  focusLanguage: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  onboardingCompleted: Type.Optional(Type.Boolean()),
  settings: Type.Optional(Type.Any()),
});

const FocusModeSchema = Type.Object({
  enabled: Type.Boolean(),
  language: Type.Optional(Type.String()),
});

type UpdatePreferencesRequest = Static<typeof UpdatePreferencesSchema>;
type FocusModeRequest = Static<typeof FocusModeSchema>;

interface PreferencesRow {
  user_id: string;
  studied_languages: unknown;
  focus_mode_enabled: boolean;
  focus_language: string | null;
  onboarding_completed: boolean;
  settings: unknown;
}

interface UserRow {
  base_language: string;
}

const preferencesRoute: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();

  fastify.get(
    '/preferences',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: UserPreferencesSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      const userResult = await fastify.db.query<UserRow>(
        'SELECT base_language FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: 'User not found',
            requestId: request.id,
            code: 'USER_NOT_FOUND',
          },
        });
      }

      const baseLanguage = userResult.rows[0].base_language;

      const prefsResult = await fastify.db.query<PreferencesRow>(
        `SELECT studied_languages, focus_mode_enabled, focus_language, onboarding_completed, settings
         FROM user_preferences
         WHERE user_id = $1`,
        [userId]
      );

      let preferences: PreferencesRow;

      if (prefsResult.rows.length === 0) {
        const insertResult = await fastify.db.query<PreferencesRow>(
          `INSERT INTO user_preferences (user_id, studied_languages, focus_mode_enabled, onboarding_completed, settings)
           VALUES ($1, '[]'::jsonb, false, false, '{}'::jsonb)
           RETURNING studied_languages, focus_mode_enabled, focus_language, onboarding_completed, settings`,
          [userId]
        );
        preferences = insertResult.rows[0];
      } else {
        preferences = prefsResult.rows[0];
      }

      return reply.status(200).send({
        baseLanguage,
        studiedLanguages: Array.isArray(preferences.studied_languages)
          ? preferences.studied_languages
          : [],
        focusModeEnabled: preferences.focus_mode_enabled,
        focusLanguage: preferences.focus_language,
        onboardingCompleted: preferences.onboarding_completed,
        settings: preferences.settings || {},
      });
    }
  );

  fastify.put<{ Body: UpdatePreferencesRequest }>(
    '/preferences',
    {
      preHandler: [authMiddleware],
      schema: {
        body: UpdatePreferencesSchema,
        response: {
          200: SuccessResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const updates = request.body;

      const hasUpdates =
        updates.studiedLanguages !== undefined ||
        updates.focusModeEnabled !== undefined ||
        updates.focusLanguage !== undefined ||
        updates.onboardingCompleted !== undefined ||
        updates.settings !== undefined;

      if (!hasUpdates) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: 'No fields to update',
            requestId: request.id,
            code: 'NO_FIELDS',
          },
        });
      }

      const params: unknown[] = [userId];
      let paramIndex = 2;

      const studiedLanguagesValue =
        updates.studiedLanguages !== undefined ? `$${paramIndex}::jsonb` : `'[]'::jsonb`;
      if (updates.studiedLanguages !== undefined) {
        params.push(JSON.stringify(updates.studiedLanguages));
        paramIndex++;
      }

      const focusModeValue = updates.focusModeEnabled !== undefined ? `$${paramIndex}` : 'false';
      if (updates.focusModeEnabled !== undefined) {
        params.push(updates.focusModeEnabled);
        paramIndex++;
      }

      const focusLanguageValue = updates.focusLanguage !== undefined ? `$${paramIndex}` : 'NULL';
      if (updates.focusLanguage !== undefined) {
        params.push(updates.focusLanguage);
        paramIndex++;
      }

      const onboardingValue =
        updates.onboardingCompleted !== undefined ? `$${paramIndex}` : 'false';
      if (updates.onboardingCompleted !== undefined) {
        params.push(updates.onboardingCompleted);
        paramIndex++;
      }

      const settingsValue =
        updates.settings !== undefined ? `$${paramIndex}::jsonb` : `'{}'::jsonb`;
      if (updates.settings !== undefined) {
        params.push(JSON.stringify(updates.settings));
        paramIndex++;
      }

      const updateClauses: string[] = [];
      let updateParamIndex = 2;

      if (updates.studiedLanguages !== undefined) {
        updateClauses.push(`studied_languages = $${updateParamIndex}::jsonb`);
        updateParamIndex++;
      }

      if (updates.focusModeEnabled !== undefined) {
        updateClauses.push(`focus_mode_enabled = $${updateParamIndex}`);
        updateParamIndex++;
      }

      if (updates.focusLanguage !== undefined) {
        updateClauses.push(`focus_language = $${updateParamIndex}`);
        updateParamIndex++;
      }

      if (updates.onboardingCompleted !== undefined) {
        updateClauses.push(`onboarding_completed = $${updateParamIndex}`);
        updateParamIndex++;
      }

      if (updates.settings !== undefined) {
        updateClauses.push(`settings = $${updateParamIndex}::jsonb`);
        updateParamIndex++;
      }

      updateClauses.push(`updated_at = CURRENT_TIMESTAMP`);

      const query = `
        INSERT INTO user_preferences (user_id, studied_languages, focus_mode_enabled, focus_language, onboarding_completed, settings, updated_at)
        VALUES ($1, ${studiedLanguagesValue}, ${focusModeValue}, ${focusLanguageValue}, ${onboardingValue}, ${settingsValue}, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO UPDATE SET ${updateClauses.join(', ')}
      `;

      await fastify.db.query(query, params);

      request.log.info({ userId, updates }, 'User preferences updated');

      return reply.status(200).send({
        success: true,
        message: 'Preferences updated successfully',
      });
    }
  );

  fastify.post<{ Body: FocusModeRequest }>(
    '/preferences/focus',
    {
      preHandler: [authMiddleware],
      schema: {
        body: FocusModeSchema,
        response: {
          200: SuccessResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { enabled, language } = request.body;

      if (enabled && !language) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: 'Language is required when enabling focus mode',
            requestId: request.id,
            code: 'LANGUAGE_REQUIRED',
          },
        });
      }

      await fastify.db.query(
        `INSERT INTO user_preferences (user_id, focus_mode_enabled, focus_language, studied_languages, onboarding_completed, settings, updated_at)
         VALUES ($1, $2, $3, '[]'::jsonb, false, '{}'::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) DO UPDATE SET
           focus_mode_enabled = $2,
           focus_language = $3,
           updated_at = CURRENT_TIMESTAMP`,
        [userId, enabled, enabled ? language : null]
      );

      request.log.info({ userId, enabled, language }, 'Focus mode updated');

      return reply.status(200).send({
        success: true,
        message: enabled ? `Focus mode enabled for ${language}` : 'Focus mode disabled',
      });
    }
  );

  const AddLanguageSchema = Type.Object({
    language: Type.String({ minLength: 2, maxLength: 2 }),
  });

  type AddLanguageRequest = Static<typeof AddLanguageSchema>;

  fastify.post<{ Body: AddLanguageRequest }>(
    '/preferences/languages',
    {
      preHandler: [authMiddleware],
      schema: {
        body: AddLanguageSchema,
        response: {
          200: SuccessResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.body;

      const prefsResult = await fastify.db.query<PreferencesRow>(
        `SELECT studied_languages FROM user_preferences WHERE user_id = $1`,
        [userId]
      );

      if (prefsResult.rows.length === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: 'User preferences not found',
            requestId: request.id,
            code: 'PREFERENCES_NOT_FOUND',
          },
        });
      }

      const currentLanguages = Array.isArray(prefsResult.rows[0].studied_languages)
        ? (prefsResult.rows[0].studied_languages as string[])
        : [];

      if (currentLanguages.length >= 5) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: 'Maximum 5 languages allowed',
            requestId: request.id,
            code: 'MAX_LANGUAGES_EXCEEDED',
          },
        });
      }

      if (currentLanguages.includes(language)) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: 'Language already added',
            requestId: request.id,
            code: 'LANGUAGE_ALREADY_ADDED',
          },
        });
      }

      const newLanguages = [...currentLanguages, language];

      await fastify.db.query(
        `UPDATE user_preferences
         SET studied_languages = $1::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2`,
        [JSON.stringify(newLanguages), userId]
      );

      await fastify.db.query(
        `INSERT INTO user_orthography_gates (user_id, language, status)
         VALUES ($1, $2, 'locked')
         ON CONFLICT (user_id, language) DO NOTHING`,
        [userId, language]
      );

      request.log.info({ userId, language, totalLanguages: newLanguages.length }, 'Language added');

      return reply.status(200).send({
        success: true,
        message: `Language ${language} added successfully`,
      });
    }
  );

  const RemoveLanguageParamsSchema = Type.Object({
    language: Type.String({ minLength: 2, maxLength: 2 }),
  });

  type RemoveLanguageParams = Static<typeof RemoveLanguageParamsSchema>;

  fastify.delete<{ Params: RemoveLanguageParams }>(
    '/preferences/languages/:language',
    {
      preHandler: [authMiddleware],
      schema: {
        params: RemoveLanguageParamsSchema,
        response: {
          200: SuccessResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.params;

      const prefsResult = await fastify.db.query<PreferencesRow>(
        `SELECT studied_languages, focus_language FROM user_preferences WHERE user_id = $1`,
        [userId]
      );

      if (prefsResult.rows.length === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: 'User preferences not found',
            requestId: request.id,
            code: 'PREFERENCES_NOT_FOUND',
          },
        });
      }

      const currentLanguages = Array.isArray(prefsResult.rows[0].studied_languages)
        ? (prefsResult.rows[0].studied_languages as string[])
        : [];
      const focusLanguage = prefsResult.rows[0].focus_language;

      if (currentLanguages.length === 1) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: 'Cannot remove last language. You must study at least one language.',
            requestId: request.id,
            code: 'CANNOT_REMOVE_LAST_LANGUAGE',
          },
        });
      }

      if (!currentLanguages.includes(language)) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: 'Language not in studied languages',
            requestId: request.id,
            code: 'LANGUAGE_NOT_FOUND',
          },
        });
      }

      const newLanguages = currentLanguages.filter((lang: string) => lang !== language);

      await fastify.db.query(
        `UPDATE user_preferences
         SET studied_languages = $1::jsonb,
             focus_language = CASE
               WHEN focus_language = $2 THEN NULL
               ELSE focus_language
             END,
             focus_mode_enabled = CASE
               WHEN focus_language = $2 THEN false
               ELSE focus_mode_enabled
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3`,
        [JSON.stringify(newLanguages), language, userId]
      );

      request.log.info(
        {
          userId,
          language,
          totalLanguages: newLanguages.length,
          focusDisabled: focusLanguage === language,
        },
        'Language removed'
      );

      return reply.status(200).send({
        success: true,
        message: `Language ${language} removed. Your progress has been preserved and can be restored by re-adding this language.`,
      });
    }
  );
};

export default preferencesRoute;
