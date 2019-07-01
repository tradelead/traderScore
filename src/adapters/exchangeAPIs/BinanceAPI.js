const axios = require('axios');
const axiosRetry = require('axios-retry');
const memoize = require('memoizee');

module.exports = class BinanceAPI {
  constructor({ rootAssets }) {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    this.rootAssets = rootAssets;
    this.getMarkets = memoize(this.getMarkets, { promise: true, maxAge: ONE_DAY_MS });

    this.axios = axios.create();

    axiosRetry(this.axios, {
      retries: 10,
      retryDelay: axiosRetry.exponentialDelay,
    });
  }

  async isRootAsset(asset) {
    return this.rootAssets.includes(asset);
  }

  // eslint-disable-next-line class-methods-use-this
  async getMarkets() {
    const info = await this.axios.get('https://api.binance.com/api/v1/exchangeInfo');
    return info.data.symbols.reduce((acc, { status, baseAsset, quoteAsset }) => {
      if (status === 'TRADING') {
        acc.push({ quoteAsset, asset: baseAsset });
      }

      return acc;
    }, []);
  }

  // eslint-disable-next-line class-methods-use-this
  async getPrice({ asset, quoteAsset, time }) {
    const url = `https://api.binance.com/api/v1/klines?symbol=${asset}${quoteAsset}&interval=1m&startTime=${time || 0}&limit=1`;
    const candles = await this.axios.get(url);
    return candles.data[0] && candles.data[0][1] && parseFloat(candles.data[0][1]);
  }
};
