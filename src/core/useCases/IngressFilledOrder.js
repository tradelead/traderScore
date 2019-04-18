const debug = require('debug')('traderScore:IngressFilledOrder');
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

    const unitOfWork = await this.unitOfWorkFactory.create();
    try {
      const unitDebug = debug.extend(`${unitOfWork.idShort()}`);

      unitDebug('start');
      if (!value.past) {
        const ingressCompleted = await unitOfWork.exchangeIngressRepo.isComplete({
          traderID: value.traderID,
          exchangeID: value.exchangeID,
        });
        if (!ingressCompleted) {
          throw new Error('Exchange ingress not complete');
        }
      }
      unitDebug('exchangeIngressRepo completed');

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
      unitDebug('order added');
      await newTrade;
      unitDebug('new trades added');
      await unitOfWork.complete();
      unitDebug('unit of work completed');
    } catch (e) {
      await unitOfWork.rollback();
      throw e;
    }
  }
};
