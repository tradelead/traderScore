const memoize = require('memoizee');
const BinanceAPI = require('./BinanceAPI');

module.exports = class ExchangeAPIFactory {
  constructor() {
    this.get = memoize(this.get.bind(this));
  }

  // eslint-disable-next-line class-methods-use-this
  get(exchangeID) {
    if (exchangeID) {
      return new BinanceAPI();
    }

    throw new Error(`Exchange "${exchangeID}" not supported`);
  }
};
