const sinon = require('sinon');

const Order = require('../../src/core/models/Order');
const Deposit = require('../../src/core/models/Deposit');
const Withdrawal = require('../../src/core/models/Withdrawal');

const flushDbs = require('../flushDBs');

const ExchangeService = require('../../src/core/services/ExchangeService');

jest.mock('../../src/core/services/ExchangeService');

const SQSQueue = require('../../src/adapters/SQSQueue');

const mockSQSQueue = new SQSQueue({});

jest.mock('../../src/adapters/SQSQueue');

const app = require('../../src/app.bootstrap');

let defaultOrder;
let defaultDeposit;
let defaultWithdrawal;

const sampleTime = 1555377480513;

beforeEach(async () => {
  await flushDbs();

  defaultOrder = new Order({
    traderID: 'trader1',
    sourceID: 'order1',
    exchangeID: 'binance',
    side: 'buy',
    asset: 'ETH',
    quoteAsset: 'USDT',
    time: sampleTime - (24 * 60 * 60 * 1000),
    quantity: 12.345,
    price: 123.4567,
    fee: {
      quantity: 27,
      asset: 'USDT',
    },
  });

  defaultDeposit = new Deposit({
    traderID: 'trader1',
    sourceID: 'transfer1',
    exchangeID: 'binance',
    asset: 'USDT',
    time: sampleTime - (2 * 24 * 60 * 60 * 1000),
    quantity: 1551.0729615,
  });

  defaultWithdrawal = new Withdrawal({
    traderID: 'trader1',
    sourceID: 'transfer2',
    exchangeID: 'binance',
    asset: 'ETH',
    time: sampleTime,
    quantity: 12.345,
  });

  const mockExchangeService = new ExchangeService({});

  mockExchangeService.getFilledOrders
    .onCall(1)
    .resolves([defaultOrder]);

  mockExchangeService.getFilledOrders.resolves([]);

  mockExchangeService.getSuccessfulDeposits
    .onCall(1)
    .resolves([defaultDeposit]);

  mockExchangeService.getSuccessfulDeposits.resolves([]);

  mockExchangeService.getSuccessfulWithdrawals
    .onCall(1)
    .resolves([defaultWithdrawal]);

  mockExchangeService.getSuccessfulWithdrawals.resolves([]);

  mockExchangeService.getPrice
    .withArgs(sinon.match({ asset: 'ETH', quoteAsset: 'USDT', time: defaultDeposit.time }))
    .resolves(100);

  mockExchangeService.getPrice
    .withArgs(sinon.match({ asset: 'ETH', quoteAsset: 'USDT', time: defaultOrder.time }))
    .resolves(150);

  mockExchangeService.getPrice
    .withArgs(sinon.match({ asset: 'ETH', quoteAsset: 'USDT', time: defaultWithdrawal.time }))
    .resolves(225);

  mockExchangeService.getPrice.resolves(1);

  mockExchangeService.getBTCValue
    .withArgs(sinon.match({ asset: 'ETH', quoteAsset: 'BTC', time: defaultOrder.time }))
    .resolves(0.3);

  mockExchangeService.getBTCValue
    .withArgs(sinon.match({ asset: 'ETH', quoteAsset: 'BTC', time: defaultWithdrawal.time }))
    .resolves(0.3);

  mockExchangeService.getBTCValue
    .withArgs(sinon.match({ asset: 'USDT', quoteAsset: 'USDT', time: defaultDeposit.time }))
    .resolves(0.3);

  mockExchangeService.getBTCValue
    .withArgs(sinon.match({ asset: 'ETH', quoteAsset: 'USDT', time: defaultOrder.time }))
    .resolves(0.3);

  mockExchangeService.getBTCValue
    .withArgs(sinon.match({ asset: 'ETH', quoteAsset: 'USDT', time: defaultWithdrawal.time }))
    .resolves(0.45);

  mockExchangeService.getBTCValue.resolves(1);

  mockExchangeService.isRootAsset.callsFake(async ({ symbol }) => symbol === 'USDT');

  mockExchangeService.findMarketQuoteAsset.callsFake(async ({ asset, preferredQuoteAsset }) => {
    if (asset === 'USDT') {
      return 'USDT';
    }
    return preferredQuoteAsset;
  });
});

test('due updates are moved to queue', async () => {
  await app.useCases.ingressTraderExchange({
    traderID: 'trader1',
    exchangeID: 'binance',
  });

  const { now } = Date;
  Date.now = jest.fn().mockImplementation(() => sampleTime + (24 * 60 * 60 * 1000));

  await app.controllers.moveDueScoreUpdatesQueue();

  expect(mockSQSQueue.push).toHaveBeenCalledWith({
    traderID: 'trader1',
    period: 'day',
  });

  // prevent duplicate score updates
  expect(mockSQSQueue.push).toHaveBeenCalledTimes(1);

  Date.now = jest.fn().mockImplementation(() => sampleTime + (6 * 24 * 60 * 60 * 1000));

  await app.controllers.moveDueScoreUpdatesQueue();

  expect(mockSQSQueue.push).toHaveBeenCalledWith({
    traderID: 'trader1',
    period: 'week',
  });

  Date.now = now;
});
