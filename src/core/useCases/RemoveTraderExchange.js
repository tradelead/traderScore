const Joi = require('joi');

const requestSchema = Joi.object().keys({
  traderID: Joi.string().required().label('Trader ID'),
  exchangeID: Joi.string().required().label('Exchange ID'),
});

module.exports = class RemoveTraderExchange {
  constructor({ exchangeWatchRepo }) {
    this.exchangeWatchRepo = exchangeWatchRepo;
  }

  async execute(req) {
    const { error, value } = requestSchema.validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    await this.exchangeWatchRepo.remove({ traderID: value.traderID, exchangeID: value.exchangeID });

    return true;
  }
};
