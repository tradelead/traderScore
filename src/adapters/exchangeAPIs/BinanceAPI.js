const Binance = require('node-binance-api');
const memoize = require('memoizee');
const { promisify } = require('util');

module.exports = class BinanceAPI {
  constructor({ apiKey, rootAssets }) {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    this.rootAssets = rootAssets;
    this.getMarkets = memoize(this.getMarkets, { promise: true, maxAge: ONE_DAY_MS });
    this.binance = new Binance();
    this.binance.options({ APIKEY: apiKey, useServerTime: true });
    this.exchangeInfo = promisify(this.binance.exchangeInfo.bind(this.binance));
  }

  async isRootAsset(asset) {
    return this.rootAssets.includes(asset);
  }

  // eslint-disable-next-line class-methods-use-this
  async getMarkets() {
    const info = await this.exchangeInfo();
    return info.symbols.reduce((acc, { status, baseAsset, quoteAsset }) => {
      if (status === 'TRADING') {
        acc.push({ quoteAsset, asset: baseAsset });
      }

      return acc;
    }, []);
  }

  // eslint-disable-next-line class-methods-use-this
  getPrice({ asset, quoteAsset, time }) {
    return new Promise((resolve, reject) => {
      this.binance.candlesticks(`${asset}${quoteAsset}`, '1m', (err, ticks) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(ticks[0] && ticks[0][1] && parseFloat(ticks[0][1]));
      }, { startTime: time, limit: 1 });
    });
  }
};
