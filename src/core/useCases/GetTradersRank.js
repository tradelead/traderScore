const Joi = require('joi');

const requestSchema = Joi.object().keys({
  traderIDs: Joi.array().max(100).required().label('Trader IDs'),
});

module.exports = class GetTradersRank {
  constructor({ traderScoreRepo }) {
    this.traderScoreRepo = traderScoreRepo;
  }

  async execute(req) {
    const { error, value } = requestSchema.validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const {
      traderIDs,
    } = value;

    return this.traderScoreRepo.getTraderRanks(traderIDs);
  }
};
