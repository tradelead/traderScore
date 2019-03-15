const Joi = require('joi');

const requestSchema = Joi.object().keys({
  period: Joi.string().label('Period'),
  limit: Joi.number().greater(0).required().label('Limit'),
});

module.exports = class GetTopTraders {
  constructor({ traderRepo }) {
    this.traderRepo = traderRepo;
  }

  async execute(req) {
    const { error } = requestSchema.validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const traders = this.traderRepo.getTopTraders(req);
  }
};
