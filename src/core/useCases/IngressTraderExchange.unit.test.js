const sinon = require('sinon');
const Order = require('../models/Order');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const IngressTraderExchange = require('./IngressTraderExchange');

function uniqueObjectWithTimeAndSourceIDEqual(timeAndSourceID, obj) {
  const newObj = Object.assign({}, obj);
  newObj.sourceID = timeAndSourceID;
  newObj.time = timeAndSourceID;
  return newObj;
}

const defaultReq = {
  traderID: 'trader123',
  exchangeID: 'binance',
};

const defaultOrder = new Order({
  traderID: 'trader123',
  sourceID: 'order1',
  exchangeID: 'exchange123',
  side: 'buy',
  asset: 'ETH',
  quoteAsset: 'USD',
  time: Date.now(),
  quantity: 12.345,
  price: 123.4567,
  fee: {
    asset: 'ETH',
    quantity: 0.03,
  },
});

const defaultDeposit = new Deposit({
  traderID: 'trader123',
  sourceID: 'source123',
  exchangeID: 'exchange123',
  asset: 'ETH',
  time: Date.now(),
  quantity: 12.345,
});

const defaultWithdrawal = new Withdrawal({
  traderID: 'trader123',
  sourceID: 'source123',
  exchangeID: 'exchange123',
  asset: 'ETH',
  time: Date.now(),
  quantity: 12.345,
});

let deps = {};
let unitOfWork;
let unitOfWorkFactory;
let portfolioUnitOfWork;
let portfolioUnitOfWorkFactory;

beforeEach(() => {
  unitOfWork = {
    tradeService: {
      getTrades: sinon.stub(),
      rescoreTrades: sinon.stub(),
    },
    scoreService: {
      calculateScores: sinon.stub(),
    },
    exchangeIngressRepo: {
      markComplete: sinon.stub(),
    },
    complete: sinon.stub(),
    rollback: sinon.stub(),
  };

  unitOfWorkFactory = {
    create: async () => unitOfWork,
  };

  portfolioUnitOfWork = {
    portfolioService: {
      incr: sinon.stub(),
      decr: sinon.stub(),
      traderExchangeExists: sinon.stub(),
    },
    complete: sinon.stub(),
    rollback: sinon.stub(),
  };

  portfolioUnitOfWorkFactory = {
    create: async () => portfolioUnitOfWork,
  };

  deps = {
    exchangeActivityLimitPerFetch: 3,
    ingressDeposit: { execute: sinon.stub() },
    ingressFilledOrder: { execute: sinon.stub() },
    ingressWithdrawal: { execute: sinon.stub() },
    exchangeService: {
      getFilledOrders: sinon.stub(),
      getSuccessfulDeposits: sinon.stub(),
      getSuccessfulWithdrawals: sinon.stub(),
      getBalances: sinon.stub(),
    },
    orderService: {
      getFilledOrders: sinon.stub(),
    },
    transferService: {
      findDeposits: sinon.stub(),
      findWithdrawals: sinon.stub(),
    },
    exchangeWatchRepo: {
      add: sinon.stub(),
    },
    unitOfWorkFactory,
    portfolioUnitOfWorkFactory,
  };

  deps.ingressDeposit.execute.resolves(null);
  deps.ingressFilledOrder.execute.resolves(null);
  deps.ingressWithdrawal.execute.resolves(null);

  deps.exchangeService.getFilledOrders.resolves([]);
  deps.exchangeService.getFilledOrders.onCall(0).resolves([
    defaultOrder,
  ]);
  deps.exchangeService.getFilledOrders.onCall(2).resolves([
    defaultOrder,
  ]);

  deps.exchangeService.getSuccessfulDeposits.resolves([]);
  deps.exchangeService.getSuccessfulDeposits.onCall(0).resolves([
    defaultDeposit,
  ]);
  deps.exchangeService.getSuccessfulDeposits.onCall(2).resolves([
    defaultDeposit,
  ]);

  deps.exchangeService.getSuccessfulWithdrawals.resolves([]);
  deps.exchangeService.getSuccessfulWithdrawals.onCall(0).resolves([
    defaultWithdrawal,
  ]);
  deps.exchangeService.getSuccessfulWithdrawals.onCall(2).resolves([
    defaultWithdrawal,
  ]);

  deps.exchangeWatchRepo.add.resolves(true);

  unitOfWork.exchangeIngressRepo.markComplete.resolves(true);
});

describe('exchangeService.getFilledOrders', () => {
  test('called with exchangeID', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const expectedArgs = { exchangeID: defaultReq.exchangeID };
    sinon.assert.alwaysCalledWithMatch(deps.exchangeService.getFilledOrders, expectedArgs);
  });

  test('called with traderID', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const expectedArgs = { traderID: defaultReq.traderID };
    sinon.assert.alwaysCalledWithMatch(deps.exchangeService.getFilledOrders, expectedArgs);
  });

  test('called with traderID on multi fetch', async () => {
    const order1 = uniqueObjectWithTimeAndSourceIDEqual(1, defaultOrder);
    const order2 = uniqueObjectWithTimeAndSourceIDEqual(6, defaultOrder);
    const order3 = uniqueObjectWithTimeAndSourceIDEqual(7, defaultOrder);
    deps.exchangeService.getFilledOrders.resolves([]);
    deps.exchangeService.getFilledOrders.onCall(0).resolves([order1, order2, order3]);

    const order4 = uniqueObjectWithTimeAndSourceIDEqual(10, defaultOrder);
    const order5 = uniqueObjectWithTimeAndSourceIDEqual(13, defaultOrder);
    const order6 = uniqueObjectWithTimeAndSourceIDEqual(15, defaultOrder);
    deps.exchangeService.getFilledOrders.onCall(1).resolves([order4, order5, order6]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const secondCall = deps.exchangeService.getFilledOrders.getCall(1);
    sinon.assert.calledWithMatch(secondCall, { traderID: defaultReq.traderID });
  });

  test('called with limit of deps.exchangeActivityLimitPerFetch', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const expectedArgs = { limit: deps.exchangeActivityLimitPerFetch };
    sinon.assert.calledWithMatch(deps.exchangeService.getFilledOrders, expectedArgs);
  });

  test('called with limit of deps.exchangeActivityLimitPerFetch on multi fetch', async () => {
    const order1 = uniqueObjectWithTimeAndSourceIDEqual(1, defaultOrder);
    const order2 = uniqueObjectWithTimeAndSourceIDEqual(6, defaultOrder);
    const order3 = uniqueObjectWithTimeAndSourceIDEqual(7, defaultOrder);
    deps.exchangeService.getFilledOrders.resolves([]);
    deps.exchangeService.getFilledOrders.onCall(0).resolves([order1, order2, order3]);

    const order4 = uniqueObjectWithTimeAndSourceIDEqual(10, defaultOrder);
    const order5 = uniqueObjectWithTimeAndSourceIDEqual(13, defaultOrder);
    const order6 = uniqueObjectWithTimeAndSourceIDEqual(15, defaultOrder);
    deps.exchangeService.getFilledOrders.onCall(1).resolves([order4, order5, order6]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const secondCall = deps.exchangeService.getFilledOrders.getCall(1);
    sinon.assert.calledWithMatch(secondCall, { limit: deps.exchangeActivityLimitPerFetch });
  });

  test('calls startTime with time of recent order', async () => {
    const order = uniqueObjectWithTimeAndSourceIDEqual(123, defaultOrder);
    deps.orderService.getFilledOrders
      .withArgs({
        traderID: defaultReq.traderID,
        exchangeID: defaultReq.exchangeID,
        sort: 'desc',
        limit: 1,
      })
      .resolves([order]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const expectedArgs = { startTime: 123 };
    sinon.assert.calledWithMatch(deps.exchangeService.getFilledOrders, expectedArgs);
  });

  test('first call has zero startTime if no recent order', async () => {
    deps.orderService.getFilledOrders.resolves(null);
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const firstCall = deps.exchangeService.getFilledOrders.getCall(0);
    const expectedArgs = { startTime: 0 };
    sinon.assert.calledWithMatch(firstCall, expectedArgs);
  });

  test('second call has startTime of last ingress', async () => {
    deps.exchangeService.getFilledOrders.resolves([]);
    const order1 = uniqueObjectWithTimeAndSourceIDEqual(1, defaultOrder);
    deps.exchangeService.getFilledOrders.onCall(0).resolves([order1]);
    const order2 = uniqueObjectWithTimeAndSourceIDEqual(2, defaultOrder);
    deps.exchangeService.getFilledOrders.onCall(1).resolves([order2]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const secondCall = deps.exchangeService.getFilledOrders.getCall(1);
    const expectedArgs = { startTime: 1 };
    sinon.assert.calledWithMatch(secondCall, expectedArgs);
  });
});

describe('exchangeService.getSuccessfulDeposits', () => {
  test('called with exchangeID', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const expectedArgs = { exchangeID: defaultReq.exchangeID };
    sinon.assert.calledWithMatch(deps.exchangeService.getSuccessfulDeposits, expectedArgs);
  });

  test('called with traderID', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const expectedArgs = { traderID: defaultReq.traderID };
    sinon.assert.calledWithMatch(deps.exchangeService.getSuccessfulDeposits, expectedArgs);
  });

  test('called with traderID on multi fetch', async () => {
    const deposit1 = uniqueObjectWithTimeAndSourceIDEqual(1, defaultDeposit);
    const deposit2 = uniqueObjectWithTimeAndSourceIDEqual(6, defaultDeposit);
    const deposit3 = uniqueObjectWithTimeAndSourceIDEqual(7, defaultDeposit);
    deps.exchangeService.getSuccessfulDeposits.resolves([]);
    deps.exchangeService.getSuccessfulDeposits.onCall(0).resolves([deposit1, deposit2, deposit3]);

    const deposit4 = uniqueObjectWithTimeAndSourceIDEqual(10, defaultDeposit);
    const deposit5 = uniqueObjectWithTimeAndSourceIDEqual(13, defaultDeposit);
    const deposit6 = uniqueObjectWithTimeAndSourceIDEqual(15, defaultDeposit);
    deps.exchangeService.getSuccessfulDeposits.onCall(1).resolves([deposit4, deposit5, deposit6]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const secondCall = deps.exchangeService.getSuccessfulDeposits.getCall(1);
    sinon.assert.calledWithMatch(secondCall, { traderID: defaultReq.traderID });
  });

  test('called with limit', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const expectedArgs = { limit: deps.exchangeActivityLimitPerFetch };
    sinon.assert.calledWithMatch(deps.exchangeService.getSuccessfulDeposits, expectedArgs);
  });

  test('called with limit on multi fetch', async () => {
    const deposit1 = uniqueObjectWithTimeAndSourceIDEqual(1, defaultDeposit);
    const deposit2 = uniqueObjectWithTimeAndSourceIDEqual(6, defaultDeposit);
    const deposit3 = uniqueObjectWithTimeAndSourceIDEqual(7, defaultDeposit);
    deps.exchangeService.getSuccessfulDeposits.resolves([]);
    deps.exchangeService.getSuccessfulDeposits.onCall(0).resolves([deposit1, deposit2, deposit3]);

    const deposit4 = uniqueObjectWithTimeAndSourceIDEqual(10, defaultDeposit);
    const deposit5 = uniqueObjectWithTimeAndSourceIDEqual(13, defaultDeposit);
    const deposit6 = uniqueObjectWithTimeAndSourceIDEqual(15, defaultDeposit);
    deps.exchangeService.getSuccessfulDeposits.onCall(1).resolves([deposit4, deposit5, deposit6]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const secondCall = deps.exchangeService.getSuccessfulDeposits.getCall(1);
    sinon.assert.calledWithMatch(secondCall, { limit: deps.exchangeActivityLimitPerFetch });
  });

  test('calls startTime with time of recent order', async () => {
    const order = uniqueObjectWithTimeAndSourceIDEqual(123, defaultOrder);
    deps.transferService.findDeposits
      .withArgs({
        traderID: defaultReq.traderID,
        exchangeID: defaultReq.exchangeID,
        sort: 'desc',
        limit: 1,
      })
      .resolves([order]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const expectedArgs = { startTime: 123 };
    sinon.assert.calledWithMatch(deps.exchangeService.getSuccessfulDeposits, expectedArgs);
  });

  test('first call has zero startTime if no recent order', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const firstCall = deps.exchangeService.getSuccessfulDeposits.getCall(0);
    const expectedArgs = { startTime: 0 };
    sinon.assert.calledWithMatch(firstCall, expectedArgs);
  });

  test('second call has startTime of last ingress', async () => {
    deps.exchangeService.getSuccessfulDeposits.resolves([]);
    const order1 = uniqueObjectWithTimeAndSourceIDEqual(1, defaultOrder);
    deps.exchangeService.getSuccessfulDeposits.onCall(0).resolves([order1]);
    const order2 = uniqueObjectWithTimeAndSourceIDEqual(2, defaultOrder);
    deps.exchangeService.getSuccessfulDeposits.onCall(1).resolves([order2]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const secondCall = deps.exchangeService.getSuccessfulDeposits.getCall(1);
    const expectedArgs = { startTime: 1 };
    sinon.assert.calledWithMatch(secondCall, expectedArgs);
  });
});

describe('exchangeService.getSuccessfulWithdrawals', () => {
  test('called with exchangeID', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const expectedArgs = { exchangeID: defaultReq.exchangeID };
    sinon.assert.calledWithMatch(deps.exchangeService.getSuccessfulWithdrawals, expectedArgs);
  });

  test('called with traderID', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const expectedArgs = { traderID: defaultReq.traderID };
    sinon.assert.calledWithMatch(deps.exchangeService.getSuccessfulWithdrawals, expectedArgs);
  });

  test('called with traderID on multi fetch', async () => {
    const withdrawal1 = uniqueObjectWithTimeAndSourceIDEqual(1, defaultWithdrawal);
    const withdrawal2 = uniqueObjectWithTimeAndSourceIDEqual(6, defaultWithdrawal);
    const withdrawal3 = uniqueObjectWithTimeAndSourceIDEqual(7, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.resolves([]);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(0).resolves([
      withdrawal1,
      withdrawal2,
      withdrawal3,
    ]);

    const withdrawal4 = uniqueObjectWithTimeAndSourceIDEqual(10, defaultWithdrawal);
    const withdrawal5 = uniqueObjectWithTimeAndSourceIDEqual(13, defaultWithdrawal);
    const withdrawal6 = uniqueObjectWithTimeAndSourceIDEqual(15, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(1).resolves([
      withdrawal4,
      withdrawal5,
      withdrawal6,
    ]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const secondCall = deps.exchangeService.getSuccessfulWithdrawals.getCall(1);
    sinon.assert.calledWithMatch(secondCall, { traderID: defaultReq.traderID });
  });

  test('called with limit', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const expectedArgs = { limit: deps.exchangeActivityLimitPerFetch };
    sinon.assert.calledWithMatch(deps.exchangeService.getSuccessfulWithdrawals, expectedArgs);
  });

  test('called with limit on multi fetch', async () => {
    const withdrawal1 = uniqueObjectWithTimeAndSourceIDEqual(1, defaultWithdrawal);
    const withdrawal2 = uniqueObjectWithTimeAndSourceIDEqual(6, defaultWithdrawal);
    const withdrawal3 = uniqueObjectWithTimeAndSourceIDEqual(7, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.resolves([]);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(0).resolves([
      withdrawal1,
      withdrawal2,
      withdrawal3,
    ]);

    const withdrawal4 = uniqueObjectWithTimeAndSourceIDEqual(10, defaultWithdrawal);
    const withdrawal5 = uniqueObjectWithTimeAndSourceIDEqual(13, defaultWithdrawal);
    const withdrawal6 = uniqueObjectWithTimeAndSourceIDEqual(15, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(1).resolves([
      withdrawal4,
      withdrawal5,
      withdrawal6,
    ]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const secondCall = deps.exchangeService.getSuccessfulWithdrawals.getCall(1);
    sinon.assert.calledWithMatch(secondCall, { limit: deps.exchangeActivityLimitPerFetch });
  });

  test('calls startTime with time of recent order', async () => {
    const withdrawal = uniqueObjectWithTimeAndSourceIDEqual(123, defaultWithdrawal);
    deps.transferService.findWithdrawals
      .withArgs({
        traderID: defaultReq.traderID,
        exchangeID: defaultReq.exchangeID,
        sort: 'desc',
        limit: 1,
      })
      .resolves([withdrawal]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const expectedArgs = { startTime: 123 };
    sinon.assert.calledWithMatch(deps.exchangeService.getSuccessfulWithdrawals, expectedArgs);
  });

  test('first call has zero startTime if no recent order', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const firstCall = deps.exchangeService.getSuccessfulWithdrawals.getCall(0);
    const expectedArgs = { startTime: 0 };
    sinon.assert.calledWithMatch(firstCall, expectedArgs);
  });

  test('second call has startTime of last ingress', async () => {
    deps.exchangeService.getSuccessfulWithdrawals.resolves([]);
    const withdrawal1 = uniqueObjectWithTimeAndSourceIDEqual(1, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(0).resolves([withdrawal1]);
    const withdrawal2 = uniqueObjectWithTimeAndSourceIDEqual(2, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(1).resolves([withdrawal2]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const secondCall = deps.exchangeService.getSuccessfulWithdrawals.getCall(1);
    const expectedArgs = { startTime: 1 };
    sinon.assert.calledWithMatch(secondCall, expectedArgs);
  });
});

describe('incr portfolio: exchange balances subtracted by available deposits, orders, & withdrawals', () => {
  it('calls getBalances with traderID and exchangeID', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const { traderID, exchangeID } = defaultReq;
    sinon.assert.calledWith(deps.exchangeService.getBalances, { traderID, exchangeID });
  });

  it('completes unit of work if already completed', async () => {
    const { traderID, exchangeID } = defaultReq;
    portfolioUnitOfWork.portfolioService.traderExchangeExists
      .withArgs({ traderID, exchangeID })
      .resolves(true);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    sinon.assert.called(portfolioUnitOfWork.complete);
  });

  it('completes unit of work when successful', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    sinon.assert.called(portfolioUnitOfWork.complete);
  });

  it('rolls back unit of work when throws error and re-throws error', async () => {
    deps.exchangeService.getBalances.resolves([
      { asset: 'BTC', quantity: 0.2 },
      { asset: 'USD', quantity: 3900 },
      { asset: 'ETH', quantity: 91 },
    ]);

    portfolioUnitOfWork.portfolioService.incr.reset();
    const err = new Error('test');
    portfolioUnitOfWork.portfolioService.incr.rejects(err);

    const useCase = new IngressTraderExchange(deps);
    let rejectedWith = null;
    try {
      await useCase.execute(defaultReq);
    } catch (e) {
      rejectedWith = e;
    }

    expect(rejectedWith).toBe(err);

    sinon.assert.called(portfolioUnitOfWork.rollback);
  });

  it('increments correctly when deposits, orders, & withdrawals require multi fetch', async () => {
    deps.exchangeService.getBalances.resolves([
      { asset: 'BTC', quantity: 0.2 },
      { asset: 'USD', quantity: 3900 },
      { asset: 'ETH', quantity: 91 },
    ]);

    const order1 = uniqueObjectWithTimeAndSourceIDEqual(3, defaultOrder);
    const order2 = uniqueObjectWithTimeAndSourceIDEqual(6, defaultOrder);
    const order3 = uniqueObjectWithTimeAndSourceIDEqual(7, defaultOrder);
    deps.exchangeService.getFilledOrders.resolves([]);
    deps.exchangeService.getFilledOrders.onCall(0).resolves([order1, order2, order3]);

    const order4 = uniqueObjectWithTimeAndSourceIDEqual(10, defaultOrder);
    const order5 = uniqueObjectWithTimeAndSourceIDEqual(13, defaultOrder);
    const order6 = uniqueObjectWithTimeAndSourceIDEqual(15, defaultOrder);
    deps.exchangeService.getFilledOrders.onCall(1).resolves([order4, order5, order6]);

    const deposit1 = uniqueObjectWithTimeAndSourceIDEqual(1, defaultDeposit);
    const deposit2 = uniqueObjectWithTimeAndSourceIDEqual(4, defaultDeposit);
    const deposit3 = uniqueObjectWithTimeAndSourceIDEqual(5, defaultDeposit);
    deps.exchangeService.getSuccessfulDeposits.resolves([]);
    deps.exchangeService.getSuccessfulDeposits.onCall(0).resolves([deposit1, deposit2, deposit3]);

    const deposit4 = uniqueObjectWithTimeAndSourceIDEqual(12, defaultDeposit);
    const deposit5 = uniqueObjectWithTimeAndSourceIDEqual(14, defaultDeposit);
    deps.exchangeService.getSuccessfulDeposits.onCall(1).resolves([deposit4, deposit5]);

    const withdrawal1 = uniqueObjectWithTimeAndSourceIDEqual(2, defaultWithdrawal);
    const withdrawal2 = uniqueObjectWithTimeAndSourceIDEqual(8, defaultWithdrawal);
    const withdrawal3 = uniqueObjectWithTimeAndSourceIDEqual(9, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.resolves([]);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(0).resolves([
      withdrawal1,
      withdrawal2,
      withdrawal3,
    ]);

    const withdrawal4 = uniqueObjectWithTimeAndSourceIDEqual(11, defaultWithdrawal);
    const withdrawal5 = uniqueObjectWithTimeAndSourceIDEqual(17, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(1).resolves([withdrawal4, withdrawal5]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    sinon.assert.calledWith(portfolioUnitOfWork.portfolioService.incr, {
      traderID: 'trader123',
      exchangeID: 'binance',
      asset: 'BTC',
      quantity: 0.2,
      time: 1,
    });

    sinon.assert.calledWith(portfolioUnitOfWork.portfolioService.incr, {
      traderID: 'trader123',
      exchangeID: 'binance',
      asset: 'USD',
      quantity: 14568.5107305,
      time: 1,
    });

    sinon.assert.calledWith(portfolioUnitOfWork.portfolioService.incr, {
      traderID: 'trader123',
      exchangeID: 'binance',
      asset: 'ETH',
      quantity: 4.795,
      time: 1,
    });
  });
});

describe('ingress activity', () => {
  test('ordered when only 1 fetch needed per activity type', async () => {
    // track activity
    const activity = [];
    deps.ingressFilledOrder.execute.callsFake(async obj => activity.push(obj.sourceID));
    deps.ingressDeposit.execute.callsFake(async obj => activity.push(obj.sourceID));
    deps.ingressWithdrawal.execute.callsFake(async obj => activity.push(obj.sourceID));

    // exchange data
    const order1 = uniqueObjectWithTimeAndSourceIDEqual(3, defaultOrder);
    const order2 = uniqueObjectWithTimeAndSourceIDEqual(6, defaultOrder);
    const order3 = uniqueObjectWithTimeAndSourceIDEqual(7, defaultOrder);
    deps.exchangeService.getFilledOrders.resolves([]);
    deps.exchangeService.getFilledOrders.onCall(2).resolves([order1, order2, order3]);

    const deposit1 = uniqueObjectWithTimeAndSourceIDEqual(1, defaultDeposit);
    const deposit2 = uniqueObjectWithTimeAndSourceIDEqual(4, defaultDeposit);
    const deposit3 = uniqueObjectWithTimeAndSourceIDEqual(5, defaultDeposit);
    deps.exchangeService.getSuccessfulDeposits.resolves([]);
    deps.exchangeService.getSuccessfulDeposits.onCall(2).resolves([deposit1, deposit2, deposit3]);

    const withdrawal1 = uniqueObjectWithTimeAndSourceIDEqual(2, defaultWithdrawal);
    const withdrawal2 = uniqueObjectWithTimeAndSourceIDEqual(8, defaultWithdrawal);
    const withdrawal3 = uniqueObjectWithTimeAndSourceIDEqual(9, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.resolves([]);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(2).resolves([
      withdrawal1,
      withdrawal2,
      withdrawal3,
    ]);

    // run
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    // assert
    expect(activity).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('ordered when multi fetch needed per activity type with random ordering', async () => {
    // track activity
    const activity = [];
    deps.ingressFilledOrder.execute.callsFake(async obj => activity.push(obj.sourceID));
    deps.ingressDeposit.execute.callsFake(async obj => activity.push(obj.sourceID));
    deps.ingressWithdrawal.execute.callsFake(async obj => activity.push(obj.sourceID));

    // exchange data
    const order1 = uniqueObjectWithTimeAndSourceIDEqual(3, defaultOrder);
    const order2 = uniqueObjectWithTimeAndSourceIDEqual(6, defaultOrder);
    const order3 = uniqueObjectWithTimeAndSourceIDEqual(7, defaultOrder);
    deps.exchangeService.getFilledOrders.resolves([]);
    deps.exchangeService.getFilledOrders.onCall(2).resolves([order1, order2, order3]);

    const order4 = uniqueObjectWithTimeAndSourceIDEqual(10, defaultOrder);
    const order5 = uniqueObjectWithTimeAndSourceIDEqual(13, defaultOrder);
    const order6 = uniqueObjectWithTimeAndSourceIDEqual(15, defaultOrder);
    deps.exchangeService.getFilledOrders.onCall(3).resolves([order4, order5, order6]);

    const order7 = uniqueObjectWithTimeAndSourceIDEqual(16, defaultOrder);
    deps.exchangeService.getFilledOrders.onCall(4).resolves([order7]);

    const deposit1 = uniqueObjectWithTimeAndSourceIDEqual(1, defaultDeposit);
    const deposit2 = uniqueObjectWithTimeAndSourceIDEqual(4, defaultDeposit);
    const deposit3 = uniqueObjectWithTimeAndSourceIDEqual(5, defaultDeposit);
    deps.exchangeService.getSuccessfulDeposits.resolves([]);
    deps.exchangeService.getSuccessfulDeposits.onCall(2).resolves([deposit1, deposit2, deposit3]);

    const deposit4 = uniqueObjectWithTimeAndSourceIDEqual(12, defaultDeposit);
    const deposit5 = uniqueObjectWithTimeAndSourceIDEqual(14, defaultDeposit);
    deps.exchangeService.getSuccessfulDeposits.onCall(3).resolves([deposit4, deposit5]);

    const withdrawal1 = uniqueObjectWithTimeAndSourceIDEqual(2, defaultWithdrawal);
    const withdrawal2 = uniqueObjectWithTimeAndSourceIDEqual(8, defaultWithdrawal);
    const withdrawal3 = uniqueObjectWithTimeAndSourceIDEqual(9, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.resolves([]);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(2).resolves([
      withdrawal1,
      withdrawal2,
      withdrawal3,
    ]);

    const withdrawal4 = uniqueObjectWithTimeAndSourceIDEqual(11, defaultWithdrawal);
    const withdrawal5 = uniqueObjectWithTimeAndSourceIDEqual(17, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(3).resolves([withdrawal4, withdrawal5]);

    const withdrawal6 = uniqueObjectWithTimeAndSourceIDEqual(18, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(4).resolves([withdrawal6]);

    const withdrawal7 = uniqueObjectWithTimeAndSourceIDEqual(19, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(5).resolves([withdrawal7]);

    // run
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    // assert
    expect(activity).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('ignore insufficient entries error', async () => {
    deps.ingressFilledOrder.execute.rejects(new Error('Insufficient entries'));

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);
  });

  test('calls ingressFilledOrder with past true', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);
    sinon.assert.alwaysCalledWithMatch(deps.ingressFilledOrder.execute, { past: true });
  });

  test('calls ingressDeposit with past true', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    sinon.assert.alwaysCalledWithMatch(deps.ingressDeposit.execute, { past: true });
  });

  test('calls ingressWithdrawal with past true', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    sinon.assert.alwaysCalledWithMatch(deps.ingressWithdrawal.execute, { past: true });
  });
});

describe('rescoreTrades', () => {
  it('calls with startTime as exchange first trade exit time', async () => {
    unitOfWork.tradeService.getTrades
      .withArgs({
        traderID: defaultReq.traderID,
        exchangeID: defaultReq.exchangeID,
        limit: 1,
        sort: 'asc',
      })
      .resolves([{ exit: { time: 123 } }]);

    // run
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    // assert
    sinon.assert.calledWithMatch(unitOfWork.tradeService.rescoreTrades, {
      startTime: 123,
    });
  });

  it('calls with traderID', async () => {
    unitOfWork.tradeService.getTrades.resolves([{ exit: { time: 123 } }]);

    // run
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    // assert
    sinon.assert.calledWithMatch(unitOfWork.tradeService.rescoreTrades, {
      traderID: defaultReq.traderID,
    });
  });

  it('doesn\'t throw error when empty trades', async () => {
    unitOfWork.tradeService.getTrades.resolves([]);
    const useCase = new IngressTraderExchange(deps);
    await expect(useCase.execute(defaultReq)).resolves.toBeDefined();
  });
});

test('calculates trader scores', async () => {
  // run
  const useCase = new IngressTraderExchange(deps);
  await useCase.execute(defaultReq);

  // assert
  sinon.assert.calledWith(unitOfWork.scoreService.calculateScores, {
    traderID: defaultReq.traderID,
  });
});

test('calculate trader scores if trader has no other exchanges', async () => {
  // run
  const useCase = new IngressTraderExchange(deps);
  await useCase.execute(defaultReq);

  // assert
  sinon.assert.calledWith(unitOfWork.scoreService.calculateScores, {
    traderID: defaultReq.traderID,
  });
});

test('rejects if scoreService.calculateScores errors', async () => {
  unitOfWork.scoreService.calculateScores.rejects();

  const useCase = new IngressTraderExchange(deps);

  return expect(useCase.execute(defaultReq)).rejects.toThrow();
});

test('calls exchangeIngressRepo markComplete', async () => {
  // run
  const useCase = new IngressTraderExchange(deps);
  await useCase.execute(defaultReq);

  // assert
  sinon.assert.calledWith(unitOfWork.exchangeIngressRepo.markComplete, {
    traderID: defaultReq.traderID,
    exchangeID: defaultReq.exchangeID,
  });
});

test('rejects if exchangeIngressRepo.markComplete errors', async () => {
  unitOfWork.exchangeIngressRepo.markComplete.rejects();

  const useCase = new IngressTraderExchange(deps);

  return expect(useCase.execute(defaultReq)).rejects.toThrow();
});

describe('unitOfWork', () => {
  it('calls complete', async () => {
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    sinon.assert.called(unitOfWork.complete);
  });

  it('rolls back when tradeService.getTrades rejects', async () => {
    unitOfWork.tradeService.getTrades.rejects();

    const useCase = new IngressTraderExchange(deps);
    await expect(useCase.execute(defaultReq)).rejects.toThrow();

    sinon.assert.called(unitOfWork.rollback);
  });

  it('rolls back when tradeService.rescoreTrades rejects', async () => {
    unitOfWork.tradeService.getTrades.resolves([{ exit: { time: 123 } }]);
    unitOfWork.tradeService.rescoreTrades.rejects();

    const useCase = new IngressTraderExchange(deps);
    await expect(useCase.execute(defaultReq)).rejects.toThrow();

    sinon.assert.called(unitOfWork.rollback);
  });

  it('rolls back when scoreService.calculateScores rejects', async () => {
    unitOfWork.scoreService.calculateScores.rejects();

    const useCase = new IngressTraderExchange(deps);
    await expect(useCase.execute(defaultReq)).rejects.toThrow();

    sinon.assert.called(unitOfWork.rollback);
  });

  it('rolls back when exchangeIngressRepo.markComplete rejects', async () => {
    unitOfWork.exchangeIngressRepo.markComplete.rejects();

    const useCase = new IngressTraderExchange(deps);
    await expect(useCase.execute(defaultReq)).rejects.toThrow();

    sinon.assert.called(unitOfWork.rollback);
  });
});

describe('data validation', () => {
  it('throws error when exchangeID missing', async () => {
    const useCase = new IngressTraderExchange({});
    const req = Object.assign({}, defaultReq);
    req.exchangeID = '';

    return expect(useCase.execute(req)).rejects.toThrow('"Exchange ID" is not allowed to be empty');
  });

  it('throws error when traderID missing', async () => {
    const useCase = new IngressTraderExchange({});
    const req = Object.assign({}, defaultReq);
    req.traderID = '';

    return expect(useCase.execute(req)).rejects.toThrow('"Trader ID" is not allowed to be empty');
  });
});
