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
  }) {
    this.ingressDeposit = ingressDeposit;
    this.ingressFilledOrder = ingressFilledOrder;
    this.ingressWithdrawal = ingressWithdrawal;
    this.exchangeService = exchangeService;
    this.exchangeWatchRepo = exchangeWatchRepo;
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

    const filledOrdersPromise = this.exchangeService.getFilledOrders();
    const depositsPromise = this.exchangeService.getDeposits();
    const withdrawalsPromise = this.exchangeService.getWithdrawals();

    let filledOrders = await filledOrdersPromise;
    filledOrders = filledOrders.map(order => Object.assign({}, order, { type: 'order' }));

    let deposits = await depositsPromise;
    deposits = deposits.map(deposit => Object.assign({}, deposit, { type: 'deposit' }));

    let withdrawals = await withdrawalsPromise;
    withdrawals = withdrawals.map(withdrawal => Object.assign({}, withdrawal, { type: 'withdrawal' }));

    const initialActivity = [...filledOrders, ...deposits, ...withdrawals];
    initialActivity.sort(this.descSort);

    await this.ingressActivity({
      activity: initialActivity,
      ordersLeft: filledOrders.length,
      depositsLeft: deposits.length,
      withdrawalsLeft: withdrawals.length,
    });
  }

  async ingressActivity({
    activity,
    ordersLeft,
    depositsLeft,
    withdrawalsLeft,
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
    let type = '';
    if (ordersLeftNew === 0) {
      type = 'order';
      additionalItems = await this.exchangeService.getFilledOrders();
      ordersLeftNew = additionalItems.length;
    } else if (depositsLeftNew === 0) {
      type = 'deposit';
      additionalItems = await this.exchangeService.getDeposits();
      depositsLeftNew = additionalItems.length;
    } else if (withdrawalsLeftNew === 0) {
      type = 'withdrawal';
      additionalItems = await this.exchangeService.getWithdrawals();
      withdrawalsLeftNew = additionalItems.length;
    }

    const activityNew = this.addToActivity({ activity, additionalItems, type });
    await this.ingressActivity({
      activity: activityNew,
      ordersLeft: ordersLeftNew,
      depositsLeft: depositsLeftNew,
      withdrawalsLeft: withdrawalsLeftNew,
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
