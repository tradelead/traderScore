const Joi = require('joi');

const requestSchema = Joi.object().keys({
  traderID: Joi.string().required().label('Trader ID'),
  exchangeID: Joi.string().required().label('Exchange ID'),
});

module.exports = class IngressTraderExchange {
  constructor({
    ingressDeposit,
    ingressFilledOrder,
    ingressWithdrawal,
    exchangeService,
    orderService,
    transferService,
    exchangeActivityLimitPerFetch,
    exchangeIngressRepo,
    scoreService,
  }) {
    this.ingressDeposit = ingressDeposit;
    this.ingressFilledOrder = ingressFilledOrder;
    this.ingressWithdrawal = ingressWithdrawal;
    this.exchangeService = exchangeService;
    this.orderService = orderService;
    this.transferService = transferService;
    this.exchangeActivityLimitPerFetch = exchangeActivityLimitPerFetch;
    this.exchangeIngressRepo = exchangeIngressRepo;
    this.scoreService = scoreService;
  }

  async execute(req) {
    const { error, value } = requestSchema.validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const { traderID, exchangeID } = value;

    const lastOrders = await this.orderService.getFilledOrders({
      traderID,
      exchangeID,
      limit: 1,
      sort: 'desc',
    });
    const ordersStartTime = (lastOrders && lastOrders.length > 0 ? lastOrders[0].time : 0);

    const lastDeposits = await this.transferService.findDeposits({
      traderID,
      exchangeID,
      limit: 1,
      sort: 'desc',
    });
    const depositsStartTime = (lastDeposits && lastDeposits.length > 0 ? lastDeposits[0].time : 0);

    const lastWithdraws = await this.transferService.findWithdrawals({
      traderID,
      exchangeID,
      limit: 1,
      sort: 'desc',
    });
    const hasWithdraws = lastWithdraws && lastWithdraws.length > 0;
    const withdrawalsStartTime = (hasWithdraws ? lastWithdraws[0].time : 0);

    await this.ingressActivity({
      firstRun: true,
      activity: [],
      ordersLeft: 0,
      ordersStartTime,
      depositsLeft: 0,
      depositsStartTime,
      withdrawalsLeft: 0,
      withdrawalsStartTime,
      traderID,
      exchangeID,
    });

    await this.scoreService.calculateScores(traderID);

    await this.exchangeIngressRepo.markComplete({ traderID, exchangeID });

    return true;
  }

  async ingressActivity({
    activity,
    ordersLeft,
    ordersStartTime,
    depositsLeft,
    depositsStartTime,
    withdrawalsLeft,
    withdrawalsStartTime,
    traderID,
    exchangeID,
    firstRun,
  }) {
    if (ordersLeft === 0 && depositsLeft === 0 && withdrawalsLeft === 0 && !firstRun) {
      return;
    }

    let ordersLeftNew = ordersLeft;
    let depositsLeftNew = depositsLeft;
    let withdrawalsLeftNew = withdrawalsLeft;

    const item = activity.pop();

    if (item) {
      if (item.type === 'order') {
        await this.ingressFilledOrder.execute(item);
        ordersLeftNew -= 1;
      } else if (item.type === 'deposit') {
        await this.ingressDeposit.execute(item);
        depositsLeftNew -= 1;
      } else if (item.type === 'withdrawal') {
        await this.ingressWithdrawal.execute(item);
        withdrawalsLeftNew -= 1;
      }
    }

    const addToActivity = ({ activity: curActivity, additionalItems, type }) => {
      const activityNew = curActivity.slice(0);

      if (additionalItems && additionalItems.length > 0) {
        const addTypeAndPast = obj => Object.assign({}, obj, { type, past: true });
        const additionalItemsWithType = additionalItems.map(addTypeAndPast);
        activityNew.push(...additionalItemsWithType);
      }

      return activityNew;
    };

    let activityNew = activity.slice(0);
    const limit = this.exchangeActivityLimitPerFetch;
    if ((ordersLeftNew === 0 && ordersLeft !== 0) || firstRun) {
      const startTime = (!firstRun ? item.time : ordersStartTime);
      const type = 'order';
      const items = await this.exchangeService.getFilledOrders({
        traderID,
        exchangeID,
        limit,
        startTime,
      });
      ordersLeftNew = items.length;
      activityNew = addToActivity({ activity: activityNew, additionalItems: items, type });
    }

    if ((depositsLeftNew === 0 && depositsLeft !== 0) || firstRun) {
      const startTime = (!firstRun ? item.time : depositsStartTime);
      const type = 'deposit';
      const items = await this.exchangeService.getSuccessfulDeposits({
        traderID,
        exchangeID,
        limit,
        startTime,
      });
      depositsLeftNew = items.length;
      activityNew = addToActivity({ activity: activityNew, additionalItems: items, type });
    }

    if ((withdrawalsLeftNew === 0 && withdrawalsLeft !== 0) || firstRun) {
      const startTime = (!firstRun ? item.time : withdrawalsStartTime);
      const type = 'withdrawal';
      const items = await this.exchangeService.getSuccessfulWithdrawals({
        traderID,
        exchangeID,
        limit,
        startTime,
      });
      withdrawalsLeftNew = items.length;
      activityNew = addToActivity({ activity: activityNew, additionalItems: items, type });
    }


    activityNew.sort((a, b) => b.time - a.time);

    await this.ingressActivity({
      activity: activityNew,
      ordersLeft: ordersLeftNew,
      depositsLeft: depositsLeftNew,
      withdrawalsLeft: withdrawalsLeftNew,
      traderID,
      exchangeID,
    });
  }
};
