const sinon = require('sinon');
const GetTraderScoreHistory = require('./GetTraderScoreHistory');

const defaultReq = {
  traderID: 'trader123',
  startTime: 10,
  endTime: 100,
  limit: 25,
  period: 'day',
};

let deps = {};

beforeEach(() => {
  deps = {
    traderScoreRepo: {
      getTradersScoreHistories: sinon.stub(),
    },
  };

  deps.traderScoreRepo.getTradersScoreHistories.resolves([]);
});

describe('traderScoreRepo.getTradersScoreHistories', () => {
  test('called once', async () => {
    const useCase = new GetTraderScoreHistory(deps);
    await useCase.execute(defaultReq);

    sinon.assert.callCount(deps.traderScoreRepo.getTradersScoreHistories, 1);
  });

  test('called with correct params', async () => {
    const useCase = new GetTraderScoreHistory(deps);
    await useCase.execute(defaultReq);

    const expected = [{
      traderID: defaultReq.traderID,
      startTime: defaultReq.startTime,
      endTime: defaultReq.endTime,
      limit: defaultReq.limit,
      period: defaultReq.period,
    }];
    sinon.assert.calledWithMatch(deps.traderScoreRepo.getTradersScoreHistories, expected);
  });

  test('error thrown when doesn\'t return array', async () => {
    deps.traderScoreRepo.getTradersScoreHistories.resolves(null);
    const useCase = new GetTraderScoreHistory(deps);

    return expect(useCase.execute(defaultReq)).rejects.toThrow('Unexpected response from traderScoreRepo.getTradersScoreHistories');
  });
});

describe('return format', () => {
  test('returns obj in traderScoreRepo.getTradersScoreHistories array', async () => {
    const traderScore = { score: 1, time: 2 };
    const returnedScores = [traderScore];
    deps.traderScoreRepo.getTradersScoreHistories.resolves(returnedScores);

    const useCase = new GetTraderScoreHistory(deps);
    const scores = await useCase.execute(defaultReq);

    expect(scores).toBe(traderScore);
  });
});


describe('data validation', () => {
  it('throws error if traderID is missing', async () => {
    const useCase = new GetTraderScoreHistory({});
    const req = Object.assign({}, defaultReq);
    delete req.traderID;

    return expect(useCase.execute(req)).rejects.toThrow('"Trader ID" is required');
  });

  it('doesn\'t throws error if startTime is numeric string', async () => {
    const useCase = new GetTraderScoreHistory(deps);
    const req = Object.assign({}, defaultReq);
    req.startTime = '123';

    return expect(useCase.execute(req)).resolves.toBeNull();
  });

  it('doesn\'t throws error if limit isn\'t passed', async () => {
    const useCase = new GetTraderScoreHistory(deps);
    const req = Object.assign({}, defaultReq);
    delete req.limit;

    return expect(useCase.execute(req)).resolves.toBeNull();
  });

  it('doesn\'t throws error if period isn\'t passed', async () => {
    const useCase = new GetTraderScoreHistory(deps);
    const req = Object.assign({}, defaultReq);
    delete req.period;

    return expect(useCase.execute(req)).resolves.toBeNull();
  });

  it('throws error if startTime is non-numeric string', async () => {
    const useCase = new GetTraderScoreHistory({});
    const req = Object.assign({}, defaultReq);
    req.startTime = 'test';

    return expect(useCase.execute(req)).rejects.toThrow('"Start Time" must be a number');
  });

  it('throws error if limit is greater than 500', async () => {
    const useCase = new GetTraderScoreHistory({});
    const req = Object.assign({}, defaultReq);
    req.limit = 501;

    return expect(useCase.execute(req)).rejects.toThrow('"Limit" must be less than 500');
  });

  it('doesn\'t error if endTime is numeric string', async () => {
    const useCase = new GetTraderScoreHistory(deps);
    const req = Object.assign({}, defaultReq);
    req.endTime = '123';

    return expect(useCase.execute(req)).resolves.toBeNull();
  });

  it('throws error if endTime is non-numeric string', async () => {
    const useCase = new GetTraderScoreHistory({});
    const req = Object.assign({}, defaultReq);
    req.endTime = 'test';

    return expect(useCase.execute(req)).rejects.toThrow('"End Time" must be a number');
  });
});
