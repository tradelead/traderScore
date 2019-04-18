const Joi = require('joi');

const requestSchema = Joi.object().keys({
  period: Joi.string().label('Period'),
  limit: Joi.number().greater(0).max(100).required().label('Limit'),
});

module.exports = class GetTopTraders {
  constructor({ traderScoreRepo, allowedPeriods }) {
    this.traderScoreRepo = traderScoreRepo;
    this.allowedPeriods = allowedPeriods;
  }

  async execute(req) {
    const { error } = requestSchema.validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    if (req.period && !this.allowedPeriods.includes(req.period)) {
      throw new Error('Period is invalid');
    }

    const traders = await this.traderScoreRepo.getTopTraders(req);

    if (!req.period) {
      const addRank = (item, index) => Object.assign({}, item, { rank: index + 1 });
      return traders.map(addRank);
    }

    const traderIDs = traders.map(item => item.traderID);
    const traderRanks = await this.traderScoreRepo.getTraderRanks(traderIDs);

    const addTraderRanks = item => Object.assign(
      {},
      item,
      { rank: (traderRanks ? traderRanks[item.traderID] : null) },
    );

    return traders.map(addTraderRanks);
  }
};
