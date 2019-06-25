const knexFactory = require('knex');
const Redis = require('ioredis');
const workerFarm = require('worker-farm');

const knexConfig = require('../../src/adapters/knex/knexfile');

const env = process.env.NODE_ENV || 'development';
const knexCfg = knexConfig[env];
const knex = knexFactory(knexCfg);

const redis = new Redis(process.env.REDIS_URL);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function flushDBs() {
  await redis.flushdb();
  await knex('orders').truncate();
  await knex('portfolio').truncate();
  await knex('portfolioAssets').truncate();
  await knex('scores').truncate();
  await knex('scoreUpdateSchedule').truncate();
  await knex('trades').truncate();
  await knex('transfers').truncate();
}

beforeEach(async () => {
  await flushDBs();
});

afterAll(async () => {
  await flushDBs();
  await redis.disconnect();
  await knex.destroy();
});

function generateIngressDepositLoad(workers, start, end) {
  const promises = [];
  for (let i = start; i < end; i += 1) {
    promises.push(new Promise((resolve) => {
      workers({
        traderID: `trader${i}`,
        sourceID: 'transfer2',
        exchangeID: 'binance',
        asset: 'USDT',
        time: 1555209580750,
        quantity: 1551.0729615,
      }, (err) => {
        if (err) {
          console.error(err);
        }

        resolve();
      });
    }));
  }

  return Promise.all(promises);
}

test('ingressDeposit concurrent performance', async () => {
  const ingressDepositWorkers = workerFarm(
    { maxConcurrentCallsPerWorker: 500, autoStart: true },
    require.resolve('./IngressDeposit.worker'),
  );

  // warm
  await generateIngressDepositLoad(ingressDepositWorkers, 0, 4);

  console.time('ingressDeposit');
  await generateIngressDepositLoad(ingressDepositWorkers, 5, 1000);
  console.timeEnd('ingressDeposit');
  workerFarm.end(ingressDepositWorkers);
  await sleep(200);
}, 120000);
