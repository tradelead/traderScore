const mock = require('mock-require');

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

// eslint-disable-next-line prefer-arrow-callback
mock('../../src/core/services/ExchangeService', function () {
  return {
    getFilledOrders: oncePerTraderID([], []),
    getSuccessfulDeposits: oncePerTraderID([], []),
    getSuccessfulWithdrawals: oncePerTraderID([], []),
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

const app = require('../../src/app.bootstrap');

module.exports = async function (req, callback) {
  try {
    await app.useCases.ingressFilledOrder(req);
    callback(null, req);
  } catch (e) {
    callback(e, req);
  }
};
