const Joi = require('joi');

const schema = Joi.object().keys({
  ID: Joi.string().label('ID'),
  traderID: Joi.string().required().label('Trader ID'),
  sourceID: Joi.string().required().label('Source ID'),
  exchangeID: Joi.string().required().label('Exchange ID'),
  side: Joi.string().lowercase().valid(['buy', 'sell']).required().label('Side'),
  asset: Joi.string().min(2).max(8).uppercase().required().label('Asset'),
  quoteAsset: Joi.string().min(2).max(8).uppercase().required().label('Quote Asset'),
  time: Joi.number().greater(0).required().label('Time'),
  quantity: Joi.number().positive().required().label('Quantity'),
  price: Joi.number().positive().required().label('Price'),
  fee: Joi.object().keys({
    quantity: Joi.number().label('Fee Quantity'),
    asset: Joi.string().max(8).uppercase().label('Fee Asset'),
  }),
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
    this.side = value.side;
    this.asset = value.asset;
    this.quoteAsset = value.quoteAsset;
    this.time = value.time;
    this.quantity = value.quantity;
    this.price = value.price;
    this.fee = value.fee;
  }

  valid() {
    const { error } = schema.validate({
      ID: this.ID,
      traderID: this.traderID,
      sourceID: this.sourceID,
      exchangeID: this.exchangeID,
      side: this.side,
      asset: this.asset,
      quoteAsset: this.quoteAsset,
      time: this.time,
      quantity: this.quantity,
      price: this.price,
      fee: this.fee,
    });

    return error == null;
  }
};
