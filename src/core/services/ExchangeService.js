const Joi = require('joi');

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
  }
};
