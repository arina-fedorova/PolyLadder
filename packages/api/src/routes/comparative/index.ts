import { FastifyPluginAsync } from 'fastify';
import grammarRoutes from './grammar';

const comparativeRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(grammarRoutes);
};

export default comparativeRoutes;
