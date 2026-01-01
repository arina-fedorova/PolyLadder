import 'fastify';
import { Pool } from 'pg';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;

    requireAuth: () => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

    requireOperator: () => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

    requireLearner: () => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    user?: {
      userId: string;
      role: 'learner' | 'operator';
    };
  }
}
