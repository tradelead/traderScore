const knexFactory = require('knex');
const Redis = require('ioredis');
const workerFarm = require('worker-farm');

const Order = require('../../src/core/models/Order');
const Deposit = require('../../src/core/models/Deposit');
const Withdrawal = require('../../src/core/models/Withdrawal');

const ExchangeService = require('../../src/core/services/ExchangeService');

const knexConfig = require('../../src/adapters/knex/knexfile');

const env = process.env.NODE_ENV || 'development';
const knexCfg = knexConfig[env];
const knex = knexFactory(knexCfg);

const redis = new Redis(process.env.REDIS_URL);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

beforeEach(async () => {
  await redis.flushdb();
  await knex('exchangeIngress').truncate();
  await knex('orders').truncate();
  await knex('portfolio').truncate();
  await knex('portfolioAssets').truncate();
  await knex('scores').truncate();
  await knex('scoreUpdateSchedule').truncate();
  await knex('trades').truncate();
  await knex('transfers').truncate();
});

afterAll(async () => {
  await redis.disconnect();
  await knex.destroy();
});

jest.mock('../../src/core/services/ExchangeService');

let orders;
let deposits;
let withdrawals;

const sampleTime = 1555209580740;
const defaultOrder = new Order({
  traderID: 'trader1',
  sourceID: 'order1',
  exchangeID: 'binance',
  side: 'buy',
  asset: 'ETH',
  quoteAsset: 'USDT',
  time: sampleTime - 1,
  quantity: 12.345,
  price: 123.4567,
  fee: {
    quantity: 27,
    asset: 'USDT',
  },
});

const defaultDeposit = new Deposit({
  traderID: 'trader1',
  sourceID: 'transfer1',
  exchangeID: 'binance',
  asset: 'USDT',
  time: sampleTime - 2,
  quantity: 1551.0729615,
});

const defaultWithdrawal = new Withdrawal({
  traderID: 'trader1',
  sourceID: 'transfer2',
  exchangeID: 'binance',
  asset: 'ETH',
  time: sampleTime,
  quantity: 12.345,
});

beforeEach(async () => {
  orders = [defaultOrder];
  deposits = [defaultDeposit];
  withdrawals = [defaultWithdrawal];

  const mockExchangeService = new ExchangeService({});


  const oncePerTraderID = (onceValue, defaultValue) => {
    const cache = {};
    return async ({ traderID }) => {
      if (!cache[traderID]) {
        cache[traderID] = true;
        return onceValue.map(item => Object.assign({}, item, { traderID }));
      }
      return defaultValue;
    };
  };

  mockExchangeService.getFilledOrders.mockImplementation(oncePerTraderID(orders, []));

  mockExchangeService.getSuccessfulDeposits.mockImplementation(oncePerTraderID(deposits, []));

  mockExchangeService.getSuccessfulWithdrawals.mockImplementation(oncePerTraderID(withdrawals, []));

  mockExchangeService.isRootAsset.mockImplementation(async ({ symbol }) => symbol === 'USDT');

  mockExchangeService.getPrice.mockImplementation(async () => 1);
  mockExchangeService.getBTCValue.mockImplementation(async () => 1);

  mockExchangeService.findMarketQuoteAsset
    .mockImplementation(async ({ asset, preferredQuoteAsset }) => {
      if (asset === 'USDT') {
        return 'USDT';
      }
      return preferredQuoteAsset;
    });
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

test('ingressTraderExchange concurrent performance', async () => {
  const ingressWorkers = workerFarm(
    { maxConcurrentCallsPerWorker: 500, autoStart: true },
    require.resolve('./IngressTraderExchange.worker'),
  );

  // warm
  await generateIngressTraderExchangeLoad(ingressWorkers, 0, 4);

  console.time('ingressTraderExchange');
  await generateIngressTraderExchangeLoad(ingressWorkers, 5, 1000);
  console.timeEnd('ingressTraderExchange');
  workerFarm.end(ingressWorkers);
  await sleep(200);
}, 60000);
