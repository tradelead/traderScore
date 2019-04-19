const sinon = require('sinon');

const app = require('../../src/app.bootstrap');

const Order = require('../../src/core/models/Order');
const Deposit = require('../../src/core/models/Deposit');
const Withdrawal = require('../../src/core/models/Withdrawal');

const ExchangeService = require('../../src/core/services/ExchangeService');

const flushDbs = require('../flushDBs');

jest.mock('../../src/core/services/ExchangeService');

let defaultOrder;
let defaultDeposit;
let defaultWithdrawal;

beforeEach(async () => {
  await flushDbs();

  const sampleTime = 1555377480513;
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

  mockExchangeService.getFilledOrders.reset();
  mockExchangeService.getFilledOrders
    .withArgs(sinon.match({ exchangeID: 'binance' }))
    .onFirstCall()
    .resolves([defaultOrder]);
  mockExchangeService.getFilledOrders.resolves([]);

  mockExchangeService.getSuccessfulDeposits.reset();
  mockExchangeService.getSuccessfulDeposits
    .withArgs(sinon.match({ exchangeID: 'binance' }))
    .onFirstCall()
    .resolves([defaultDeposit]);
  mockExchangeService.getSuccessfulDeposits.resolves([]);

  mockExchangeService.getSuccessfulWithdrawals.reset();
  mockExchangeService.getSuccessfulWithdrawals
    .withArgs(sinon.match({ exchangeID: 'binance' }))
    .onFirstCall()
    .resolves([defaultWithdrawal]);
  mockExchangeService.getSuccessfulWithdrawals.resolves([]);

  mockExchangeService.getPrice.reset();
  mockExchangeService.getPrice.resolves(1);

  mockExchangeService.getBTCValue.reset();
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

test('can ingress then remove then re-ingress', async () => {
  await app.useCases.ingressTraderExchange({
    traderID: 'trader1',
    exchangeID: 'binance',
  });

  await app.useCases.removeTraderExchange({
    traderID: 'trader1',
    exchangeID: 'binance',
  });

  const orderIngressProm = app.useCases.ingressFilledOrder(defaultOrder);
  await expect(orderIngressProm).rejects.toThrow('Exchange ingress not complete');

  await app.useCases.ingressTraderExchange({
    traderID: 'trader1',
    exchangeID: 'binance',
  });
});

test('cannot ingress items after removed', async () => {
  await app.useCases.ingressTraderExchange({
    traderID: 'trader1',
    exchangeID: 'binance',
  });

  await app.useCases.removeTraderExchange({
    traderID: 'trader1',
    exchangeID: 'binance',
  });

  const depositIngressProm = app.useCases.ingressDeposit(defaultDeposit);
  await expect(depositIngressProm).rejects.toThrow('Exchange ingress not complete');

  const orderIngressProm = app.useCases.ingressFilledOrder(defaultOrder);
  await expect(orderIngressProm).rejects.toThrow('Exchange ingress not complete');

  const withdrawalIngressProm = app.useCases.ingressWithdrawal(defaultWithdrawal);
  await expect(withdrawalIngressProm).rejects.toThrow('Exchange ingress not complete');
});
