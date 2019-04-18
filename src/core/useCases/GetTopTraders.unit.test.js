const sinon = require('sinon');
const GetTopTraders = require('./GetTopTraders');

const defaultReq = {
  period: 'day',
  limit: 10,
};

let deps = {};

beforeEach(() => {
  deps = {
    allowedPeriods: ['day'],
    traderScoreRepo: {
      getTopTraders: sinon.stub(),
      getTraderRanks: sinon.stub(),
    },
  };

  deps.traderScoreRepo.getTopTraders.resolves([]);
});

describe('traderScoreRepo.getTopTraders', () => {
  test('called once', async () => {
    const useCase = new GetTopTraders(deps);
    await useCase.execute(defaultReq);

    sinon.assert.callCount(deps.traderScoreRepo.getTopTraders, 1);
  });

  test('called with period', async () => {
    const useCase = new GetTopTraders(deps);
    await useCase.execute(defaultReq);

    const expected = { period: defaultReq.period };
    sinon.assert.calledWithMatch(deps.traderScoreRepo.getTopTraders, expected);
  });

  test('called with limit', async () => {
    const useCase = new GetTopTraders(deps);
    await useCase.execute(defaultReq);

    const expected = { limit: defaultReq.limit };
    sinon.assert.calledWithMatch(deps.traderScoreRepo.getTopTraders, expected);
  });
});

describe('format return', () => {
  beforeEach(() => {
    const returnedTopTraders = [
      { traderID: 'trader1', score: 234.12 },
      { traderID: 'trader2', score: 123.45 },
    ];
    deps.traderScoreRepo.getTopTraders.resolves(returnedTopTraders);
  });

  test('when no period specified: return ranks as order from getTopTraders', async () => {
    const useCase = new GetTopTraders(deps);
    const req = Object.assign({}, defaultReq);
    delete req.period;

    const topTraders = await useCase.execute(req);

    expect(topTraders).toEqual([
      { traderID: 'trader1', score: 234.12, rank: 1 },
      { traderID: 'trader2', score: 123.45, rank: 2 },
    ]);
  });

  describe('when period specified', () => {
    describe('rank', () => {
      test('call getTradersRank with traderIDs', async () => {
        const useCase = new GetTopTraders(deps);
        await useCase.execute(defaultReq);

        sinon.assert.calledWith(deps.traderScoreRepo.getTraderRanks, ['trader1', 'trader2']);
      });

      test('return rank from getTradersRank', async () => {
        const traderRanks = { trader1: 234, trader2: 123 };
        deps.traderScoreRepo.getTraderRanks.resolves(traderRanks);

        const useCase = new GetTopTraders(deps);
        const traders = await useCase.execute(defaultReq);

        const expected = [
          { traderID: 'trader1', score: 234.12, rank: 234 },
          { traderID: 'trader2', score: 123.45, rank: 123 },
        ];

        expect(traders).toEqual(expected);
      });
    });
  });
});

describe('data validation', () => {
  it('allow empty period', async () => {
    const useCase = new GetTopTraders(deps);
    const req = Object.assign({}, defaultReq);
    delete req.period;

    return expect(useCase.execute(req)).resolves;
  });

  it('throws error if limit is empty', async () => {
    const useCase = new GetTopTraders({});
    const req = Object.assign({}, defaultReq);
    delete req.limit;

    return expect(useCase.execute(req)).rejects.toThrow('"Limit" is required');
  });

  it('throws error if limit is greater than 100', async () => {
    const useCase = new GetTopTraders({});
    const req = Object.assign({}, defaultReq);
    req.limit = 101;

    await expect(useCase.execute(req)).rejects.toThrow('"Limit" must be less than or equal to 100');
  });

  it('doesn\'t throws error if limit is numeric string', async () => {
    const useCase = new GetTopTraders(deps);
    const req = Object.assign({}, defaultReq);
    req.limit = '99';

    return expect(useCase.execute(req)).resolves;
  });

  it('throws error if limit is non-numeric string', async () => {
    const useCase = new GetTopTraders({});
    const req = Object.assign({}, defaultReq);
    req.limit = 'test';

    return expect(useCase.execute(req)).rejects.toThrow('"Limit" must be a number');
  });

  it('throws error if period is not within allowed periods', async () => {
    deps.allowedPeriods = ['day'];
    const useCase = new GetTopTraders(deps);
    const req = Object.assign({}, defaultReq);
    req.period = 'test';

    return expect(useCase.execute(req)).rejects.toThrow('Period is invalid');
  });
});
