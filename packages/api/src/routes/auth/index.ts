import { FastifyPluginAsync } from 'fastify';
import registerRoute from './register';
import loginRoute from './login';
import meRoute from './me';
import refreshRoute from './refresh';
import logoutRoute from './logout';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(registerRoute);
  await fastify.register(loginRoute);
  await fastify.register(meRoute);
  await fastify.register(refreshRoute);
  await fastify.register(logoutRoute);
};

export default authRoutes;
