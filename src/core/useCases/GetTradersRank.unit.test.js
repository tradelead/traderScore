const sinon = require('sinon');
const GetTradersRank = require('./GetTradersRank');

const defaultReq = {
  traderIDs: ['trader1', 'trader2'],
};

let deps = {};

beforeEach(() => {
  deps = {
    traderScoreRepo: {
      getTraderRanks: sinon.stub(),
    },
  };

  deps.traderScoreRepo.getTraderRanks.resolves({});
});

describe('traderScoreRepo.getTraderRanks', () => {
  test('called once', async () => {
    const useCase = new GetTradersRank(deps);
    await useCase.execute(defaultReq);

    sinon.assert.callCount(deps.traderScoreRepo.getTraderRanks, 1);
  });

  test('called with correct params', async () => {
    const useCase = new GetTradersRank(deps);
    await useCase.execute(defaultReq);

    sinon.assert.calledWithMatch(deps.traderScoreRepo.getTraderRanks, defaultReq.traderIDs);
  });
});

test('returns obj from traderScoreRepo.getTraderRanks', async () => {
  const obj = {};
  deps.traderScoreRepo.getTraderRanks.resolves(obj);

  const useCase = new GetTradersRank(deps);
  const scores = await useCase.execute(defaultReq);

  expect(scores).toBe(obj);
});


describe('data validation', () => {
  it('throws error if traderIDs is missing', async () => {
    const useCase = new GetTradersRank({});
    const req = Object.assign({}, defaultReq);
    delete req.traderIDs;

    return expect(useCase.execute(req)).rejects.toThrow('"Trader IDs" is required');
  });
});
