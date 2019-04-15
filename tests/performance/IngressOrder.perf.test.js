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
  await knex('exchangeIngress').truncate();
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

function generateIngressTraderExchangeLoad(workers, start, end) {
  const promises = [];
  for (let i = start; i < end; i += 1) {
    promises.push(new Promise((resolve) => {
      workers({
        traderID: `trader${i}`,
        exchangeID: 'binance',
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

function generateIngressOrderLoad(workers, start, end) {
  const promises = [];
  for (let i = start; i < end; i += 1) {
    promises.push(new Promise((resolve) => {
      workers({
        traderID: `trader${i}`,
        sourceID: 'order2',
        exchangeID: 'binance',
        side: 'buy',
        asset: 'ETH',
        quoteAsset: 'USDT',
        time: 1555209580760,
        quantity: 12.345,
        price: 123.4567,
        fee: {
          quantity: 27,
          asset: 'USDT',
        },
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
  const ingressExchangeWorkers = workerFarm(
    { maxConcurrentCallsPerWorker: 500, autoStart: true },
    require.resolve('./IngressTraderExchange.worker'),
  );

  const ingressDepositWorkers = workerFarm(
    { maxConcurrentCallsPerWorker: 500, autoStart: true },
    require.resolve('./IngressDeposit.worker'),
  );

  const ingressOrderWorkers = workerFarm(
    { maxConcurrentCallsPerWorker: 500, autoStart: true },
    require.resolve('./IngressOrder.worker'),
  );

  // mark ingress exchange complete
  await generateIngressTraderExchangeLoad(ingressExchangeWorkers, 0, 1000);

  // add deposits
  await generateIngressDepositLoad(ingressDepositWorkers, 0, 1000);

  // warm
  await generateIngressOrderLoad(ingressOrderWorkers, 0, 4);

  console.time('ingressOrder');
  await generateIngressOrderLoad(ingressOrderWorkers, 5, 1000);
  console.timeEnd('ingressOrder');
  workerFarm.end(ingressExchangeWorkers);
  workerFarm.end(ingressDepositWorkers);
  workerFarm.end(ingressOrderWorkers);
  await sleep(200);
}, 120000);
