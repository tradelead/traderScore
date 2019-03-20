const Joi = require('joi');
const BigNumber = require('bignumber.js');

module.exports = class ExchangeService {
  constructor({ exchangeAPIFactory, traderPortfolioRepo, traderExchangeKeysRepo }) {
    this.exchangeAPIFactory = exchangeAPIFactory;
    this.traderPortfolioRepo = traderPortfolioRepo;
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
      time: Joi.number().label('Time'),
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
    const {
      exchangeID,
      asset,
      quoteAsset,
      time,
      qty,
      price,
    } = req;

    if (asset === 'BTC') {
      return qty;
    }

    const qtyBigNum = new BigNumber(qty);

    if (quoteAsset === 'BTC') {
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
};
