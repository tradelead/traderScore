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
      getTraderScoreHistory: sinon.stub(),
    },
  };
});

describe('traderRepo.getTraderScoreHistory', () => {
  test('called once', async () => {
    const useCase = new GetTraderScoreHistory(deps);
    await useCase.execute(defaultReq);

    sinon.assert.callCount(deps.traderRepo.getTraderScoreHistory, 1);
  });

  test('called with traderID', async () => {
    const useCase = new GetTraderScoreHistory(deps);
    await useCase.execute(defaultReq);

    const expected = { traderID: defaultReq.traderID };
    sinon.assert.calledWithMatch(deps.traderRepo.getTraderScoreHistory, expected);
  });

  test('called with startTime', async () => {
    const useCase = new GetTraderScoreHistory(deps);
    await useCase.execute(defaultReq);

    const expected = { startTime: defaultReq.startTime };
    sinon.assert.calledWithMatch(deps.traderRepo.getTraderScoreHistory, expected);
  });

  test('called with endTime', async () => {
    const useCase = new GetTraderScoreHistory(deps);
    await useCase.execute(defaultReq);

    const expected = { endTime: defaultReq.endTime };
    sinon.assert.calledWithMatch(deps.traderRepo.getTraderScoreHistory, expected);
  });
});

it('returns response from traderRepo.getTraderScoreHistory', async () => {
  const returnedScores = [{ score: 1, time: 2 }];
  deps.traderRepo.getTraderScoreHistory.resolves(returnedScores);

  const useCase = new GetTraderScoreHistory(deps);
  const scores = await useCase.execute(defaultReq);

  expect(scores).toBe(returnedScores);
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
