const Joi = require('joi');

const schema = Joi.object().keys({
  ID: Joi.string().label('ID'),
  traderID: Joi.string().required().label('Trader ID'),
  sourceID: Joi.string().required().label('Source ID'),
  exchangeID: Joi.string().required().label('Exchange ID'),
  asset: Joi.string().min(2).max(8).uppercase().required().label('Asset'),
  time: Joi.number().greater(0).required().label('Time'),
  quantity: Joi.number().positive().required().label('Quantity'),
}).unknown();

module.exports = class Trade {
  constructor(req) {
    const { error, value } = schema.validate(req);

    if (error != null) {
      throw new Error(error.details.map(detail => detail.message).join(', '));
    }

    this.ID = value.ID;
    this.traderID = value.traderID;
    this.sourceID = value.sourceID;
    this.exchangeID = value.exchangeID;
    this.asset = value.asset;
    this.time = value.time;
    this.quantity = value.quantity;
  }

  valid() {
    const { error } = schema.validate({
      ID: this.ID,
      traderID: this.traderID,
      sourceID: this.sourceID,
      exchangeID: this.exchangeID,
      asset: this.asset,
      time: this.time,
      quantity: this.quantity,
    });

    return error == null;
  }
};
