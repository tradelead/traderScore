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

beforeEach(() => {
  deps = {
    exchangeActivityLimitPerFetch: 3,
    ingressDeposit: { execute: sinon.stub() },
    ingressFilledOrder: { execute: sinon.stub() },
    ingressWithdrawal: { execute: sinon.stub() },
    exchangeService: {
      getFilledOrders: sinon.stub(),
      getSuccessfulDeposits: sinon.stub(),
      getSuccessfulWithdrawals: sinon.stub(),
    },
    orderRepo: {
      find: sinon.stub(),
    },
    transferRepo: {
      findDeposits: sinon.stub(),
      findWithdrawals: sinon.stub(),
    },
    exchangeWatchRepo: {
      add: sinon.stub(),
    },
    traderExchangeRepo: {
      getExchanges: sinon.stub(),
    },
    traderScoreService: {
      calculateScores: sinon.stub(),
    },
  };

  deps.ingressDeposit.execute.resolves(null);
  deps.ingressFilledOrder.execute.resolves(null);
  deps.ingressWithdrawal.execute.resolves(null);

  deps.exchangeService.getFilledOrders.resolves([]);
  deps.exchangeService.getFilledOrders.onCall(0).resolves([
    defaultOrder,
  ]);

  deps.exchangeService.getSuccessfulDeposits.resolves([]);
  deps.exchangeService.getSuccessfulDeposits.onCall(0).resolves([
    defaultDeposit,
  ]);

  deps.exchangeService.getSuccessfulWithdrawals.resolves([]);
  deps.exchangeService.getSuccessfulWithdrawals.onCall(0).resolves([
    defaultWithdrawal,
  ]);

  deps.exchangeWatchRepo.add.resolves(true);

  deps.traderExchangeRepo.getExchanges.resolves([]);
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

  test('first call has startTime of recent order', async () => {
    const order = uniqueObjectWithTimeAndSourceIDEqual(123, defaultOrder);
    deps.orderRepo.find
      .withArgs({
        traderID: defaultReq.traderID,
        sort: 'desc',
        limit: 1,
      })
      .resolves([order]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const firstCall = deps.exchangeService.getFilledOrders.getCall(0);
    const expectedArgs = { startTime: 123 };
    sinon.assert.calledWithMatch(firstCall, expectedArgs);
  });

  test('first call has zero startTime if no recent order', async () => {
    deps.orderRepo.find.resolves(null);
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

  test('first call has startTime of recent order', async () => {
    const order = uniqueObjectWithTimeAndSourceIDEqual(123, defaultOrder);
    deps.transferRepo.findDeposits
      .withArgs({
        traderID: defaultReq.traderID,
        sort: 'desc',
        limit: 1,
      })
      .resolves([order]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const firstCall = deps.exchangeService.getSuccessfulDeposits.getCall(0);
    const expectedArgs = { startTime: 123 };
    sinon.assert.calledWithMatch(firstCall, expectedArgs);
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

  test('first call has startTime of recent order', async () => {
    const withdrawal = uniqueObjectWithTimeAndSourceIDEqual(123, defaultWithdrawal);
    deps.transferRepo.findWithdrawals
      .withArgs({
        traderID: defaultReq.traderID,
        sort: 'desc',
        limit: 1,
      })
      .resolves([withdrawal]);

    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    const firstCall = deps.exchangeService.getSuccessfulWithdrawals.getCall(0);
    const expectedArgs = { startTime: 123 };
    sinon.assert.calledWithMatch(firstCall, expectedArgs);
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

describe('ingress activity', () => {
  test('ordered when only 1 fetch needed per activity type', async () => {
    // track activity
    const activity = [];
    deps.ingressFilledOrder.execute.callsFake(async obj => activity.push(obj.sourceID));
    deps.ingressDeposit.execute.callsFake(async obj => activity.push(obj.sourceID));
    deps.ingressWithdrawal.execute.callsFake(async obj => activity.push(obj.sourceID));

    // exchange data
    const order1 = uniqueObjectWithTimeAndSourceIDEqual(1, defaultOrder);
    const order2 = uniqueObjectWithTimeAndSourceIDEqual(6, defaultOrder);
    const order3 = uniqueObjectWithTimeAndSourceIDEqual(7, defaultOrder);
    deps.exchangeService.getFilledOrders.resolves([]);
    deps.exchangeService.getFilledOrders.onCall(0).resolves([order1, order2, order3]);

    const deposit1 = uniqueObjectWithTimeAndSourceIDEqual(3, defaultDeposit);
    const deposit2 = uniqueObjectWithTimeAndSourceIDEqual(4, defaultDeposit);
    const deposit3 = uniqueObjectWithTimeAndSourceIDEqual(5, defaultDeposit);
    deps.exchangeService.getSuccessfulDeposits.resolves([]);
    deps.exchangeService.getSuccessfulDeposits.onCall(0).resolves([deposit1, deposit2, deposit3]);

    const withdrawal1 = uniqueObjectWithTimeAndSourceIDEqual(2, defaultWithdrawal);
    const withdrawal2 = uniqueObjectWithTimeAndSourceIDEqual(8, defaultWithdrawal);
    const withdrawal3 = uniqueObjectWithTimeAndSourceIDEqual(9, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.resolves([]);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(0).resolves([
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
    const order1 = uniqueObjectWithTimeAndSourceIDEqual(1, defaultOrder);
    const order2 = uniqueObjectWithTimeAndSourceIDEqual(6, defaultOrder);
    const order3 = uniqueObjectWithTimeAndSourceIDEqual(7, defaultOrder);
    deps.exchangeService.getFilledOrders.resolves([]);
    deps.exchangeService.getFilledOrders.onCall(0).resolves([order1, order2, order3]);

    const order4 = uniqueObjectWithTimeAndSourceIDEqual(10, defaultOrder);
    const order5 = uniqueObjectWithTimeAndSourceIDEqual(13, defaultOrder);
    const order6 = uniqueObjectWithTimeAndSourceIDEqual(15, defaultOrder);
    deps.exchangeService.getFilledOrders.onCall(1).resolves([order4, order5, order6]);

    const order7 = uniqueObjectWithTimeAndSourceIDEqual(16, defaultOrder);
    deps.exchangeService.getFilledOrders.onCall(2).resolves([order7]);

    const deposit1 = uniqueObjectWithTimeAndSourceIDEqual(3, defaultDeposit);
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

    const withdrawal6 = uniqueObjectWithTimeAndSourceIDEqual(18, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(2).resolves([withdrawal6]);

    const withdrawal7 = uniqueObjectWithTimeAndSourceIDEqual(19, defaultWithdrawal);
    deps.exchangeService.getSuccessfulWithdrawals.onCall(3).resolves([withdrawal7]);

    // run
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    // assert
    expect(activity).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });
});

test('calculates trader scores if trader has other exchanges', async () => {
  // setup
  deps.traderExchangeRepo.getExchanges
    .withArgs(defaultReq.traderID)
    .resolves([
      { id: 'bittrex' },
      { id: 'binance' },
    ]);

  // run
  const useCase = new IngressTraderExchange(deps);
  await useCase.execute(defaultReq);

  // assert
  sinon.assert.calledWith(deps.traderScoreService.calculateScores, defaultReq.traderID);
});

test('doesn\'t calculate trader scores if trader has no other exchanges', async () => {
  // setup
  deps.traderExchangeRepo.getExchanges.resolves([
    { id: 'binance' },
  ]);

  // run
  const useCase = new IngressTraderExchange(deps);
  await useCase.execute(defaultReq);

  // assert
  sinon.assert.notCalled(deps.traderScoreService.calculateScores);
});

test('rejects if traderScoreService.calculateScores errors', async () => {
  deps.traderExchangeRepo.getExchanges.resolves([
    { id: 'bittrex' },
    { id: 'binance' },
  ]);
  deps.traderScoreService.calculateScores.rejects();

  const useCase = new IngressTraderExchange(deps);

  return expect(useCase.execute(defaultReq)).rejects.toThrow();
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
