const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

const triageQueue = new Queue('triage-tasks', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

module.exports = { triageQueue, redisConnection };
