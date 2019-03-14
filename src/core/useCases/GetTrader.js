const Joi = require('joi');

const traderIDSchema = Joi.string().required().label('Trader ID');

module.exports = class GetTrader {
  constructor({ traderRepo }) {
    this.traderRepo = traderRepo;
  }

  async execute(traderID) {
    const { error } = traderIDSchema.validate(traderID);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    return this.traderRepo.getTrader(traderID);
  }
};
