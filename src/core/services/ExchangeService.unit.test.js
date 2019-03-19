const sinon = require('sinon');
const ExchangeService = require('./ExchangeService');

let deps = {};
const exchangeAPI = {
  getFilledOrders: sinon.stub(),
  getDeposits: sinon.stub(),
  getWithdrawals: sinon.stub(),
  isRootAsset: sinon.stub(),
};

let service;

beforeEach(() => {
  deps = {
    traderPortfolioRepo: {
      portfolioSnapshot: sinon.stub(),
    },
    traderExchangeKeysRepo: {
      get: sinon.stub(),
    },
    exchangeAPIFactory: {
      get: sinon.stub(),
    },
  };

  deps.exchangeAPIFactory.get.callsFake(() => exchangeAPI);
  exchangeAPI.getFilledOrders.reset();
  exchangeAPI.getDeposits.reset();
  exchangeAPI.getWithdrawals.reset();

  service = new ExchangeService(deps);
});

describe('getFilledOrders', () => {
  const req = {
    exchangeID: 'exchange123',
    traderID: 'trader123',
    startTime: Date.now(),
    limit: 1,
    sort: 'desc',
  };

  it('returns results from exchangeAPI', async () => {
    const obj = { test: 'test' };
    exchangeAPI.getFilledOrders.resolves(obj);
    const res = await service.getFilledOrders(req);
    expect(res).toBe(obj);
  });

  it('calls exchangeAPIFactory.get with exchangeID', async () => {
    await service.getFilledOrders(req);
    sinon.assert.calledWith(deps.exchangeAPIFactory.get, req.exchangeID);
  });

  it('calls traderExchangeKeysRepo.get with exchangeID', async () => {
    await service.getFilledOrders(req);

    const { exchangeID } = req;
    sinon.assert.calledWithMatch(deps.traderExchangeKeysRepo.get, { exchangeID });
  });

  it('calls traderExchangeKeysRepo.get with traderID', async () => {
    await service.getFilledOrders(req);

    const { traderID } = req;
    sinon.assert.calledWithMatch(deps.traderExchangeKeysRepo.get, { traderID });
  });

  it('calls exchangeAPI with keys from key repo', async () => {
    const keys = { key: 'abc', secret: '123' };
    deps.traderExchangeKeysRepo.get.resolves(keys);

    await service.getFilledOrders(req);

    sinon.assert.calledWithMatch(exchangeAPI.getFilledOrders, { keys });
  });

  it('calls exchangeAPI with params', async () => {
    await service.getFilledOrders(req);

    const {
      traderID,
      startTime,
      limit,
      sort,
    } = req;

    const expectedArgs = {
      traderID,
      startTime,
      limit,
      sort,
    };
    sinon.assert.calledWithMatch(exchangeAPI.getFilledOrders, expectedArgs);
  });

  it('default sort to asc', async () => {
    delete req.sort;
    await service.getFilledOrders(req);
    sinon.assert.calledWithMatch(exchangeAPI.getFilledOrders, { sort: 'asc' });
  });

  it('throws error when sort not valid', async () => {
    req.sort = 'test';
    expect(service.getFilledOrders(req)).rejects.toThrow('"Sort" must be one of [asc, desc]');
  });
});

describe('getSuccessfulDeposits', () => {
  const req = {
    exchangeID: 'exchange123',
    traderID: 'trader123',
    startTime: Date.now(),
    limit: 1,
    sort: 'desc',
  };

  it('returns results from exchangeAPI', async () => {
    const obj = { test: 'test' };
    exchangeAPI.getDeposits.resolves(obj);
    const res = await service.getSuccessfulDeposits(req);
    expect(res).toBe(obj);
  });

  it('calls exchangeAPIFactory.get with exchangeID', async () => {
    await service.getSuccessfulDeposits(req);
    sinon.assert.calledWith(deps.exchangeAPIFactory.get, req.exchangeID);
  });

  it('calls traderExchangeKeysRepo.get with exchangeID', async () => {
    await service.getSuccessfulDeposits(req);

    const { exchangeID } = req;
    sinon.assert.calledWithMatch(deps.traderExchangeKeysRepo.get, { exchangeID });
  });

  it('calls traderExchangeKeysRepo.get with traderID', async () => {
    await service.getSuccessfulDeposits(req);

    const { traderID } = req;
    sinon.assert.calledWithMatch(deps.traderExchangeKeysRepo.get, { traderID });
  });

  it('calls exchangeAPI with keys from key repo', async () => {
    const keys = { key: 'abc', secret: '123' };
    deps.traderExchangeKeysRepo.get.resolves(keys);

    await service.getSuccessfulDeposits(req);

    sinon.assert.calledWithMatch(exchangeAPI.getDeposits, { keys });
  });

  it('calls exchangeAPI with params', async () => {
    await service.getSuccessfulDeposits(req);

    const {
      traderID,
      startTime,
      limit,
      sort,
    } = req;

    const expectedArgs = {
      traderID,
      startTime,
      limit,
      sort,
      status: 'success',
    };
    sinon.assert.calledWithMatch(exchangeAPI.getDeposits, expectedArgs);
  });

  it('default sort to asc', async () => {
    delete req.sort;
    await service.getSuccessfulDeposits(req);
    sinon.assert.calledWithMatch(exchangeAPI.getDeposits, { sort: 'asc' });
  });

  it('throws error when sort not valid', async () => {
    req.sort = 'test';
    expect(service.getSuccessfulDeposits(req)).rejects.toThrow('"Sort" must be one of [asc, desc]');
  });
});

describe('getSuccessfulWithdrawals', () => {
  const req = {
    exchangeID: 'exchange123',
    traderID: 'trader123',
    startTime: Date.now(),
    limit: 1,
    sort: 'desc',
  };

  it('returns results from exchangeAPI', async () => {
    const obj = { test: 'test' };
    exchangeAPI.getWithdrawals.resolves(obj);
    const res = await service.getSuccessfulWithdrawals(req);
    expect(res).toBe(obj);
  });

  it('calls exchangeAPIFactory.get with exchangeID', async () => {
    await service.getSuccessfulWithdrawals(req);
    sinon.assert.calledWith(deps.exchangeAPIFactory.get, req.exchangeID);
  });

  it('calls traderExchangeKeysRepo.get with exchangeID', async () => {
    await service.getSuccessfulWithdrawals(req);

    const { exchangeID } = req;
    sinon.assert.calledWithMatch(deps.traderExchangeKeysRepo.get, { exchangeID });
  });

  it('calls traderExchangeKeysRepo.get with traderID', async () => {
    await service.getSuccessfulWithdrawals(req);

    const { traderID } = req;
    sinon.assert.calledWithMatch(deps.traderExchangeKeysRepo.get, { traderID });
  });

  it('calls exchangeAPI with keys from key repo', async () => {
    const keys = { key: 'abc', secret: '123' };
    deps.traderExchangeKeysRepo.get.resolves(keys);

    await service.getSuccessfulWithdrawals(req);

    sinon.assert.calledWithMatch(exchangeAPI.getWithdrawals, { keys });
  });

  it('calls exchangeAPI with params', async () => {
    await service.getSuccessfulWithdrawals(req);

    const {
      traderID,
      startTime,
      limit,
      sort,
    } = req;

    const expectedArgs = {
      traderID,
      startTime,
      limit,
      sort,
      status: 'success',
    };
    sinon.assert.calledWithMatch(exchangeAPI.getWithdrawals, expectedArgs);
  });

  it('default sort to asc', async () => {
    delete req.sort;
    await service.getSuccessfulWithdrawals(req);
    sinon.assert.calledWithMatch(exchangeAPI.getWithdrawals, { sort: 'asc' });
  });

  it('throws error when sort not valid', async () => {
    req.sort = 'test';
    expect(service.getSuccessfulWithdrawals(req)).rejects.toThrow('"Sort" must be one of [asc, desc]');
  });
});

describe('isRootAsset', () => {
  const req = {
    exchangeID: 'exchange123',
    symbol: 'ABC',
  };

  it('returns results from exchangeAPI', async () => {
    const obj = true;
    exchangeAPI.isRootAsset.resolves(obj);
    const res = await service.isRootAsset(req);
    expect(res).toBe(obj);
  });

  it('calls exchangeAPI with symbol', async () => {
    await service.isRootAsset(req);
    sinon.assert.calledWith(exchangeAPI.isRootAsset, req.symbol);
  });

  it('calls exchangeAPIFactory.get with exchangeID', async () => {
    await service.isRootAsset(req);
    sinon.assert.calledWith(deps.exchangeAPIFactory.get, req.exchangeID);
  });
});

describe('getPrice', () => {
  const req = {
    exchangeID: 'exchange123',
    asset: 'AAA',
    quoteAsset: 'BBB',
    time: Date.now(),
  };

  it('calls exchangeAPIFactory.get with exchangeID', async () => {
    await service.getPrice(req);
    sinon.assert.calledWith(deps.exchangeAPIFactory.get, req.exchangeID);
  });
});

describe('getBTCValue', () => {

});

describe('findMarketQuoteAsset', () => {

});
