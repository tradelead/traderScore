const sinon = require('sinon');
const GetTrader = require('./GetTrader');

const defaultTraderID = 'trader123';

let deps = {};

beforeEach(() => {
  deps = {
    traderRepo: {
      getTrader: sinon.stub(),
    },
  };
});

describe('traderRepo.getTrader', () => {
  test('called once', async () => {
    const getTrader = new GetTrader(deps);
    await getTrader.execute(defaultTraderID);

    sinon.assert.callCount(deps.traderRepo.getTrader, 1);
  });

  test('called with traderID', async () => {
    const getTrader = new GetTrader(deps);
    await getTrader.execute(defaultTraderID);

    sinon.assert.calledWith(deps.traderRepo.getTrader, defaultTraderID);
  });
});

it('returns response from traderRepo.getTrader', async () => {
  const getTraderObj = { test: 'test' };
  deps.traderRepo.getTrader.resolves(getTraderObj);

  const getTrader = new GetTrader(deps);
  const trader = await getTrader.execute(defaultTraderID);

  expect(trader).toBe(getTraderObj);
});

describe('data validation', () => {
  it('throws error if traderID is missing', async () => {
    const useCase = new GetTrader({});

    return expect(useCase.execute()).rejects.toThrow('"Trader ID" is required');
  });

  it('throws error if traderID is number', async () => {
    const useCase = new GetTrader({});

    return expect(useCase.execute(2)).rejects.toThrow('"Trader ID" must be a string');
  });
});
