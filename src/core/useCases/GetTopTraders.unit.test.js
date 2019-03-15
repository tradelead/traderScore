const sinon = require('sinon');
const GetTopTraders = require('./GetTopTraders');

const defaultReq = {
  period: 'day',
  limit: 10,
};

let deps = {};

beforeEach(() => {
  deps = {
    traderRepo: {
      getTopTraders: sinon.stub(),
    },
  };
});

describe('traderRepo.GetTopTraders', () => {
  test('called once', async () => {
    const useCase = new GetTopTraders(deps);
    await useCase.execute(defaultReq);

    sinon.assert.callCount(deps.traderRepo.getTopTraders, 1);
  });

  test('called with period', async () => {
    const useCase = new GetTopTraders(deps);
    await useCase.execute(defaultReq);

    const expected = { period: defaultReq.period };
    sinon.assert.calledWithMatch(deps.traderRepo.getTopTraders, expected);
  });

  test('called with limit', async () => {
    const useCase = new GetTopTraders(deps);
    await useCase.execute(defaultReq);

    const expected = { limit: defaultReq.limit };
    sinon.assert.calledWithMatch(deps.traderRepo.getTopTraders, expected);
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

  it('doesn\'t throws error if limit is numeric string', async () => {
    const useCase = new GetTopTraders(deps);
    const req = Object.assign({}, defaultReq);
    req.limit = '123';

    return expect(useCase.execute(req)).resolves;
  });

  it('throws error if limit is non-numeric string', async () => {
    const useCase = new GetTopTraders({});
    const req = Object.assign({}, defaultReq);
    req.limit = 'test';

    return expect(useCase.execute(req)).rejects.toThrow('"Limit" must be a number');
  });
});
