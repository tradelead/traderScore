const mock = require('mock-require');

const Order = require('../../src/core/models/Order');
const Deposit = require('../../src/core/models/Deposit');
const Withdrawal = require('../../src/core/models/Withdrawal');

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

const orders = [defaultOrder];
const deposits = [defaultDeposit];
const withdrawals = [defaultWithdrawal];

mock('../../src/core/services/ExchangeService', function () {
  return {
    getFilledOrders: oncePerTraderID(orders, []),
    getSuccessfulDeposits: oncePerTraderID(deposits, []),
    getSuccessfulWithdrawals: oncePerTraderID(withdrawals, []),
    isRootAsset: async ({ symbol }) => symbol === 'USDT',
    getPrice: async () => 1,
    getBTCValue: async () => 1,
    findMarketQuoteAsset: async ({ asset, preferredQuoteAsset }) => {
      if (asset === 'USDT') {
        return 'USDT';
      }
      return preferredQuoteAsset;
    },
  };
});

const app = require('../../app.bootstrap');

module.exports = async function (req, callback) {
  try {
    await app.useCases.ingressTraderExchange(req);
    callback(null, req);
  } catch (e) {
    callback(e, req);
  }
};
