require('dotenv').config({ path: require.resolve('./.env') });

const knexFactory = require('knex');
const Redis = require('ioredis');

const knexConfig = require('../src/adapters/knex/knexfile');

const knex = knexFactory(knexConfig.test);

const redis = new Redis(process.env.REDIS_URL);

async function flushDBs() {
  await redis.flushdb();
  await knex('exchangeIngress').truncate();
  await knex('orders').truncate();
  await knex('portfolio').truncate();
  await knex('portfolioAssets').truncate();
  await knex('scores').truncate();
  await knex('scoreUpdateSchedule').truncate();
  await knex('trades').truncate();
  await knex('transfers').truncate();
}

beforeAll(async () => {
  await flushDBs();
});

afterAll(async () => {
  await flushDBs();
  await redis.disconnect();
  await knex.destroy();
});
