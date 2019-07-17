const Joi = require('joi');
const BigNumber = require('bignumber.js');

module.exports = class ExchangeService {
  constructor({ exchangeAPIFactory, traderExchangeKeysRepo }) {
    this.exchangeAPIFactory = exchangeAPIFactory;
    this.traderExchangeKeysRepo = traderExchangeKeysRepo;
  }

  async getFilledOrders(req) {
    const { error, value } = Joi.object().keys({
      exchangeID: Joi.string().required().label('Exchange ID'),
      traderID: Joi.string().required().label('Trader ID'),
      startTime: Joi.number().label('Start Time'),
      limit: Joi.number().positive().label('Limit'),
      sort: Joi.string().default('asc').valid(['asc', 'desc']).label('Sort'),
    }).validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const {
      exchangeID,
      traderID,
      startTime,
      limit,
      sort,
    } = value;

    const exchangeAPI = this.exchangeAPIFactory.get(exchangeID);
    const keys = await this.traderExchangeKeysRepo.get({ exchangeID, traderID });

    return exchangeAPI.getFilledOrders({
      traderID,
      startTime,
      limit,
      sort,
      keys,
    });
  }

  async getSuccessfulDeposits(req) {
    const { error, value } = Joi.object().keys({
      exchangeID: Joi.string().required().label('Exchange ID'),
      traderID: Joi.string().required().label('Trader ID'),
      startTime: Joi.number().label('Start Time'),
      limit: Joi.number().positive().label('Limit'),
      sort: Joi.string().default('asc').valid(['asc', 'desc']).label('Sort'),
    }).validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const {
      exchangeID,
      traderID,
      startTime,
      limit,
      sort,
    } = value;

    const exchangeAPI = this.exchangeAPIFactory.get(exchangeID);
    const keys = await this.traderExchangeKeysRepo.get({ exchangeID, traderID });

    return exchangeAPI.getDeposits({
      traderID,
      startTime,
      limit,
      sort,
      keys,
      status: 'success',
    });
  }

  async getSuccessfulWithdrawals(req) {
    const { error, value } = Joi.object().keys({
      exchangeID: Joi.string().required().label('Exchange ID'),
      traderID: Joi.string().required().label('Trader ID'),
      startTime: Joi.number().label('Start Time'),
      limit: Joi.number().positive().label('Limit'),
      sort: Joi.string().default('asc').valid(['asc', 'desc']).label('Sort'),
    }).validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const {
      exchangeID,
      traderID,
      startTime,
      limit,
      sort,
    } = value;

    const exchangeAPI = this.exchangeAPIFactory.get(exchangeID);
    const keys = await this.traderExchangeKeysRepo.get({ exchangeID, traderID });

    return exchangeAPI.getWithdrawals({
      traderID,
      startTime,
      limit,
      sort,
      keys,
      status: 'success',
    });
  }

  async isRootAsset({ exchangeID, symbol }) {
    const exchangeAPI = this.exchangeAPIFactory.get(exchangeID);

    return exchangeAPI.isRootAsset(symbol);
  }

  async getPrice(req) {
    const { error, value } = Joi.object().keys({
      exchangeID: Joi.string().required().label('Exchange ID'),
      asset: Joi.string().min(2).max(8).required().label('Asset'),
      quoteAsset: Joi.string().min(2).max(8).required().label('Quote Asset'),
      time: Joi.number().required().label('Time'),
    }).validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const {
      exchangeID,
      asset,
      quoteAsset,
      time,
    } = value;

    const exchangeAPI = this.exchangeAPIFactory.get(exchangeID);

    if (await exchangeAPI.isRootAsset(asset)) {
      return 1;
    }

    return exchangeAPI.getPrice({ asset, quoteAsset, time });
  }

  async getBTCValue(req) {
    const { error, value } = Joi.object().keys({
      exchangeID: Joi.string().required().label('Exchange ID'),
      asset: Joi.string().min(2).max(8).required().label('Asset'),
      quoteAsset: Joi.string().min(2).max(8).required().label('Quote Asset'),
      time: Joi.number().required().label('Time'),
      qty: Joi.number().positive().required().label('Quantity'),
      price: Joi.number().label('Price'),
    }).validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const {
      exchangeID,
      asset,
      quoteAsset,
      time,
      qty,
      price,
    } = value;

    if (asset === 'BTC') {
      return qty;
    }

    const qtyBigNum = new BigNumber(qty);

    if (quoteAsset === 'BTC' && price > 0) {
      return qtyBigNum.times(price).toNumber();
    }

    if (await this.isRootAsset({ exchangeID, asset })) {
      const rootAssetBTCPrice = await this.getPrice({
        exchangeID,
        asset: 'BTC',
        quoteAsset: asset,
        time,
      });
      return qtyBigNum.div(rootAssetBTCPrice).toNumber();
    }

    const assetBTCPrice = await this.getPrice({
      exchangeID,
      asset,
      quoteAsset: 'BTC',
      time,
    });

    return qtyBigNum.times(assetBTCPrice).toNumber();
  }

  async findMarketQuoteAsset(req) {
    const { error, value } = Joi.object().keys({
      exchangeID: Joi.string().required().label('Exchange ID'),
      asset: Joi.string().required().label('Asset'),
      preferredQuoteAsset: Joi.string().label('Preferred Quote Asset'),
    }).validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const {
      exchangeID,
      asset,
      preferredQuoteAsset,
    } = value;

    const exchangeAPI = this.exchangeAPIFactory.get(exchangeID);

    if (await exchangeAPI.isRootAsset(asset)) {
      return asset;
    }

    const markets = await exchangeAPI.getMarkets();

    if (!markets || markets.length === 0) {
      throw new Error('error retrieving exchange markets');
    }

    const marketsObj = markets.reduce((obj, market) => {
      if (market.asset === asset) {
        const objKey = market.asset + market.quoteAsset;
        const newObj = Object.assign({}, obj);
        newObj[objKey] = market;

        return newObj;
      }

      return obj;
    }, {});

    const preferredMarket = marketsObj[asset + preferredQuoteAsset];
    if (preferredMarket) {
      return preferredQuoteAsset;
    }

    const firstKey = Object.keys(marketsObj)[0];
    return marketsObj[firstKey].quoteAsset;
  }

  async getBalances(req) {
    const { error, value } = Joi.object().keys({
      exchangeID: Joi.string().required().label('Exchange ID'),
      traderID: Joi.string().required().label('Trader ID'),
    }).validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const {
      exchangeID,
      traderID,
    } = value;

    const exchangeAPI = this.exchangeAPIFactory.get(exchangeID);
    const keys = await this.traderExchangeKeysRepo.get({ exchangeID, traderID });

    return exchangeAPI.getBalances({ traderID, keys });
  }
};
