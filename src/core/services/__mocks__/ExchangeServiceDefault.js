const sinon = require('sinon');
const Order = require('../../models/Order');
const Deposit = require('../../models/Deposit');
const Withdrawal = require('../../models/Withdrawal');

const mockExchangeService = {
  getFilledOrders: sinon.stub(),
  getSuccessfulDeposits: sinon.stub(),
  getSuccessfulWithdrawals: sinon.stub(),
  getPrice: sinon.stub(),
  getBTCValue: sinon.stub(),
  isRootAsset: async ({ symbol }) => symbol === 'USDT',
  findMarketQuoteAsset: async ({ asset, preferredQuoteAsset }) => {
    if (asset === 'USDT') {
      return 'USDT';
    }
    return preferredQuoteAsset;
  },
};

const sampleTime = Date.now();
const defaultOrder = new Order({
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

const defaultDeposit = new Deposit({
  traderID: 'trader1',
  sourceID: 'transfer1',
  exchangeID: 'binance',
  asset: 'USDT',
  time: sampleTime - (2 * 24 * 61 * 60 * 1000),
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

function oncePerTraderExchange(onceValueFn, defaultValue) {
  const cache = {};
  return async ({ traderID, exchangeID }) => {
    const key = `${traderID}-${exchangeID}`;
    if (cache[key]) {
      return defaultValue;
    }

    cache[key] = true;
    return onceValueFn({ traderID, exchangeID });
  };
}

mockExchangeService.getFilledOrders.reset();
mockExchangeService.getFilledOrders
  .callsFake(oncePerTraderExchange(
    ({ traderID, exchangeID }) => [
      Object.assign({}, defaultOrder, { traderID, exchangeID }),
    ],
    [],
  ));

mockExchangeService.getSuccessfulDeposits
  .callsFake(oncePerTraderExchange(
    ({ traderID, exchangeID }) => [
      Object.assign({}, defaultDeposit, { traderID, exchangeID }),
    ],
    [],
  ));

mockExchangeService.getSuccessfulWithdrawals
  .callsFake(oncePerTraderExchange(
    ({ traderID, exchangeID }) => [
      Object.assign({}, defaultWithdrawal, { traderID, exchangeID }),
    ],
    [],
  ));

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

// eslint-disable-next-line prefer-arrow-callback
module.exports = function () { return mockExchangeService; };
