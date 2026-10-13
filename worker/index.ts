import { logger } from '@/shared/logging';

async function main() {
  logger.info('Worker started');
  // Outbox/Sync workers to be implemented in later phases
}

main().catch((e) => {
  logger.error(e, 'Worker failed');
  process.exit(1);
});