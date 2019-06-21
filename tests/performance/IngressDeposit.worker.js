const mock = require('mock-require');

// const Deposit = require('../../src/core/models/Deposit');

// const orders = [defaultOrder];
// const deposits = [defaultDeposit];
// const withdrawals = [defaultWithdrawal];

mock('../../src/core/services/ExchangeService', function () {
  return {
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
    await app.useCases.ingressDeposit(req);
    callback(null, req);
  } catch (e) {
    callback(e, req);
  }
};
