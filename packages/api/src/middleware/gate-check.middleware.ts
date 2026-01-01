import { FastifyRequest, FastifyReply } from 'fastify';
import { OrthographyGateService } from '../services/orthography-gate.service';

export interface GateCheckOptions {
  languageParam?: string;
  cefrLevelParam?: string;
  bodyLanguageField?: string;
  bodyCefrLevelField?: string;
}

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

    let language: string | undefined;
    let cefrLevel: string | undefined;

    const query = request.query as Record<string, string>;
    language = query[languageParam];
    cefrLevel = query[cefrLevelParam];

    if (!language && bodyLanguageField) {
      const body = request.body as Record<string, string>;
      language = body[bodyLanguageField];
    }

    if (!cefrLevel && bodyCefrLevelField) {
      const body = request.body as Record<string, string>;
      cefrLevel = body[bodyCefrLevelField];
    }

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
  };
}

export async function gateCheckMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const gateService = new OrthographyGateService(request.server.db);
  const middleware = createGateCheckMiddleware(gateService);
  await middleware(request, reply);
}
