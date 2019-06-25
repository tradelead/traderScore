const memoize = require('memoizee');
const BinanceAPI = require('./BinanceAPI');

module.exports = class ExchangeAPIFactory {
  constructor({ binanceAPIKey }) {
    this.get = memoize(this.get.bind(this));
    this.binanceAPIKey = binanceAPIKey;
  }

  // eslint-disable-next-line class-methods-use-this
  get(exchangeID) {
    if (exchangeID) {
      return new BinanceAPI({ apiKey: this.binanceAPIKey });
    }

    throw new Error(`Exchange "${exchangeID}" not supported`);
  }
};
