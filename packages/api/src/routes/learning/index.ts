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
import vocabularyIntroductionRoute from './vocabulary-introduction';
import grammarRoute from './grammar';
import recallRoute from './recall';
import recognitionRoute from './recognition';
import clozeRoute from './cloze';
import dictationRoute from './dictation';
import translationRoute from './translation';

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
  await fastify.register(vocabularyIntroductionRoute);
  await fastify.register(grammarRoute);
  await fastify.register(recallRoute);
  await fastify.register(recognitionRoute);
  await fastify.register(clozeRoute);
  await fastify.register(dictationRoute);
  await fastify.register(translationRoute);
};

export default learningRoutes;
