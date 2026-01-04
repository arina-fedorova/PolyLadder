import { FastifyPluginAsync } from 'fastify';
import vocabularyAnalyticsRoutes from './vocabulary';

const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(vocabularyAnalyticsRoutes);
};

export default analyticsRoutes;
