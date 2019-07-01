const memoize = require('memoizee');
const BinanceAPI = require('./BinanceAPI');

module.exports = class ExchangeAPIFactory {
  constructor() {
    this.get = memoize(this.get.bind(this));

    this.binanceRootAssets = ['USDT', 'USDC', 'TUSD', 'PAX', 'USDS'];
  }

  // eslint-disable-next-line class-methods-use-this
  get(exchangeID) {
    if (exchangeID) {
      return new BinanceAPI({ rootAssets: this.binanceRootAssets });
    }

    throw new Error(`Exchange "${exchangeID}" not supported`);
  }
};
