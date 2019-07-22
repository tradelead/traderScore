const Joi = require('joi');
const Withdrawal = require('../models/Withdrawal');

const schema = Joi.object().keys({
  traderID: Joi.string().required().label('Trader ID'),
  sourceID: Joi.string().required().label('Source ID'),
  exchangeID: Joi.string().required().label('Exchange ID'),
  asset: Joi.string().min(2).max(8).uppercase().required().label('Asset'),
  time: Joi.number().greater(0).required().label('Time'),
  quantity: Joi.number().positive().required().label('Quantity'),
  past: Joi.boolean().label('Past'),
  catchInsufficientEntry: Joi.boolean().label('Catch Insufficient Entry'),
}).unknown();

module.exports = class IngressWithdrawal {
  constructor({ unitOfWorkFactory }) {
    this.unitOfWorkFactory = unitOfWorkFactory;
  }

  async execute(req) {
    console.log('IngressWithdrawal', req);
    const { error, value } = schema.validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const withdrawal = new Withdrawal(value);

    const unitOfWork = await this.unitOfWorkFactory.create();

    try {
      if (!value.past) {
        const ingressCompleted = await unitOfWork.exchangeIngressRepo.isComplete({
          traderID: value.traderID,
          exchangeID: value.exchangeID,
        });
        if (!ingressCompleted) {
          throw new Error('Exchange ingress not complete');
        }
      }

      const newTrade = unitOfWork.tradeService.newTrade({
        sourceType: 'withdrawal',
        sourceID: value.sourceID,
        traderID: value.traderID,
        exchangeID: value.exchangeID,
        asset: value.asset,
        exitQuantity: value.quantity,
        exitTime: value.time,
        disableScoring: value.past,
        incrementScores: !value.past,
      });

      await unitOfWork.transferService.addWithdrawal(withdrawal);
      console.log('IngressWithdrawal: withdrawal saved', withdrawal);

      try {
        const trades = await newTrade;
        console.log('IngressWithdrawal: new trades', trades);
      } catch (e) {
        if (e.message !== 'Insufficient entries') {
          throw e;
        } else {
          console.log('IngressFilledOrder: newTrade Error Ignored:', e);
        }
      }

      await unitOfWork.complete();
      console.log('IngressWithdrawal: unit of work complete');
    } catch (e) {
      await unitOfWork.rollback();
      throw e;
    }
  }
};
