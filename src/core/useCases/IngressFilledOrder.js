const Joi = require('joi');
const BigNumber = require('bignumber.js');
const Order = require('../models/Order');

const schema = Joi.object().keys({
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

module.exports = class IngressFilledOrder {
  constructor({ unitOfWorkFactory }) {
    this.unitOfWorkFactory = unitOfWorkFactory;
  }

  async execute(req) {
    console.log('IngressFilledOrder', req);
    const { error, value } = schema.validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const unitOfWork = await this.unitOfWorkFactory.create();
    try {
      const order = new Order(value);

      const saveOrder = unitOfWork.orderService.add(order);

      let tradeAsset = '';
      let tradeQty = 0;

      if (order.side === 'buy') {
        tradeAsset = order.quoteAsset;
        const qtyBigNum = new BigNumber(order.quantity);
        tradeQty = qtyBigNum.times(order.price).toNumber();
      } else {
        tradeAsset = order.asset;
        tradeQty = order.quantity;
      }

      const newTrade = unitOfWork.tradeService.newTrade({
        sourceType: 'order',
        sourceID: order.sourceID,
        traderID: order.traderID,
        exchangeID: order.exchangeID,
        asset: tradeAsset,
        exitQuantity: tradeQty,
        exitTime: order.time,
        disableScoring: value.past,
        incrementScores: !value.past,
      });

      await saveOrder;
      console.log('IngressFilledOrder: order saved', order);
      const trades = await newTrade;
      console.log('IngressFilledOrder: new trades', trades);
      await unitOfWork.complete();
      console.log('IngressFilledOrder: unit of work completed');
    } catch (e) {
      await unitOfWork.rollback();
      throw e;
    }
  }
};
