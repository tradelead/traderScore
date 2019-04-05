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
  past: Joi.boolean().label('Past'),
}).unknown();

module.exports = class IngressFilledOrder {
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

    this.unitOfWork = await this.unitOfWorkFactory.create();
    this.orderRepo = this.unitOfWork.orderRepo;
    this.tradeService = this.unitOfWork.tradeService;

    if (!value.past) {
      const ingressCompleted = await this.unitOfWork.exchangeIngressRepo.isComplete({
        traderID: value.traderID,
        exchangeID: value.exchangeID,
      });
      if (!ingressCompleted) {
        throw new Error('Exchange ingress not complete');
      }
    }

    const order = new Order(value);

    const saveOrder = this.orderRepo.add(order);

    let tradeAsset = '';
    let tradeQty = 0;

    if (order.side === 'buy') {
      tradeAsset = order.asset;
      const qtyBigNum = new BigNumber(order.quantity);
      tradeQty = qtyBigNum.times(order.price).toNumber();
    } else {
      tradeAsset = order.quoteAsset;
      tradeQty = order.quantity;
    }

    const newTrade = this.tradeService.newTrade({
      sourceType: 'order',
      sourceID: order.sourceID,
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: tradeAsset,
      exitQuantity: tradeQty,
      exitTime: order.time,
      incrementScores: !value.past,
    });

    try {
      await saveOrder;
      await newTrade;
      await this.unitOfWork.complete();
    } catch (e) {
      await this.unitOfWork.rollback();
      throw e;
    }
  }
};
