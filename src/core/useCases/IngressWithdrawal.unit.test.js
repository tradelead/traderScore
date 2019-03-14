const sinon = require('sinon');
const Withdrawal = require('../models/Withdrawal');
const IngressWithdrawal = require('./IngressWithdrawal');

const defaultReq = {
  sourceID: 'source123',
  traderID: 'trader123',
  exchangeID: 'exchange123',
  asset: 'ETH',
  quantity: 2.123,
  time: Date.now(),
};

const unitOfWork = {
  transferRepo: {
    addWithdrawal: sinon.stub(),
  },
  tradeService: {
    newTrade: sinon.stub(),
  },
  complete: sinon.stub(),
  rollback: sinon.stub(),
};

const unitOfWorkFactory = {
  create: async () => unitOfWork,
};

const deps = { unitOfWorkFactory };

beforeEach(() => {
  unitOfWork.transferRepo.addWithdrawal.resolves('withdrawal123');
});

it('saves withdrawal', async () => {
  const useCase = new IngressWithdrawal(deps);
  await useCase.execute(defaultReq);

  const withdrawal = new Withdrawal(defaultReq);
  sinon.assert.calledWith(unitOfWork.transferRepo.addWithdrawal, withdrawal);
});

it('completes unit of work', async () => {
  const useCase = new IngressWithdrawal(deps);
  await useCase.execute(defaultReq);

  sinon.assert.called(unitOfWork.complete);
});

it('rollback unit of work on addWithdrawal error', async () => {
  unitOfWork.transferRepo.addWithdrawal.rejects();

  const useCase = new IngressWithdrawal(deps);
  try {
    await useCase.execute(defaultReq);
  } catch (e) {}

  sinon.assert.called(unitOfWork.rollback);
});

it('throw error on addWithdrawal error', async () => {
  unitOfWork.transferRepo.addWithdrawal.rejects();

  const useCase = new IngressWithdrawal(deps);
  expect(useCase.execute(defaultReq)).rejects.toThrow();
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
