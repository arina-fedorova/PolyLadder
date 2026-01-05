import { FastifyPluginAsync } from 'fastify';
import vocabularyAnalyticsRoutes from './vocabulary';
import grammarAnalyticsRoutes from './grammar';
import cefrAnalyticsRoutes from './cefr';

const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(vocabularyAnalyticsRoutes);
  await fastify.register(grammarAnalyticsRoutes);
  await fastify.register(cefrAnalyticsRoutes);
};

export default analyticsRoutes;
