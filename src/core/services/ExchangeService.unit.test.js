const sinon = require('sinon');
const ExchangeService = require('./ExchangeService');

let deps = {};
const exchangeAPI = {
  getFilledOrders: sinon.stub(),
  getDeposits: sinon.stub(),
  getWithdrawals: sinon.stub(),
  isRootAsset: sinon.stub(),
  getPrice: sinon.stub(),
  getMarkets: sinon.stub(),
};

let service;

beforeEach(() => {
  deps = {
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
  exchangeAPI.isRootAsset.reset();
  exchangeAPI.getMarkets.reset();

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

  it('returns 1 if is root asset', async () => {
    exchangeAPI.isRootAsset.withArgs('AAA').resolves(true);
    const res = await service.getPrice(req);
    expect(res).toBe(1);
  });

  it('returns exchangeAPI.getPrice', async () => {
    exchangeAPI.getPrice.resolves(123.456789);
    const res = await service.getPrice(req);
    expect(res).toBe(123.456789);
  });

  it('calls exchangeAPI.getPrice with params', async () => {
    await service.getPrice(req);

    const expectedArgs = {
      asset: req.asset,
      quoteAsset: req.quoteAsset,
      time: req.time,
    };
    sinon.assert.calledWith(exchangeAPI.getPrice, expectedArgs);
  });
});

describe('getBTCValue', () => {
  let req;

  beforeEach(() => {
    req = {
      exchangeID: 'exchange123',
      asset: 'AAA',
      quoteAsset: 'BBB',
      time: Date.now(),
      qty: 123.4,
      price: 234.5,
    };
  });

  test('when asset BTC return qty', async () => {
    req.asset = 'BTC';
    const res = await service.getBTCValue(req);

    expect(res).toBe(req.qty);
  });

  test('when quoteAsset BTC return qty * price with precision', async () => {
    req.quoteAsset = 'BTC';
    req.qty = 0.1;
    req.price = 0.2;
    const res = await service.getBTCValue(req);

    expect(res).toBe(0.02);
  });

  test('when quoteAsset BTC and price null return qty * price from exchange with precision', async () => {
    req.quoteAsset = 'BTC';
    req.qty = 0.1;
    delete req.price;

    sinon.stub(service, 'getPrice').withArgs({
      exchangeID: req.exchangeID,
      asset: req.asset,
      quoteAsset: 'BTC',
      time: req.time,
    }).resolves(0.2);

    const res = await service.getBTCValue(req);

    expect(res).toBe(0.02);
  });

  test('when asset is root asset return qty divided by root asset quote price for btc', async () => {
    exchangeAPI.isRootAsset.resolves(true);
    sinon.stub(service, 'getPrice').withArgs({
      exchangeID: req.exchangeID,
      asset: 'BTC',
      quoteAsset: req.asset,
      time: req.time,
    }).resolves(0.1);

    req.qty = 0.01;

    const res = await service.getBTCValue(req);

    expect(res).toBe(0.1);
  });

  test('when asset isn\'t root asset return qty times asset btc price', async () => {
    sinon.stub(service, 'getPrice').withArgs({
      exchangeID: req.exchangeID,
      asset: req.asset,
      quoteAsset: 'BTC',
      time: req.time,
    }).resolves(0.2);

    req.qty = 0.1;

    const res = await service.getBTCValue(req);

    expect(res).toBe(0.02);
  });
});

describe('findMarketQuoteAsset', () => {
  let req;

  beforeEach(() => {
    req = {
      exchangeID: 'exchange123',
      asset: 'AAA',
      preferredQuoteAsset: 'BBB',
    };

    exchangeAPI.getMarkets.resolves([{ asset: 'AAA', quoteAsset: 'CCC' }]);
  });

  it('calls exchangeAPIFactory.get with exchangeID', async () => {
    await service.findMarketQuoteAsset(req);
    sinon.assert.calledWith(deps.exchangeAPIFactory.get, req.exchangeID);
  });

  it('returns same asset if root asset', async () => {
    exchangeAPI.isRootAsset.withArgs(req.asset).resolves(true);
    const resAsset = await service.findMarketQuoteAsset(req);
    expect(resAsset).toEqual(req.asset);
  });

  it('returns preferredQuoteAsset if exists', async () => {
    exchangeAPI.getMarkets.resolves([{ asset: 'AAA', quoteAsset: 'BBB' }]);
    const resAsset = await service.findMarketQuoteAsset(req);
    expect(resAsset).toEqual(req.preferredQuoteAsset);
  });

  it('returns first market item if no preferred', async () => {
    exchangeAPI.getMarkets.resolves([
      { asset: 'BBB', quoteAsset: 'DDD' },
      { asset: 'AAA', quoteAsset: 'CCC' },
      { asset: 'AAA', quoteAsset: 'DDD' },
    ]);
    const resAsset = await service.findMarketQuoteAsset(req);
    expect(resAsset).toEqual('CCC');
  });

  it('throws error if asset not specified', async () => {
    delete req.asset;
    expect(service.findMarketQuoteAsset(req)).rejects.toThrow('"Asset" is required');
  });

  it('throws error if exchangeID not specified', async () => {
    delete req.exchangeID;
    expect(service.findMarketQuoteAsset(req)).rejects.toThrow('"Exchange ID" is required');
  });

  it('doesn\'t throw error if preferredQuoteAsset not specified', async () => {
    delete req.preferredQuoteAsset;
    expect(service.findMarketQuoteAsset(req)).resolves.toBeTruthy();
  });
});
