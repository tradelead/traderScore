const sinon = require('sinon');
const RemoveTraderExchange = require('./RemoveTraderExchange');

const defaultReq = {
  traderID: 'trader123',
  exchangeID: 'binance',
};

let deps = {};

beforeEach(() => {
  deps = {
    exchangeWatchRepo: {
      remove: sinon.stub(),
    },
  };

  deps.exchangeWatchRepo.remove.resolves(true);
});

describe('exchangeWatchRepo remove', () => {
  test('called only once', async () => {
    const useCase = new RemoveTraderExchange(deps);
    await useCase.execute(defaultReq);

    sinon.assert.callCount(deps.exchangeWatchRepo.remove, 1);
  });

  test('called with traderID', async () => {
    const useCase = new RemoveTraderExchange(deps);
    await useCase.execute(defaultReq);

    const expected = { traderID: defaultReq.traderID };
    sinon.assert.calledWithMatch(deps.exchangeWatchRepo.remove, expected);
  });

  test('called with exchangeID', async () => {
    const useCase = new RemoveTraderExchange(deps);
    await useCase.execute(defaultReq);

    const expected = { exchangeID: defaultReq.exchangeID };
    sinon.assert.calledWithMatch(deps.exchangeWatchRepo.remove, expected);
  });
});

describe('data validation', () => {
  it('throws error when exchangeID missing', async () => {
    const useCase = new RemoveTraderExchange({});
    const req = Object.assign({}, defaultReq);
    req.exchangeID = '';

    return expect(useCase.execute(req)).rejects.toThrow('"Exchange ID" is not allowed to be empty');
  });

  it('throws error when traderID missing', async () => {
    const useCase = new RemoveTraderExchange({});
    const req = Object.assign({}, defaultReq);
    req.traderID = '';

    return expect(useCase.execute(req)).rejects.toThrow('"Trader ID" is not allowed to be empty');
  });
});
