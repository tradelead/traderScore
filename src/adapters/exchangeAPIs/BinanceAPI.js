const axios = require('axios');
const axiosRetry = require('axios-retry');
const BigNumber = require('bignumber.js');
const memoize = require('memoizee');
const crypto = require('crypto');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = class BinanceAPI {
  constructor({ rootAssets, proxy }) {
    this.exchangeID = 'binance';
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    this.rootAssets = rootAssets;
    this.getMarkets = memoize(this.getMarkets, {
      promise: true,
      maxAge: ONE_DAY_MS,
    });
    this.getMarketsObj = memoize(this.getMarketsObj, {
      promise: true,
      maxAge: ONE_DAY_MS,
    });
    this.getAllOrders = memoize(this.getAllOrders, {
      promise: true,
      maxAge: 5 * 60000,
    });
    this.getAllTrades = memoize(this.getAllTrades, {
      promise: true,
      maxAge: 5 * 60000,
    });

    this.axios = axios.create({ proxy });

    axiosRetry(this.axios, {
      retries: 10,
      retryDelay: axiosRetry.exponentialDelay,
    });

    this.serverOffset = 0;
    const setServerOffsetTime = () => {
      (async () => {
        try {
          const rsp = await this.axios.get('https://api.binance.com/api/v1/time');
          this.serverOffset = rsp.data.serverTime - Date.now();
        } catch (e) {
          console.error(e);
        }
      })();
    };
    setServerOffsetTime();
    setInterval(() => {
      setServerOffsetTime();
    }, 5 * 60000);
  }

  async isRootAsset(asset) {
    return this.rootAssets.includes(asset);
  }

  // eslint-disable-next-line class-methods-use-this
  async getMarkets() {
    const info = await this.axios.get('https://api.binance.com/api/v1/exchangeInfo');
    return info.data.symbols.reduce((acc, { status, baseAsset, quoteAsset }) => {
      if (status === 'TRADING') {
        acc.push({
          quoteAsset,
          asset: baseAsset,
        });
      }

      return acc;
    }, []);
  }

  async getMarketsObj() {
    const markets = await this.getMarkets();
    return markets.reduce((acc, market) => {
      acc[`${market.asset}${market.quoteAsset}`] = market;
      return acc;
    }, {});
  }

  // eslint-disable-next-line class-methods-use-this
  async getPrice({ asset, quoteAsset, time }) {
    const url = `https://api.binance.com/api/v1/klines?symbol=${asset}${quoteAsset}&interval=1m&startTime=${time || 0}&limit=1`;
    const candles = await this.axios.get(url);
    return candles.data[0] && candles.data[0][1] && parseFloat(candles.data[0][1]);
  }

  async getFilledOrders({
    traderID,
    startTime,
    limit,
    sort,
    keys,
  }) {
    this.validateKeys(keys);

    const orders = await this.getAllOrders({ keys });

    if (!orders) {
      return null;
    }

    const symbols = {};
    const filledOrders = [];

    orders.forEach((order) => {
      symbols[order.symbol] = true;

      const closedAndFilled = (
        ['FILLED', 'CANCELED', 'EXPIRED', 'REJECTED'].includes(order.status)
        && parseFloat(order.executedQty) > 0
      );

      if (closedAndFilled && order.time >= startTime) {
        filledOrders.push(order);
      }
    });

    if (sort === 'asc') {
      filledOrders.sort((a, b) => a.time - b.time);
    } else {
      filledOrders.sort((a, b) => b.time - a.time);
    }

    filledOrders.splice(limit, filledOrders.length - limit);

    const marketObjProm = this.getMarketsObj();

    const trades = await this.getAllTrades({
      keys,
      symbols: Object.keys(symbols),
    });
    const tradesObj = (trades && trades.reduce((acc, trade) => {
      acc[trade.orderId] = acc[trade.orderId] || [];
      acc[trade.orderId].push(trade);
      return acc;
    }, {})) || {};

    const marketObj = await marketObjProm;

    return filledOrders.map((order) => {
      const market = marketObj[order.symbol];
      const orderTrades = tradesObj[order.orderId] || [];

      const fees = orderTrades.reduce((acc, trade) => {
        acc[trade.commissionAsset] = acc[trade.commissionAsset] || new BigNumber(0);
        acc[trade.commissionAsset] = acc[trade.commissionAsset].plus(trade.commission);

        return acc;
      }, {});

      const feeKeys = Object.keys(fees);
      if (feeKeys.length > 1) {
        throw new Error(`orders with multiple fee assets not supported (order #${order.orderId})`);
      } else if (feeKeys.length === 0) {
        throw new Error(`Order #${order.orderId}: no trades found`);
      }

      return {
        ID: null,
        traderID,
        sourceID: order.orderId,
        exchangeID: this.exchangeID,
        side: order.side === 'BUY' ? 'buy' : 'sell',
        asset: market.asset,
        quoteAsset: market.quoteAsset,
        time: parseInt(order.time, 10),
        quantity: parseFloat(order.executedQty),
        price: order.type === 'MARKET' ? order.cummulativeQuoteQty / order.executedQty : parseFloat(order.price),
        fee: {
          quantity: fees[feeKeys[0]].toNumber(),
          asset: feeKeys[0],
        },
      };
    });
  }

  // WARNING: this can take more than 5+ minutes to resolve
  async getAllOrders({ keys }) {
    const markets = await this.getMarkets();
    const orders = [];
    const ms = (60000 / 240);

    await Promise.all(markets.map(async (market, index) => {
      await sleep(ms * index);

      let noMore = false;
      let startTime = 0;

      while (!noMore) {
        const symbolOrders = await this.getSymbolOrders({
          keys,
          symbol: market.asset + market.quoteAsset,
          startTime,
        });

        orders.push(...symbolOrders);

        startTime = (orders[orders.length - 1] && orders[orders.length - 1].time) || 0;

        noMore = symbolOrders.length < 1000;
      }
    }));

    return orders;
  }

  async getSymbolOrders({ symbol, keys, startTime }) {
    const t = Date.now() - this.serverOffset;

    const rsp = await this.get({
      url: 'https://api.binance.com/api/v3/allOrders',
      query: `symbol=${symbol}&startTime=${startTime}&limit=1000&timestamp=${t}&recvWindow=5170000`,
      keys,
    });

    return (rsp && rsp.data) || [];
  }

  async getAllTrades({ symbols, keys }) {
    const trades = [];
    const ms = (60000 / 240);

    await Promise.all(symbols.map(async (symbol, index) => {
      await sleep(ms * index);

      let noMore = false;
      let startTime = 0;

      while (!noMore) {
        const symbolTrades = await this.getSymbolTrades({
          keys,
          symbol,
          startTime,
        });

        trades.push(...symbolTrades);

        startTime = (trades[trades.length - 1] && trades[trades.length - 1].time) || 0;

        noMore = symbolTrades.length < 1000;
      }
    }));

    return trades;
  }

  async getSymbolTrades({ symbol, keys, startTime }) {
    const t = Date.now() - this.serverOffset;

    const rsp = await this.get({
      url: 'https://api.binance.com/api/v3/myTrades',
      query: `symbol=${symbol}&startTime=${startTime}&limit=1000&timestamp=${t}&recvWindow=5170000`,
      keys,
    });

    return (rsp && rsp.data) || [];
  }

  async getWithdrawals({
    traderID,
    startTime,
    limit,
    sort,
    keys,
    status,
  }) {
    this.validateKeys(keys);

    const t = Date.now() - this.serverOffset;

    const statusCode = status === 'success' ? 6 : '';

    const rsp = await this.get({
      url: 'https://api.binance.com/wapi/v3/withdrawHistory.html',
      query: `startTime=${startTime}&status=${statusCode}&timestamp=${t}&recvWindow=5170000`,
      keys,
    });
    let withdrawals = (rsp && rsp.data && rsp.data.withdrawList) || [];

    if (sort === 'asc') {
      withdrawals.sort((a, b) => a.applyTime - b.applyTime);
    } else {
      withdrawals.sort((a, b) => b.applyTime - a.applyTime);
    }

    withdrawals = withdrawals.slice(0, limit);

    return withdrawals.map(withdrawal => ({
      ID: null,
      traderID,
      sourceID: withdrawal.id,
      exchangeID: this.exchangeID,
      asset: withdrawal.asset,
      time: withdrawal.applyTime,
      quantity: withdrawal.amount,
    }));
  }

  async getDeposits({
    traderID,
    startTime,
    limit,
    sort,
    keys,
    status,
  }) {
    this.validateKeys(keys);

    const t = Date.now() - this.serverOffset;

    const statusCode = status === 'success' ? 1 : '';

    const rsp = await this.get({
      url: 'https://api.binance.com/wapi/v3/depositHistory.html',
      query: `startTime=${startTime}&status=${statusCode}&timestamp=${t}&recvWindow=5170000`,
      keys,
    });
    let deposits = (rsp && rsp.data && rsp.data.depositList) || [];

    if (sort === 'asc') {
      deposits.sort((a, b) => a.insertTime - b.insertTime);
    } else {
      deposits.sort((a, b) => b.insertTime - a.insertTime);
    }

    deposits = deposits.slice(0, limit);

    return deposits.map(withdrawal => ({
      ID: null,
      traderID,
      sourceID: withdrawal.txId,
      exchangeID: this.exchangeID,
      asset: withdrawal.asset,
      time: withdrawal.insertTime,
      quantity: withdrawal.amount,
    }));
  }

  async getBalances({
    keys,
  }) {
    this.validateKeys(keys);

    const t = Date.now() - this.serverOffset;

    const rsp = await this.get({
      url: 'https://api.binance.com/api/v3/account',
      query: `timestamp=${t}&recvWindow=5170000`,
      keys,
    });
    const balances = (rsp && rsp.data && rsp.data.balances) || [];

    return balances.map(balance => ({
      asset: balance.asset,
      quantity: (new BigNumber(balance.free)).plus(balance.locked)
        .toNumber(),
    }));
  }

  // eslint-disable-next-line class-methods-use-this
  validateKeys(keys) {
    if (!keys.key) {
      throw new Error('Key is required.');
    }

    if (!keys.secret) {
      throw new Error('Secret is required.');
    }
  }

  async get({ url, query, keys }) {
    const sig = crypto.createHmac('sha256', keys.secret)
      .update(query)
      .digest('hex');

    const rsp = await this.axios.get(`${url}?${query}&signature=${sig}`, {
      headers: {
        'X-MBX-APIKEY': keys.key,
      },
    });

    return rsp;
  }
};
