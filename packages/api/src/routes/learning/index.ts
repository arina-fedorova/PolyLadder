import { FastifyPluginAsync } from 'fastify';
import languagesRoute from './languages';
import orthographyRoute from './orthography';
import vocabularyRoute from './vocabulary';
import exercisesRoute from './exercises';
import srsRoute from './srs';

const learningRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(languagesRoute);
  await fastify.register(orthographyRoute);
  await fastify.register(vocabularyRoute);
  await fastify.register(exercisesRoute);
  await fastify.register(srsRoute);
};

export default learningRoutes;
