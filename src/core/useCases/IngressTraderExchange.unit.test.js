const sinon = require('sinon');
const Order = require('../models/Order');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const IngressTraderExchange = require('./IngressTraderExchange');

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
    ingressDeposit: { execute: sinon.stub() },
    ingressFilledOrder: { execute: sinon.stub() },
    ingressWithdrawal: { execute: sinon.stub() },
    exchangeService: {
      getFilledOrders: sinon.stub(),
      getDeposits: sinon.stub(),
      getWithdrawals: sinon.stub(),
    },
    exchangeWatchRepo: {
      add: sinon.stub(),
    },
  };

  deps.ingressDeposit.execute.resolves(null);
  deps.ingressFilledOrder.execute.resolves(null);
  deps.ingressWithdrawal.execute.resolves(null);

  deps.exchangeService.getFilledOrders.resolves([]);
  deps.exchangeService.getFilledOrders.onCall(0).resolves([
    defaultOrder,
  ]);

  deps.exchangeService.getDeposits.resolves([]);
  deps.exchangeService.getDeposits.onCall(0).resolves([
    defaultDeposit,
  ]);

  deps.exchangeService.getWithdrawals.resolves([]);
  deps.exchangeService.getWithdrawals.onCall(0).resolves([
    defaultWithdrawal,
  ]);

  deps.exchangeWatchRepo.add.resolves(true);
});

it('adds to exchangeWatchRepo', async () => {
  const useCase = new IngressTraderExchange(deps);
  await useCase.execute(defaultReq);

  const expectedArg = { traderID: defaultReq.traderID, exchangeID: defaultReq.exchangeID };
  sinon.assert.calledWith(deps.exchangeWatchRepo.add, expectedArg);
});

it('throw error from exchangeWatchRepo.add', async () => {
  deps.exchangeWatchRepo.add.rejects();
  const useCase = new IngressTraderExchange(deps);

  await expect(useCase.execute(defaultReq)).rejects.toThrow();
});

it('called exchangeService.getFilledOrders with traderID', async () => {
  deps.exchangeWatchRepo.add.rejects();
  const useCase = new IngressTraderExchange(deps);

  await expect(useCase.execute(defaultReq)).rejects.toThrow();
});

function uniqueObjectWithTimeAndSourceIDEqual(id, obj) {
  const newObj = Object.assign({}, obj);
  newObj.sourceID = id;
  newObj.time = id;
  return newObj;
}

describe('ingress activity in order', () => {
  it('ingressed activity in order when only 1 fetch needed per activity type', async () => {
    deps.exchangeActivityLimitPerFetch = 3;

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
    deps.exchangeService.getDeposits.resolves([]);
    deps.exchangeService.getDeposits.onCall(0).resolves([deposit1, deposit2, deposit3]);

    const withdrawal1 = uniqueObjectWithTimeAndSourceIDEqual(2, defaultWithdrawal);
    const withdrawal2 = uniqueObjectWithTimeAndSourceIDEqual(8, defaultWithdrawal);
    const withdrawal3 = uniqueObjectWithTimeAndSourceIDEqual(9, defaultWithdrawal);
    deps.exchangeService.getWithdrawals.resolves([]);
    deps.exchangeService.getWithdrawals.onCall(0).resolves([withdrawal1, withdrawal2, withdrawal3]);

    // run
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    // assert
    expect(activity).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('ingressed activity in order when multi fetch needed per activity type with random ordering', async () => {
    deps.exchangeActivityLimitPerFetch = 3;

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
    deps.exchangeService.getDeposits.resolves([]);
    deps.exchangeService.getDeposits.onCall(0).resolves([deposit1, deposit2, deposit3]);

    const deposit4 = uniqueObjectWithTimeAndSourceIDEqual(12, defaultDeposit);
    const deposit5 = uniqueObjectWithTimeAndSourceIDEqual(14, defaultDeposit);
    deps.exchangeService.getDeposits.onCall(1).resolves([deposit4, deposit5]);

    const withdrawal1 = uniqueObjectWithTimeAndSourceIDEqual(2, defaultWithdrawal);
    const withdrawal2 = uniqueObjectWithTimeAndSourceIDEqual(8, defaultWithdrawal);
    const withdrawal3 = uniqueObjectWithTimeAndSourceIDEqual(9, defaultWithdrawal);
    deps.exchangeService.getWithdrawals.resolves([]);
    deps.exchangeService.getWithdrawals.onCall(0).resolves([withdrawal1, withdrawal2, withdrawal3]);

    const withdrawal4 = uniqueObjectWithTimeAndSourceIDEqual(11, defaultWithdrawal);
    const withdrawal5 = uniqueObjectWithTimeAndSourceIDEqual(17, defaultWithdrawal);
    deps.exchangeService.getWithdrawals.onCall(1).resolves([withdrawal4, withdrawal5]);

    // run
    const useCase = new IngressTraderExchange(deps);
    await useCase.execute(defaultReq);

    // assert
    expect(activity).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
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
