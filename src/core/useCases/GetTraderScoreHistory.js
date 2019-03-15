const Joi = require('joi');

const requestSchema = Joi.object().keys({
  traderID: Joi.string().required().label('Trader ID'),
  startTime: Joi.number().greater(0).required().label('Start Time'),
  endTime: Joi.number().greater(0).required().label('End Time'),
});

module.exports = class GetTraderScoreHistory {
  constructor({ traderRepo }) {
    this.traderRepo = traderRepo;
  }

  async execute(req) {
    const { error, value } = requestSchema.validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const { traderID, startTime, endTime } = value;

    const scoreHistories = await this.traderRepo.getTradersScoreHistories([{
      traderID,
      startTime,
      endTime,
    }]);

    if (!Array.isArray(scoreHistories)) {
      throw new Error('Unexpected response from traderRepo.getTradersScoreHistories');
    }

    return (scoreHistories.length === 1 ? scoreHistories[0] : null);
  }
};
