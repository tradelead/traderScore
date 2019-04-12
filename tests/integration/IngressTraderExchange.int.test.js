const VError = require('verror');
const knexFactory = require('knex');
const Redis = require('ioredis');

const app = require('../../app.bootstrap');

const Order = require('../../src/core/models/Order');
const Deposit = require('../../src/core/models/Deposit');
const Withdrawal = require('../../src/core/models/Withdrawal');

const ExchangeService = require('../../src/core/services/ExchangeService');

const knexConfig = require('../../src/adapters/knex/knexfile');

const env = process.env.NODE_ENV || 'development';
const knex = knexFactory(knexConfig[env]);

const redis = new Redis(process.env.REDIS_URL);

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

const sampleTime = Date.now();
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

  mockExchangeService.getFilledOrders.mockImplementation(async () => []);
  mockExchangeService.getFilledOrders.mockImplementationOnce(async () => orders);

  mockExchangeService.getSuccessfulDeposits.mockImplementation(async () => []);
  mockExchangeService.getSuccessfulDeposits.mockImplementationOnce(async () => deposits);

  mockExchangeService.getSuccessfulWithdrawals.mockImplementation(async () => []);
  mockExchangeService.getSuccessfulWithdrawals.mockImplementationOnce(async () => withdrawals);

  mockExchangeService.isRootAsset.mockImplementation(async ({ symbol }) => symbol === 'USDT');

  mockExchangeService.getPrice.mockImplementation(async () => 123);
  mockExchangeService.getBTCValue.mockImplementation(async () => 0.345);

  mockExchangeService.findMarketQuoteAsset
    .mockImplementation(async ({ asset, preferredQuoteAsset }) => {
      if (asset === 'USDT') {
        return 'USDT';
      }
      return preferredQuoteAsset;
    });
});

test('trader\'s first exchange ingress', async () => {
  try {
    await app.useCases.ingressTraderExchange({
      traderID: 'trader1',
      exchangeID: 'binance',
    });
  } catch (e) {
    console.error(e, VError.info(e));
  }

  const mockExchangeService = new ExchangeService({});
  console.log(mockExchangeService.getPrice.calls);
  console.log(mockExchangeService.getBTCValue.calls);

  console.log(await app.useCases.getTraderScoreHistory({ traderID: 'trader1' }));
});
