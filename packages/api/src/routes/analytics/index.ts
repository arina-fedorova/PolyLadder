import { FastifyPluginAsync } from 'fastify';
import vocabularyAnalyticsRoutes from './vocabulary';
import grammarAnalyticsRoutes from './grammar';

const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(vocabularyAnalyticsRoutes);
  await fastify.register(grammarAnalyticsRoutes);
};

export default analyticsRoutes;
