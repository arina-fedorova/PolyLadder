import { FastifyPluginAsync } from 'fastify';
import vocabularyAnalyticsRoutes from './vocabulary';
import grammarAnalyticsRoutes from './grammar';
import cefrAnalyticsRoutes from './cefr';
import weaknessAnalyticsRoutes from './weakness';
import statisticsRoutes from './statistics';

const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(vocabularyAnalyticsRoutes);
  await fastify.register(grammarAnalyticsRoutes);
  await fastify.register(cefrAnalyticsRoutes);
  await fastify.register(weaknessAnalyticsRoutes);
  await fastify.register(statisticsRoutes);
};

export default analyticsRoutes;
