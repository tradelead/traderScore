const Joi = require('joi');

const requestSchema = Joi.object().keys({
  traderID: Joi.string().required().label('Trader ID'),
  startTime: Joi.number().greater(0).label('Start Time'),
  endTime: Joi.number().greater(0).label('End Time'),
  limit: Joi.number().default(100).less(500).label('Limit'),
});

module.exports = class GetTraderScoreHistory {
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
      traderID,
      startTime,
      endTime,
      limit,
    } = value;

    const scoreHistories = await this.traderScoreRepo.getTradersScoreHistories([{
      traderID,
      startTime,
      endTime,
      limit,
    }]);

    if (!Array.isArray(scoreHistories)) {
      throw new Error('Unexpected response from traderScoreRepo.getTradersScoreHistories');
    }

    return (scoreHistories.length === 1 ? scoreHistories[0] : null);
  }
};
