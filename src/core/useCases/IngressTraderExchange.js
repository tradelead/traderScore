// const debug = require('debug')('traderScore:IngressTraderExchange');
const Joi = require('joi');
const BigNumber = require('bignumber.js');

async function multiFetchLoop(f) {
  let startTime = 0;
  let hasMore = true;

  while (hasMore) {
    const items = await f(startTime);
    hasMore = items && items.length > 0;

    if (hasMore) {
      startTime = items[items.length - 1].time;
    }
  }
}

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
    unitOfWorkFactory,
    portfolioUnitOfWorkFactory,
  }) {
    this.ingressDeposit = ingressDeposit;
    this.ingressFilledOrder = ingressFilledOrder;
    this.ingressWithdrawal = ingressWithdrawal;
    this.exchangeService = exchangeService;
    this.orderService = orderService;
    this.transferService = transferService;
    this.exchangeActivityLimitPerFetch = exchangeActivityLimitPerFetch;
    this.unitOfWorkFactory = unitOfWorkFactory;
    this.portfolioUnitOfWorkFactory = portfolioUnitOfWorkFactory;
  }

  async execute(req) {
    console.log('IngressTraderExchange', req);
    const { error, value } = requestSchema.validate(req);

    if (error != null) {
      const humanErr = error.details.map(detail => detail.message).join(', ');
      const err = new Error(humanErr);
      err.name = 'BadRequest';
      throw err;
    }

    const { traderID, exchangeID } = value;

    await this.updatePortfolio({ traderID, exchangeID });

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

    const unitOfWork = await this.unitOfWorkFactory.create();

    try {
      const trades = await unitOfWork.tradeService.getTrades({
        traderID,
        exchangeID,
        limit: 1,
        sort: 'asc',
      });

      if (trades && trades[0] && trades[0].exit && trades[0].exit.time > 0) {
        await unitOfWork.tradeService.rescoreTrades({ traderID, startTime: trades[0].exit.time });
        console.log('IngressTraderExchange: rescoreTrades', { traderID, startTime: trades[0].exit.time });
      }

      await unitOfWork.scoreService.calculateScores({ traderID });
      console.log('IngressTraderExchange: calculateScores', { traderID });

      await unitOfWork.exchangeIngressRepo.markComplete({ traderID, exchangeID });
      console.log('IngressTraderExchange: markComplete', { traderID, exchangeID });

      await unitOfWork.complete();
      console.log('IngressTraderExchange: unit of work complete');
    } catch (e) {
      unitOfWork.rollback();
      throw e;
    }

    return true;
  }

  // set portfolio to exchange balance subtracted by available orders, deposits, and withdrawals.
  // This is necessary to ensure internal portfolio matches exchange portfolio because
  // exchange APIs may not support returning all historic activity.
  async updatePortfolio({ traderID, exchangeID }) {
    const unitOfWork = await this.portfolioUnitOfWorkFactory.create();

    try {
      const alreadyUpdated = await unitOfWork.portfolioService.traderExchangeExists({
        traderID,
        exchangeID,
      });

      if (alreadyUpdated) {
        await unitOfWork.complete();
        return;
      }

      const balancesArr = await this.exchangeService.getBalances({ traderID, exchangeID });
      const balances = (balancesArr && balancesArr.length > 0 && balancesArr.reduce((acc, item) => {
        acc[item.asset] = item.quantity;
        return acc;
      }, {})) || {};

      let timeOfFirstActivity = null;

      const subtractingOrders = multiFetchLoop(async (startTime) => {
        const limit = this.exchangeActivityLimitPerFetch;

        const items = await this.exchangeService.getFilledOrders({
          traderID,
          exchangeID,
          limit,
          startTime,
        });

        items.forEach((item) => {
          if (item.side === 'buy') {
            // decr asset balance
            balances[item.asset] = (new BigNumber(balances[item.asset]))
              .minus(item.quantity).toNumber();

            // incr quote asset balance
            const quoteQty = (new BigNumber(item.quantity)).times(item.price);
            balances[item.quoteAsset] = (new BigNumber(balances[item.quoteAsset]))
              .plus(quoteQty).toNumber();

            // incr fee asset balance
            balances[item.fee.asset] = (new BigNumber(balances[item.asset]))
              .plus(item.fee.quantity).toNumber();
          } else {
            // incr asset balance
            balances[item.asset] = (new BigNumber(balances[item.asset]))
              .plus(item.quantity).toNumber();

            // decr quote asset balance
            const quoteQty = (new BigNumber(item.quantity)).times(item.price);
            balances[item.quoteAsset] = (new BigNumber(balances[item.quoteAsset]))
              .minus(quoteQty).toNumber();

            // incr fee asset balance
            balances[item.fee.asset] = (new BigNumber(balances[item.asset]))
              .plus(item.fee.quantity).toNumber();
          }
        });

        const shouldSetTime = (
          !timeOfFirstActivity
          || (items[0] && items[0].time < timeOfFirstActivity)
        );
        timeOfFirstActivity = shouldSetTime ? items[0].time : timeOfFirstActivity;

        return items;
      });

      const subtractingDeposits = multiFetchLoop(async (startTime) => {
        const limit = this.exchangeActivityLimitPerFetch;

        const items = await this.exchangeService.getSuccessfulDeposits({
          traderID,
          exchangeID,
          limit,
          startTime,
        });

        items.forEach((item) => {
          // decr asset balance
          balances[item.asset] = (new BigNumber(balances[item.asset]))
            .minus(item.quantity).toNumber();
        });

        const shouldSetTime = (
          !timeOfFirstActivity
          || (items[0] && items[0].time < timeOfFirstActivity)
        );
        timeOfFirstActivity = shouldSetTime ? items[0].time : timeOfFirstActivity;

        return items;
      });

      const subtractingWithdrawals = multiFetchLoop(async (startTime) => {
        const limit = this.exchangeActivityLimitPerFetch;

        const items = await this.exchangeService.getSuccessfulWithdrawals({
          traderID,
          exchangeID,
          limit,
          startTime,
        });

        items.forEach((item) => {
          // incr asset balance
          balances[item.asset] = (new BigNumber(balances[item.asset]))
            .plus(item.quantity).toNumber();
        });

        const shouldSetTime = (
          !timeOfFirstActivity
          || (items[0] && items[0].time < timeOfFirstActivity)
        );
        timeOfFirstActivity = shouldSetTime ? items[0].time : timeOfFirstActivity;

        return items;
      });

      await subtractingOrders;
      await subtractingDeposits;
      await subtractingWithdrawals;

      await Promise.all(Object.keys(balances).map(async (asset) => {
        const quantity = balances[asset];

        const req = {
          traderID,
          exchangeID,
          asset,
          quantity,
          time: timeOfFirstActivity || 0,
        };

        if (quantity > 0) {
          await unitOfWork.portfolioService.incr(req);
        } else if (quantity < 0) {
          req.quantity = -quantity;
          console.error('Update Portfolio Error: decr', req);
        }
      }));

      await unitOfWork.complete();
    } catch (e) {
      await unitOfWork.rollback();
      throw e;
    }
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
      try {
        if (item.type === 'order') {
          ordersLeftNew -= 1;
          await this.ingressFilledOrder.execute(item);
        } else if (item.type === 'deposit') {
          depositsLeftNew -= 1;
          await this.ingressDeposit.execute(item);
        } else if (item.type === 'withdrawal') {
          withdrawalsLeftNew -= 1;
          await this.ingressWithdrawal.execute(item);
        }
      } catch (e) {
        if (e.message !== 'Insufficient entries') {
          throw e;
        } else {
          console.error('Error Ignored:', e);
        }
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
