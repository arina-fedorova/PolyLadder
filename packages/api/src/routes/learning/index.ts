import { FastifyPluginAsync } from 'fastify';
import languagesRoute from './languages';
import orthographyRoute from './orthography';
import vocabularyRoute from './vocabulary';
import exercisesRoute from './exercises';
import srsRoute from './srs';

const learningRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();

  void fastify.register(languagesRoute);
  void fastify.register(orthographyRoute);
  void fastify.register(vocabularyRoute);
  void fastify.register(exercisesRoute);
  void fastify.register(srsRoute);
};

export default learningRoutes;
