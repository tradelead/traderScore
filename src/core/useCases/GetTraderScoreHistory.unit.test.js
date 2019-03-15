const sinon = require('sinon');
const GetTraderScoreHistory = require('./GetTraderScoreHistory');

const defaultReq = {
  traderID: 'trader123',
  startTime: 10,
  endTime: 100,
};

let deps = {};

beforeEach(() => {
  deps = {
    traderRepo: {
      getTradersScoreHistories: sinon.stub(),
    },
  };

  deps.traderRepo.getTradersScoreHistories.resolves([]);
});

describe('traderRepo.getTradersScoreHistories', () => {
  test('called once', async () => {
    const useCase = new GetTraderScoreHistory(deps);
    await useCase.execute(defaultReq);

    sinon.assert.callCount(deps.traderRepo.getTradersScoreHistories, 1);
  });

  test('called with correct params', async () => {
    const useCase = new GetTraderScoreHistory(deps);
    await useCase.execute(defaultReq);

    const expected = [{
      traderID: defaultReq.traderID,
      startTime: defaultReq.startTime,
      endTime: defaultReq.endTime,
    }];
    sinon.assert.calledWithMatch(deps.traderRepo.getTradersScoreHistories, expected);
  });

  test('error thrown when doesn\'t return array', async () => {
    deps.traderRepo.getTradersScoreHistories.resolves(null);
    const useCase = new GetTraderScoreHistory(deps);

    return expect(useCase.execute(defaultReq)).rejects.toThrow('Unexpected response from traderRepo.getTradersScoreHistories');
  });
});

describe('return format', () => {
  test('returns obj in traderRepo.getTradersScoreHistories array', async () => {
    const traderScore = { score: 1, time: 2 };
    const returnedScores = [traderScore];
    deps.traderRepo.getTradersScoreHistories.resolves(returnedScores);

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

  it('throws error if startTime is missing', async () => {
    const useCase = new GetTraderScoreHistory({});
    const req = Object.assign({}, defaultReq);
    delete req.startTime;

    return expect(useCase.execute(req)).rejects.toThrow('"Start Time" is required');
  });

  it('doesn\'t throws error if startTime is numeric string', async () => {
    const useCase = new GetTraderScoreHistory(deps);
    const req = Object.assign({}, defaultReq);
    req.startTime = '123';

    return expect(useCase.execute(req)).resolves;
  });

  it('throws error if startTime is non-numeric string', async () => {
    const useCase = new GetTraderScoreHistory({});
    const req = Object.assign({}, defaultReq);
    req.startTime = 'test';

    return expect(useCase.execute(req)).rejects.toThrow('"Start Time" must be a number');
  });

  it('throws error if endTime is missing', async () => {
    const useCase = new GetTraderScoreHistory({});
    const req = Object.assign({}, defaultReq);
    delete req.endTime;

    return expect(useCase.execute(req)).rejects.toThrow('"End Time" is required');
  });

  it('doesn\'t error if endTime is numeric string', async () => {
    const useCase = new GetTraderScoreHistory(deps);
    const req = Object.assign({}, defaultReq);
    req.endTime = '123';

    return expect(useCase.execute(req)).resolves;
  });

  it('throws error if endTime is non-numeric string', async () => {
    const useCase = new GetTraderScoreHistory({});
    const req = Object.assign({}, defaultReq);
    req.endTime = 'test';

    return expect(useCase.execute(req)).rejects.toThrow('"End Time" must be a number');
  });
});
