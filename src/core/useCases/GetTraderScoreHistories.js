const Joi = require('joi');

const requestSchema = Joi.array().items(Joi.object().keys({
  traderID: Joi.string().required().label('Trader ID'),
  startTime: Joi.number().greater(0).label('Start Time'),
  endTime: Joi.number().greater(0).label('End Time'),
  limit: Joi.number().default(10).less(100).label('Limit'),
  period: Joi.string().label('Period'),
  duration: Joi.number().label('Duration'),
  groupBy: Joi.string().valid('day', 'week').label('Group By'),
})).max(20);

module.exports = class GetTraderScoreHistories {
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

    const scoreHistories = await this.traderScoreRepo.getTradersScoreHistories(value);

    if (!Array.isArray(scoreHistories)) {
      throw new Error('Unexpected response from traderScoreRepo.getTradersScoreHistories');
    }

    return scoreHistories;
  }
};
