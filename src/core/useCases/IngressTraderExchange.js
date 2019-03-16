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
    exchangeWatchRepo,
    orderRepo,
    transferRepo,
    exchangeActivityLimitPerFetch,
  }) {
    this.ingressDeposit = ingressDeposit;
    this.ingressFilledOrder = ingressFilledOrder;
    this.ingressWithdrawal = ingressWithdrawal;
    this.exchangeService = exchangeService;
    this.exchangeWatchRepo = exchangeWatchRepo;
    this.orderRepo = orderRepo;
    this.transferRepo = transferRepo;
    this.exchangeActivityLimitPerFetch = exchangeActivityLimitPerFetch;
    this.descSort = (a, b) => b.time - a.time;
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

    await this.exchangeWatchRepo.add({ traderID, exchangeID });

    const limit = this.exchangeActivityLimitPerFetch;

    const activity = [];
    let ordersLeft = 0;
    let depositsLeft = 0;
    let withdrawalsLeft = 0;

    await Promise.all([
      (async () => {
        const lastOrders = await this.orderRepo.find({ traderID, limit: 1, sort: 'desc' });
        const orderStart = (lastOrders && lastOrders.length > 0 ? lastOrders[0].time : 0);
        let filledOrders = await this.exchangeService.getFilledOrders({
          exchangeID,
          traderID,
          limit,
          startTime: orderStart,
        });
        filledOrders = filledOrders.map(order => Object.assign({}, order, { type: 'order' }));

        ordersLeft = filledOrders.length;
        activity.push(...filledOrders);
      })(),

      (async () => {
        const lastDeposits = await this.transferRepo.findDeposits({ traderID, limit: 1, sort: 'desc' });
        const depositStart = (lastDeposits && lastDeposits.length > 0 ? lastDeposits[0].time : 0);
        let deposits = await this.exchangeService.getDeposits({
          exchangeID,
          traderID,
          limit,
          startTime: depositStart,
        });
        deposits = deposits.map(deposit => Object.assign({}, deposit, { type: 'deposit' }));

        depositsLeft = deposits.length;
        activity.push(...deposits);
      })(),

      (async () => {
        const lastWithdraws = await this.transferRepo.findWithdrawals({ traderID, limit: 1, sort: 'desc' });
        const hasWithdraws = lastWithdraws && lastWithdraws.length > 0;
        const withdrawStart = (hasWithdraws ? lastWithdraws[0].time : 0);
        let withdrawals = await this.exchangeService.getWithdrawals({
          exchangeID,
          traderID,
          limit,
          startTime: withdrawStart,
        });
        withdrawals = withdrawals.map(withdrawal => Object.assign({}, withdrawal, { type: 'withdrawal' }));

        withdrawalsLeft = withdrawals.length;
        activity.push(...withdrawals);
      })(),
    ]);

    activity.sort(this.descSort);

    await this.ingressActivity({
      activity,
      ordersLeft,
      depositsLeft,
      withdrawalsLeft,
      traderID,
    });

    return true;
  }

  async ingressActivity({
    activity,
    ordersLeft,
    depositsLeft,
    withdrawalsLeft,
    traderID,
  }) {
    if (ordersLeft === 0 && depositsLeft === 0 && withdrawalsLeft === 0) {
      return;
    }

    const item = activity.pop();

    let ordersLeftNew = ordersLeft;
    let depositsLeftNew = depositsLeft;
    let withdrawalsLeftNew = withdrawalsLeft;

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

    let additionalItems = [];
    const startTime = item.time;
    let type = '';
    const limit = this.exchangeActivityLimitPerFetch;
    if (ordersLeftNew === 0 && ordersLeft !== 0) {
      type = 'order';
      additionalItems = await this.exchangeService.getFilledOrders({ traderID, limit, startTime });
      ordersLeftNew = additionalItems.length;
    } else if (depositsLeftNew === 0 && depositsLeft !== 0) {
      type = 'deposit';
      additionalItems = await this.exchangeService.getDeposits({ traderID, limit, startTime });
      depositsLeftNew = additionalItems.length;
    } else if (withdrawalsLeftNew === 0 && withdrawalsLeft !== 0) {
      type = 'withdrawal';
      additionalItems = await this.exchangeService.getWithdrawals({ traderID, limit, startTime });
      withdrawalsLeftNew = additionalItems.length;
    }

    const activityNew = this.addToActivity({ activity, additionalItems, type });
    await this.ingressActivity({
      activity: activityNew,
      ordersLeft: ordersLeftNew,
      depositsLeft: depositsLeftNew,
      withdrawalsLeft: withdrawalsLeftNew,
      traderID,
    });
  }

  addToActivity({ activity, additionalItems, type }) {
    const activityNew = activity.slice(0);

    if (additionalItems && additionalItems.length > 0) {
      const additionalItemsWithType = additionalItems.map(obj => Object.assign({}, obj, { type }));
      activityNew.push(...additionalItemsWithType);
      activityNew.sort(this.descSort);
    }

    return activityNew;
  }
};
