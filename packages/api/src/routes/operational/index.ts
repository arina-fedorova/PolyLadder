import { FastifyPluginAsync } from 'fastify';
import healthRoute from './health';
import reviewQueueRoute from './review-queue';
import itemDetailRoute from './item-detail';
import approveRoute from './approve';
import rejectRoute from './reject';
import failuresRoute from './failures';
import failureTrendsRoute from './failure-trends';
import activityLogRoute from './activity-log';
import corpusRoute from './corpus';
import { curriculumRoutes } from './curriculum';
import { documentRoutes } from './documents';
import { mappingRoutes } from './mappings';
import { feedbackRoutes } from './feedback';

const operationalRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(healthRoute);
  await fastify.register(reviewQueueRoute);
  await fastify.register(itemDetailRoute);
  await fastify.register(approveRoute);
  await fastify.register(rejectRoute);
  await fastify.register(failureTrendsRoute);
  await fastify.register(failuresRoute);
  await fastify.register(activityLogRoute);
  await fastify.register(corpusRoute);
  await fastify.register(curriculumRoutes);
  await fastify.register(documentRoutes);
  await fastify.register(mappingRoutes);
  await fastify.register(feedbackRoutes);
};

export default operationalRoutes;
