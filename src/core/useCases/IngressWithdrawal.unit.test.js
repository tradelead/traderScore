const sinon = require('sinon');
const Withdrawal = require('../models/Withdrawal');
const IngressWithdrawal = require('./IngressWithdrawal');

let defaultReq;
let unitOfWork;
let unitOfWorkFactory;
let deps;

beforeEach(() => {
  defaultReq = {
    sourceID: 'source123',
    traderID: 'trader123',
    exchangeID: 'exchange123',
    asset: 'ETH',
    quantity: 2.123,
    time: Date.now(),
  };

  unitOfWork = {
    transferService: {
      addWithdrawal: sinon.stub(),
    },
    tradeService: {
      newTrade: sinon.stub(),
    },
    exchangeIngressRepo: {
      isComplete: sinon.stub(),
    },
    complete: sinon.stub(),
    rollback: sinon.stub(),
  };

  unitOfWorkFactory = {
    create: async () => unitOfWork,
  };

  deps = { unitOfWorkFactory };

  unitOfWork.exchangeIngressRepo.isComplete.resolves(true);
  unitOfWork.transferService.addWithdrawal.resolves('withdrawal123');
});

it('throws error if ingress not complete when past false', async () => {
  unitOfWork.exchangeIngressRepo.isComplete.resolves(false);
  const useCase = new IngressWithdrawal(deps);
  defaultReq.past = false;
  return expect(useCase.execute(defaultReq)).rejects.toThrow('Exchange ingress not complete');
});

it('does not throws error if ingress not complete when past true', async () => {
  unitOfWork.exchangeIngressRepo.isComplete.resolves(false);
  const useCase = new IngressWithdrawal(deps);
  defaultReq.past = true;
  return expect(useCase.execute(defaultReq)).resolves.toBeUndefined();
});

it('saves withdrawal', async () => {
  const useCase = new IngressWithdrawal(deps);
  await useCase.execute(defaultReq);

  const withdrawal = new Withdrawal(defaultReq);
  sinon.assert.calledWith(unitOfWork.transferService.addWithdrawal, withdrawal);
});

it('completes unit of work', async () => {
  const useCase = new IngressWithdrawal(deps);
  await useCase.execute(defaultReq);

  sinon.assert.called(unitOfWork.complete);
});

it('completes unit of work when newTrade fails with insufficient entries if option set', async () => {
  unitOfWork.tradeService.newTrade.rejects(new Error('Insufficient entries'));

  const useCase = new IngressWithdrawal(deps);
  await useCase.execute({ ...defaultReq, catchInsufficientEntry: true });

  sinon.assert.called(unitOfWork.complete);
});

it('rollback unit of work on addWithdrawal error', async () => {
  unitOfWork.transferService.addWithdrawal.rejects();

  const useCase = new IngressWithdrawal(deps);
  try {
    await useCase.execute(defaultReq);
  } catch (e) {}

  sinon.assert.called(unitOfWork.rollback);
});

it('throw error on addWithdrawal error', async () => {
  unitOfWork.transferService.addWithdrawal.rejects();

  const useCase = new IngressWithdrawal(deps);
  expect(useCase.execute(defaultReq)).rejects.toThrow();
});

describe('new trade', () => {
  test('new trade use case called', async () => {
    const useCase = new IngressWithdrawal(deps);
    await useCase.execute(defaultReq);

    const newTradeCalled = unitOfWork.tradeService.newTrade.called;
    expect(newTradeCalled).toBe(true);
  });

  test('called with order sourceID', async () => {
    const useCase = new IngressWithdrawal(deps);
    await useCase.execute(defaultReq);

    const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
    expect(newTradeArg).toHaveProperty('sourceID', defaultReq.sourceID);
  });

  test('called with sourceType as withdrawal', async () => {
    const useCase = new IngressWithdrawal(deps);
    await useCase.execute(defaultReq);

    const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
    expect(newTradeArg).toHaveProperty('sourceType', 'withdrawal');
  });

  test('called with withdrawal traderID', async () => {
    const useCase = new IngressWithdrawal(deps);
    await useCase.execute(defaultReq);

    const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
    expect(newTradeArg).toHaveProperty('traderID', defaultReq.traderID);
  });

  test('called with withdrawal exchangeID', async () => {
    const useCase = new IngressWithdrawal(deps);
    await useCase.execute(defaultReq);

    const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
    expect(newTradeArg).toHaveProperty('exchangeID', defaultReq.exchangeID);
  });

  test('called with withdrawal asset', async () => {
    const useCase = new IngressWithdrawal(deps);
    await useCase.execute(defaultReq);

    const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
    expect(newTradeArg).toHaveProperty('asset', defaultReq.asset);
  });

  test('called with incrementScores as false if past is true', async () => {
    const useCase = new IngressWithdrawal(deps);
    const req = Object.assign({}, defaultReq);
    req.past = true;
    await useCase.execute(req);

    const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
    expect(newTradeArg).toHaveProperty('incrementScores', false);
  });

  test('called with disableScoring as true if past is true', async () => {
    const useCase = new IngressWithdrawal(deps);
    const req = Object.assign({}, defaultReq);
    req.past = true;
    await useCase.execute(req);

    const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
    expect(newTradeArg).toHaveProperty('disableScoring', true);
  });

  test('called with withdrawal quantity as exitQuantity', async () => {
    const useCase = new IngressWithdrawal(deps);
    const req = Object.assign({}, defaultReq);
    req.quantity = 0.2;

    await useCase.execute(req);

    const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
    expect(newTradeArg).toHaveProperty('exitQuantity', 0.2);
  });

  test('called with withdrawal time as exitTime', async () => {
    const useCase = new IngressWithdrawal(deps);
    await useCase.execute(defaultReq);

    const newTradeArg = unitOfWork.tradeService.newTrade.getCall(0).args[0];
    expect(newTradeArg).toHaveProperty('exitTime', defaultReq.time);
  });
});

describe('data validation', () => {
  it('throws error when sourceID missing', async () => {
    const useCase = new IngressWithdrawal({});
    const req = Object.assign({}, defaultReq);
    req.sourceID = '';

    return expect(useCase.execute(req)).rejects.toThrow('"Source ID" is not allowed to be empty');
  });

  it('throws error when traderID missing', async () => {
    const useCase = new IngressWithdrawal({});
    const req = Object.assign({}, defaultReq);
    req.traderID = '';

    return expect(useCase.execute(req)).rejects.toThrow('"Trader ID" is not allowed to be empty');
  });

  it('throws error when exchangeID missing', async () => {
    const useCase = new IngressWithdrawal({});
    const req = Object.assign({}, defaultReq);
    req.exchangeID = '';

    return expect(useCase.execute(req)).rejects.toThrow('"Exchange ID" is not allowed to be empty');
  });

  it('throws error when asset missing', async () => {
    const useCase = new IngressWithdrawal({});
    const req = Object.assign({}, defaultReq);
    req.asset = '';

    return expect(useCase.execute(req)).rejects.toThrow('"Asset" is not allowed to be empty');
  });

  it('throws error when quantity missing', async () => {
    const useCase = new IngressWithdrawal({});
    const req = Object.assign({}, defaultReq);
    req.quantity = null;

    return expect(useCase.execute(req)).rejects.toThrow('"Quantity" must be a number');
  });

  it('throws error when time missing', async () => {
    const useCase = new IngressWithdrawal({});
    const req = Object.assign({}, defaultReq);
    req.time = null;

    return expect(useCase.execute(req)).rejects.toThrow('"Time" must be a number');
  });

  test('no error when unknown key is passed', async () => {
    const useCase = new IngressWithdrawal(deps);
    const req = Object.assign({}, defaultReq);
    req.type = 'test';

    return expect(useCase.execute(req)).resolves;
  });
});
