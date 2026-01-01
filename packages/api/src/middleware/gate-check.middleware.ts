import { FastifyRequest, FastifyReply } from 'fastify';
import { OrthographyGateService } from '../services/orthography-gate.service';

export interface GateCheckOptions {
  languageParam?: string; // Query param name for language (default: 'language')
  cefrLevelParam?: string; // Query param name for CEFR level (default: 'cefrLevel')
  bodyLanguageField?: string; // Body field name for language
  bodyCefrLevelField?: string; // Body field name for CEFR level
}

/**
 * Middleware factory to create gate check middleware
 */
export function createGateCheckMiddleware(
  gateService: OrthographyGateService,
  options: GateCheckOptions = {}
) {
  const {
    languageParam = 'language',
    cefrLevelParam = 'cefrLevel',
    bodyLanguageField,
    bodyCefrLevelField,
  } = options;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;

    // Extract language and CEFR level from query params or body
    let language: string | undefined;
    let cefrLevel: string | undefined;

    // Try query params first
    const query = request.query as Record<string, string>;
    language = query[languageParam];
    cefrLevel = query[cefrLevelParam];

    // If not in query, try body
    if (!language && bodyLanguageField) {
      const body = request.body as Record<string, string>;
      language = body[bodyLanguageField];
    }

    if (!cefrLevel && bodyCefrLevelField) {
      const body = request.body as Record<string, string>;
      cefrLevel = body[bodyCefrLevelField];
    }

    // Validate presence of required params
    if (!language) {
      return reply.status(400).send({
        error: {
          statusCode: 400,
          message: 'Language parameter required',
          requestId: request.id,
          code: 'LANGUAGE_REQUIRED',
        },
      });
    }

    if (!cefrLevel) {
      return reply.status(400).send({
        error: {
          statusCode: 400,
          message: 'CEFR level parameter required',
          requestId: request.id,
          code: 'CEFR_LEVEL_REQUIRED',
        },
      });
    }

    // Check if user can access this level
    const canAccess = await gateService.canAccessLevel(userId, language, cefrLevel);

    if (!canAccess) {
      return reply.status(403).send({
        error: {
          statusCode: 403,
          message: `You must complete the orthography lessons (A0) for ${language} before accessing ${cefrLevel} content.`,
          requestId: request.id,
          code: 'GATE_NOT_PASSED',
          gateRequired: true,
          requiredGate: {
            language,
            level: 'A0',
          },
        },
      });
    }

    // User has access, continue to handler
  };
}

/**
 * Pre-configured middleware for common use case (query params)
 */
export async function gateCheckMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const gateService = new OrthographyGateService(request.server.db);
  const middleware = createGateCheckMiddleware(gateService);
  await middleware(request, reply);
}
