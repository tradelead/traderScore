const Joi = require('joi');

const schema = Joi.object().keys({
  traderID: Joi.string().required().label('Trader ID'),
  period: Joi.string().label('Period'),
});

module.exports = class CalculateTraderScore {
  constructor({ unitOfWorkFactory }) {
    this.unitOfWorkFactory = unitOfWorkFactory;
  }

  async execute(req) {
    const { error, value } = schema.validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const { traderID, period } = value;
    const unitOfWork = await this.unitOfWorkFactory.create();

    try {
      const score = await unitOfWork.scoreService.calculateScore({
        traderID,
        period,
      });
      await unitOfWork.complete();
      return score;
    } catch (e) {
      await unitOfWork.rollback();
      throw e;
    }
  }
};
