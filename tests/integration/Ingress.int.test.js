const sinon = require('sinon');

const app = require('../../app.bootstrap');

const Order = require('../../src/core/models/Order');
const Deposit = require('../../src/core/models/Deposit');
const Withdrawal = require('../../src/core/models/Withdrawal');

const ExchangeService = require('../../src/core/services/ExchangeService');

const flushDbs = require('../flushDBs');

jest.mock('../../src/core/services/ExchangeService');

let defaultOrder;
let defaultDeposit;
let defaultWithdrawal;

const sampleTime = Date.now();

beforeEach(async () => {
  await flushDbs();

  defaultOrder = new Order({
    traderID: 'trader1',
    sourceID: 'order1',
    exchangeID: 'binance',
    side: 'buy',
    asset: 'ETH',
    quoteAsset: 'USDT',
    time: sampleTime - (24 * 61 * 60 * 1000),
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
    time: sampleTime - (2 * 24 * 61 * 60 * 1000),
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

  mockExchangeService.getFilledOrders.reset();
  mockExchangeService.getFilledOrders
    .withArgs(sinon.match({ exchangeID: 'binance' }))
    .onFirstCall()
    .resolves([defaultOrder]);

  mockExchangeService.getFilledOrders
    .withArgs(sinon.match({ exchangeID: 'bittrex' }))
    .onFirstCall()
    .resolves([Object.assign({}, defaultOrder, { exchangeID: 'bittrex' })]);

  mockExchangeService.getFilledOrders.resolves([]);

  mockExchangeService.getSuccessfulDeposits.reset();
  mockExchangeService.getSuccessfulDeposits
    .withArgs(sinon.match({ exchangeID: 'binance' }))
    .onFirstCall()
    .resolves([defaultDeposit]);

  mockExchangeService.getSuccessfulDeposits
    .withArgs(sinon.match({ exchangeID: 'bittrex' }))
    .onFirstCall()
    .resolves([Object.assign({}, defaultDeposit, { exchangeID: 'bittrex' })]);

  mockExchangeService.getSuccessfulDeposits.resolves([]);

  mockExchangeService.getSuccessfulWithdrawals.reset();
  mockExchangeService.getSuccessfulWithdrawals
    .withArgs(sinon.match({ exchangeID: 'binance' }))
    .onFirstCall()
    .resolves([defaultWithdrawal]);

  mockExchangeService.getSuccessfulWithdrawals
    .withArgs(sinon.match({ exchangeID: 'bittrex' }))
    .onFirstCall()
    .resolves([Object.assign({}, defaultWithdrawal, { exchangeID: 'bittrex' })]);

  mockExchangeService.getSuccessfulWithdrawals.resolves([]);

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

  mockExchangeService.isRootAsset.reset();
  mockExchangeService.isRootAsset.callsFake(async ({ symbol }) => symbol === 'USDT');

  mockExchangeService.findMarketQuoteAsset.reset();
  mockExchangeService.findMarketQuoteAsset.callsFake(async ({ asset, preferredQuoteAsset }) => {
    if (asset === 'USDT') {
      return 'USDT';
    }
    return preferredQuoteAsset;
  });
});

test('trader\'s first & second exchange ingress', async () => {
  await app.useCases.ingressTraderExchange({
    traderID: 'trader1',
    exchangeID: 'binance',
  });

  await app.useCases.ingressTraderExchange({
    traderID: 'trader1',
    exchangeID: 'bittrex',
  });

  const globalScores = await app.useCases.getTraderScoreHistory({ traderID: 'trader1' });
  expect(globalScores).toHaveLength(2);

  expect(globalScores).toContainEqual(expect.objectContaining({
    traderID: 'trader1',
    period: 'global',
    score: 1.10776554,
    time: sampleTime,
  }));

  expect(globalScores).toContainEqual(expect.objectContaining({
    traderID: 'trader1',
    period: 'global',
    score: 1,
    time: sampleTime - (24 * 61 * 60 * 1000),
  }));

  const weekScores = await app.useCases.getTraderScoreHistory({ traderID: 'trader1', period: 'week' });
  expect(weekScores).toHaveLength(2);

  expect(weekScores).toContainEqual(expect.objectContaining({
    traderID: 'trader1',
    period: 'week',
    score: 1.10776554,
    time: sampleTime,
  }));

  expect(weekScores).toContainEqual(expect.objectContaining({
    traderID: 'trader1',
    period: 'week',
    score: 1,
    time: sampleTime - (24 * 61 * 60 * 1000),
  }));

  const dayScores = await app.useCases.getTraderScoreHistory({ traderID: 'trader1', period: 'day' });
  expect(dayScores).toHaveLength(1);

  expect(dayScores).toContainEqual(expect.objectContaining({
    ID: expect.anything(),
    traderID: 'trader1',
    period: 'day',
    score: 1.10776554,
    time: sampleTime,
  }));
});

test('during exchange ingress, deposit ingress throws error', async () => {
  const exchangeIngressProm = app.useCases.ingressTraderExchange({
    traderID: 'trader1',
    exchangeID: 'binance',
  });

  const depositIngressProm = app.useCases.ingressDeposit(defaultDeposit);
  await expect(depositIngressProm).rejects.toThrow('Exchange ingress not complete');
  await exchangeIngressProm;
});

test('during exchange ingress, order ingress throws error', async () => {
  const exchangeIngressProm = app.useCases.ingressTraderExchange({
    traderID: 'trader1',
    exchangeID: 'binance',
  });

  const orderIngressProm = app.useCases.ingressFilledOrder(defaultOrder);
  await expect(orderIngressProm).rejects.toThrow('Exchange ingress not complete');
  await exchangeIngressProm;
});

test('during exchange ingress, withdrawal ingress throws error', async () => {
  const exchangeIngressProm = app.useCases.ingressTraderExchange({
    traderID: 'trader1',
    exchangeID: 'binance',
  });

  const withdrawalIngressProm = app.useCases.ingressWithdrawal(defaultWithdrawal);
  await expect(withdrawalIngressProm).rejects.toThrow('Exchange ingress not complete');
  await exchangeIngressProm;
});
