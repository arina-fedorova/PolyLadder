import { FastifyPluginAsync } from 'fastify';
import healthRoute from './health';
import reviewQueueRoute from './review-queue';
import itemDetailRoute from './item-detail';
import approveRoute from './approve';
import rejectRoute from './reject';
import failuresRoute from './failures';
import activityLogRoute from './activity-log';

const operationalRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(healthRoute);
  await fastify.register(reviewQueueRoute);
  await fastify.register(itemDetailRoute);
  await fastify.register(approveRoute);
  await fastify.register(rejectRoute);
  await fastify.register(failuresRoute);
  await fastify.register(activityLogRoute);
};

export default operationalRoutes;
