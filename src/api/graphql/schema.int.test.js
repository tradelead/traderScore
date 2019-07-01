const { graphql } = require('graphql');
const sinon = require('sinon');

const app = require('../../app.bootstrap');
const schema = require('./schema');

const Order = require('../../../src/core/models/Order');
const Deposit = require('../../../src/core/models/Deposit');
const Withdrawal = require('../../../src/core/models/Withdrawal');

const ExchangeService = require('../../../src/core/services/ExchangeService');

const flushDbs = require('../../../tests/flushDBs');

jest.mock('../../../src/core/services/ExchangeService');

let defaultOrder;
let defaultDeposit;
let defaultWithdrawal;

const sampleTime = Date.now();
beforeAll(async () => {
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

  mockExchangeService.getPrice.reset();

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

  mockExchangeService.getBTCValue.reset();

  mockExchangeService.getBTCValue
    .withArgs(sinon.match({ asset: 'ETH', quoteAsset: 'USDT', time: defaultWithdrawal.time }))
    .resolves(0.45);

  mockExchangeService.getBTCValue
    .withArgs(sinon.match({ qty: 6 }))
    .resolves(0.15);

  mockExchangeService.getBTCValue
    .withArgs(sinon.match({ qty: 12.345 }))
    .resolves(0.3);

  mockExchangeService.getBTCValue.resolves(1);

  mockExchangeService.isRootAsset.reset();
  mockExchangeService.isRootAsset.callsFake(async ({ symbol }) => symbol === 'USDT');

  mockExchangeService.findMarketQuoteAsset.reset();
  mockExchangeService.findMarketQuoteAsset.callsFake(async ({ asset, preferredQuoteAsset }) => {
    if (asset === 'USDT') {
      return 'USDT';
    }
    return preferredQuoteAsset;
  });

  // trader 1
  await app.useCases.ingressDeposit(defaultDeposit);
  await app.useCases.ingressFilledOrder(defaultOrder);
  await app.useCases.ingressWithdrawal(defaultWithdrawal);

  // trader 2
  await app.useCases.ingressDeposit(Object.assign({}, defaultDeposit, {
    exchangeID: 'bittrex',
    traderID: 'trader2',
  }));
  await app.useCases.ingressFilledOrder(Object.assign({}, defaultOrder, {
    exchangeID: 'bittrex',
    traderID: 'trader2',
    quantity: 6,
  }));
  await app.useCases.ingressWithdrawal(Object.assign({}, defaultWithdrawal, {
    exchangeID: 'bittrex',
    traderID: 'trader2',
    quantity: 6,
  }));
});

test('getTopTraders', async () => {
  const query = `{
    getTopTraders(limit: 10) { 
      id,
      rank,
      scores(input: { 
        limit: 1 
      }) {
        score
      }
    }
  }`;
  const { data, errors } = await graphql(schema, query);
  if (errors) {
    console.error(errors);
  }

  const { getTopTraders } = data;
  console.log(getTopTraders);
  expect(getTopTraders).toHaveLength(2);
  getTopTraders.forEach((trader) => {
    expect(trader.id).toBeDefined();
    expect(trader.rank).toBeDefined();
    expect(trader.scores).toHaveLength(1);
    expect(trader.scores[0].score).toBeGreaterThan(0);
  });
});

test('getTopTraders with period', async () => {
  const query = `{
    getTopTraders(period: "day", limit: 10) { 
      id,
      rank,
      scores(input: { 
        period: "day",
        limit: 1
      }) {
        score
      }
    }
  }`;
  const { data, errors } = await graphql(schema, query);
  if (errors) {
    console.error(errors);
  }

  const { getTopTraders } = data;
  getTopTraders.forEach((trader) => {
    expect(trader.id).toBeDefined();
    expect(trader.rank).toBeDefined();
    expect(trader.scores).toHaveLength(1);
    expect(trader.scores[0].score).toBeGreaterThan(0);
  });
});

test('getTrader trader1 with scores & rank', async () => {
  const query = `{
    getTrader(id: "trader1") { 
      rank,
      scores(input: { 
        limit: 10
      }) {
        score,
        time
      }
    }
  }`;
  const { data, errors } = await graphql(schema, query);
  if (errors) {
    console.error(errors);
  }

  const trader = data.getTrader;
  expect(trader.rank).toBeDefined();
  expect(trader.scores.length).toBeLessThanOrEqual(10);
  expect(trader.scores[0].score).toBeGreaterThan(0);
});
