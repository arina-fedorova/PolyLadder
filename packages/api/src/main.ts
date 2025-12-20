import { validateEnv } from './config/env';
import { startServer, closeServer } from './server';
import { FastifyInstance } from 'fastify';

let server: FastifyInstance | null = null;

async function main(): Promise<void> {
  validateEnv();

  server = await startServer();

  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`\n${signal} received, shutting down gracefully...\n`);

    if (server) {
      await closeServer(server);
      process.stdout.write('Server closed\n');
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('uncaughtException', (error) => {
    process.stderr.write(`Uncaught exception: ${error.message}\n`);
    process.stderr.write(`${error.stack ?? ''}\n`);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    process.stderr.write(`Unhandled rejection: ${String(reason)}\n`);
    process.exit(1);
  });
}

void main();
