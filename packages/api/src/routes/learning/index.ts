import { FastifyPluginAsync } from 'fastify';
import languagesRoute from './languages';
import orthographyRoute from './orthography';
import orthographyGateRoute from './orthography-gate';
import vocabularyRoute from './vocabulary';
import exercisesRoute from './exercises';
import srsRoute from './srs';
import preferencesRoute from './preferences';
import curriculumRoute from './curriculum';
import wordStateRoute from './word-state';

const learningRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(preferencesRoute);
  await fastify.register(languagesRoute);
  await fastify.register(orthographyRoute);
  await fastify.register(orthographyGateRoute);
  await fastify.register(curriculumRoute);
  await fastify.register(vocabularyRoute);
  await fastify.register(exercisesRoute);
  await fastify.register(srsRoute);
  await fastify.register(wordStateRoute);
};

export default learningRoutes;
