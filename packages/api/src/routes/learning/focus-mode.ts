import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { FocusModeService, FocusModeError } from '../../services/focus-mode';

// Request schemas
const EnableFocusModeRequestSchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 20 }),
});

type EnableFocusModeRequest = Static<typeof EnableFocusModeRequestSchema>;

const SwitchFocusLanguageRequestSchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 20 }),
});

type SwitchFocusLanguageRequest = Static<typeof SwitchFocusLanguageRequestSchema>;

// Response schemas
const FocusModeSettingsResponseSchema = Type.Object({
  enabled: Type.Boolean(),
  focusLanguage: Type.Union([Type.String(), Type.Null()]),
  activatedAt: Type.Union([Type.String(), Type.Null()]),
  lastToggled: Type.Union([Type.String(), Type.Null()]),
});

const EnableFocusModeResponseSchema = Type.Object({
  enabled: Type.Boolean(),
  focusLanguage: Type.Union([Type.String(), Type.Null()]),
  activatedAt: Type.Union([Type.String(), Type.Null()]),
  message: Type.String(),
});

const DisableFocusModeResponseSchema = Type.Object({
  enabled: Type.Boolean(),
  message: Type.String(),
});

const LanguageFocusStatsSchema = Type.Object({
  language: Type.String(),
  sessionsCount: Type.Number(),
  minutesPracticed: Type.Number(),
});

const FocusModeStatsResponseSchema = Type.Object({
  totalFocusSessions: Type.Number(),
  currentStreak: Type.Number(),
  longestStreak: Type.Number(),
  totalFocusedMinutes: Type.Number(),
  languageBreakdown: Type.Array(LanguageFocusStatsSchema),
});

const FocusModeHistoryEntrySchema = Type.Object({
  language: Type.String(),
  action: Type.Union([Type.Literal('enabled'), Type.Literal('disabled'), Type.Literal('switched')]),
  timestamp: Type.String(),
  metadata: Type.Optional(Type.Unknown()),
});

const FocusModeHistoryResponseSchema = Type.Object({
  history: Type.Array(FocusModeHistoryEntrySchema),
});

export const focusModeRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const focusModeService = new FocusModeService(fastify.db);

  /**
   * GET /learning/focus/settings
   * Get current focus mode settings
   */
  fastify.get(
    '/focus/settings',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: FocusModeSettingsResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      try {
        const settings = await focusModeService.getFocusModeSettings(userId);

        return reply.code(200).send({
          enabled: settings.enabled,
          focusLanguage: settings.focusLanguage,
          activatedAt: settings.activatedAt?.toISOString() || null,
          lastToggled: settings.lastToggled?.toISOString() || null,
        });
      } catch (error) {
        if (error instanceof FocusModeError && error.statusCode === 404) {
          return reply.code(404).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  /**
   * POST /learning/focus/enable
   * Enable focus mode for a specific language
   */
  fastify.post<{
    Body: EnableFocusModeRequest;
  }>(
    '/focus/enable',
    {
      preHandler: [authMiddleware],
      schema: {
        body: EnableFocusModeRequestSchema,
        response: {
          200: EnableFocusModeResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.body;

      try {
        const settings = await focusModeService.enableFocusMode(userId, language);

        return reply.code(200).send({
          enabled: settings.enabled,
          focusLanguage: settings.focusLanguage,
          activatedAt: settings.activatedAt?.toISOString() || null,
          message: `Focus mode enabled for ${language}`,
        });
      } catch (error) {
        if (error instanceof FocusModeError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  /**
   * POST /learning/focus/disable
   * Disable focus mode (return to parallel learning)
   */
  fastify.post(
    '/focus/disable',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: DisableFocusModeResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      try {
        const settings = await focusModeService.disableFocusMode(userId);

        return reply.code(200).send({
          enabled: settings.enabled,
          message: 'Focus mode disabled. Returned to parallel learning.',
        });
      } catch (error) {
        if (error instanceof FocusModeError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  /**
   * POST /learning/focus/switch
   * Switch to a different focus language (keeps focus mode enabled)
   */
  fastify.post<{
    Body: SwitchFocusLanguageRequest;
  }>(
    '/focus/switch',
    {
      preHandler: [authMiddleware],
      schema: {
        body: SwitchFocusLanguageRequestSchema,
        response: {
          200: EnableFocusModeResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.body;

      try {
        const settings = await focusModeService.switchFocusLanguage(userId, language);

        return reply.code(200).send({
          enabled: settings.enabled,
          focusLanguage: settings.focusLanguage,
          activatedAt: settings.activatedAt?.toISOString() || null,
          message: `Switched focus to ${language}`,
        });
      } catch (error) {
        if (error instanceof FocusModeError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  /**
   * GET /learning/focus/stats
   * Get focus mode statistics
   */
  fastify.get(
    '/focus/stats',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: FocusModeStatsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      const stats = await focusModeService.getFocusModeStats(userId);

      return reply.code(200).send(stats);
    }
  );

  /**
   * GET /learning/focus/history
   * Get focus mode history
   */
  fastify.get<{
    Querystring: { limit?: number };
  }>(
    '/focus/history',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: Type.Object({
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 30 })),
        }),
        response: {
          200: FocusModeHistoryResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { limit = 30 } = request.query;

      const history = await focusModeService.getFocusModeHistory(userId, limit);

      return reply.code(200).send({
        history: history.map((h) => ({
          language: h.language,
          action: h.action,
          timestamp: h.timestamp.toISOString(),
          metadata: h.metadata,
        })),
      });
    }
  );
};

export default focusModeRoutes;
