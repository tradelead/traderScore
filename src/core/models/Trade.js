const Joi = require('joi');

const schema = Joi.object().keys({
  ID: Joi.string().label('ID'),
  traderID: Joi.string().required().label('Trader ID'),
  sourceID: Joi.string().required().label('Source ID'),
  sourceType: Joi.string().lowercase().valid(['order', 'withdrawal']).required().label('Source Type'),
  exchangeID: Joi.string().required().label('Exchange ID'),
  asset: Joi.string().min(2).max(8).required().label('Asset'),
  quoteAsset: Joi.string().min(2).max(8).required().label('Quote Asset'),
  quantity: Joi.number().positive().required().label('Quantity'),
  entry: Joi.object().keys({
    sourceID: Joi.string().required().label('Entry Source ID'),
    sourceType: Joi.string().lowercase().valid(['order', 'deposit', 'withdrawal']).required().label('Entry Source Type'),
    price: Joi.number().positive().required().label('Entry Price'),
    time: Joi.number().positive().required().label('Entry Time'),
  }),
  exit: Joi.object().keys({
    price: Joi.number().positive().required().label('Exit Price'),
    time: Joi.number().positive().required().label('Exit Time'),
  }),
  weight: Joi.number().min(0).max(1).required().label('Weight'),
  score: Joi.number().required().label('Score'),
});

module.exports = class Trade {
  constructor(req) {
    const { error, value } = schema.validate(req);

    if (error != null) {
      throw new Error(error.details.map(detail => detail.message).join(', '));
    }

    this.ID = value.ID;
    this.traderID = value.traderID;
    this.sourceID = value.sourceID;
    this.sourceType = value.sourceType;
    this.exchangeID = value.exchangeID;
    this.asset = value.asset;
    this.quoteAsset = value.quoteAsset;
    this.time = value.time;
    this.quantity = value.quantity;
    this.entry = value.entry;
    this.exit = value.exit;
    this.weight = value.weight;
    this.score = value.score;
  }

  valid() {
    const { error } = schema.validate({
      ID: this.ID,
      traderID: this.traderID,
      sourceID: this.sourceID,
      sourceType: this.sourceType,
      exchangeID: this.exchangeID,
      asset: this.asset,
      quoteAsset: this.quoteAsset,
      time: this.time,
      quantity: this.quantity,
      entry: this.entry,
      exit: this.exit,
      weight: this.weight,
      score: this.score,
    });

    return error == null;
  }
};
