jest.mock('node-binance-api');
jest.mock('axios');

const sinon = require('sinon');
const axiosMock = require('axios');
const BinanceAPI = require('./BinanceAPI');
const exchangeInfoResponse = require('./binanceExchangeInfoResponse');
const binanceKlineResponse = require('./binanceKlineResponse');

const axios = { get: sinon.stub() };
axiosMock.create.returns(axios);

beforeEach(() => {
  axios.get.reset();
});

const binanceAPI = new BinanceAPI({ rootAssets: ['USDT', 'USDC', 'TUSD', 'PAX', 'USDS'] });

describe('isRootAsset', () => {
  it('returns true when asset is in rootAssets array', async () => {
    axios.get
      .withArgs('https://api.binance.com/api/v1/exchangeInfo')
      .resolves({ data: exchangeInfoResponse });

    expect(await binanceAPI.isRootAsset('USDT'))
      .toBe(true);
    expect(await binanceAPI.isRootAsset('USDC'))
      .toBe(true);
    expect(await binanceAPI.isRootAsset('TUSD'))
      .toBe(true);
    expect(await binanceAPI.isRootAsset('PAX'))
      .toBe(true);
    expect(await binanceAPI.isRootAsset('USDS'))
      .toBe(true);
  });

  it('returns false when is not in rootAssets array', async () => {
    axios.get
      .withArgs('https://api.binance.com/api/v1/exchangeInfo')
      .resolves({ data: exchangeInfoResponse });

    expect(await binanceAPI.isRootAsset('BTC'))
      .toBe(false);
  });
});

describe('getPrice', () => {
  it('returns close price from close minute candle', async () => {
    axios.get
      .withArgs('https://api.binance.com/api/v1/klines?symbol=BTCUSDT&interval=1m&startTime=1515780672000&limit=1')
      .resolves({ data: binanceKlineResponse });

    expect(await binanceAPI.getPrice({
      asset: 'BTC',
      quoteAsset: 'USDT',
      time: 1515780672000
    }))
      .toEqual(13414.01);
  });
});

describe('getMarkets', () => {
  it('returns asset and quoteAsset of all binance markets', async () => {
    axios.get
      .withArgs('https://api.binance.com/api/v1/exchangeInfo')
      .resolves({ data: exchangeInfoResponse });

    const markets = await binanceAPI.getMarkets();
    expect(markets[0])
      .toEqual({
        quoteAsset: 'BTC',
        asset: 'ETH'
      });
  });
});

describe('getFilledOrders', () => {
  let req;
  let markets;
  let getMarketsMock;
  let clock;

  beforeEach(() => {
    req = {
      traderID: 'trader123',
      startTime: 123,
      limit: 10,
      sort: 'asc',
      keys: {
        key: 'key123',
        secret: 'secret123',
      },
    };

    // mock get markets
    markets = [
      {
        asset: 'BTC',
        quoteAsset: 'USDT'
      },
      {
        asset: 'ETH',
        quoteAsset: 'BTC'
      },
      {
        asset: 'OMG',
        quoteAsset: 'ETH'
      },
    ];
    getMarketsMock = sinon.stub(binanceAPI, 'getMarkets')
      .resolves(markets);
    clock = sinon.useFakeTimers(234);

    axios.get.withArgs('https://api.binance.com/api/v1/time')
      .resolves({
        data: { serverTime: 235 },
      });
  });

  afterEach(() => {
    getMarketsMock.restore();
    clock.restore();
  });

  it('throws error if key is empty', async () => {
    delete req.keys.key;
    await expect(binanceAPI.getFilledOrders(req))
      .rejects
      .toThrow('Key is required.');
  });

  it('throws error if secret is empty', async () => {
    delete req.keys.secret;
    await expect(binanceAPI.getFilledOrders(req))
      .rejects
      .toThrow('Secret is required.');
  });

  it('calls /api/v3/allOrders for each symbol with authentication', async () => {
    const requests = [
      'https://api.binance.com/api/v3/allOrders?symbol=BTCUSDT&startTime=123&limit=1000&timestamp=233&recvWindow=5170000&signature=6df3f621399a7594e5ac2f3b2aa81bb4779d3ed5a8b547a3a4e8978f0617cf1c',
      'https://api.binance.com/api/v3/allOrders?symbol=BTCUSDT&startTime=234&limit=1000&timestamp=233&recvWindow=5170000&signature=40bf9fae4ef13827ed9d69964bf4a5398d9a86aaeda6b291cd6a627cfcb52ed5',
      'https://api.binance.com/api/v3/allOrders?symbol=ETHBTC&startTime=123&limit=1000&timestamp=233&recvWindow=5170000&signature=f39edf7428e9e4ec54a27764c47a84db2375dc4158f72a3bde0eda3413999de9',
      'https://api.binance.com/api/v3/allOrders?symbol=OMGETH&startTime=123&limit=1000&timestamp=233&recvWindow=5170000&signature=69ded2a32fc82a6fd3674afcfc77f2a696ec5da3f32c1a31cf8135cfbe55df5c',
    ];

    const btcOrdersResponse = (new Array(1000)).map(() => ({
      symbol: 'BTCUSDT',
      orderId: 1,
      clientOrderId: 'myOrder1',
      price: '0.1',
      origQty: '1.0',
      executedQty: '0.0',
      cummulativeQuoteQty: '0.0',
      status: 'NEW',
      timeInForce: 'GTC',
      type: 'LIMIT',
      side: 'BUY',
      stopPrice: '0.0',
      icebergQty: '0.0',
      time: 234,
      updateTime: 1499827319559,
      isWorking: true,
    }));
    axios.get.withArgs(
      'https://api.binance.com/api/v3/allOrders?symbol=BTCUSDT&startTime=123&limit=1000&timestamp=233&recvWindow=5170000&signature=6df3f621399a7594e5ac2f3b2aa81bb4779d3ed5a8b547a3a4e8978f0617cf1c',
    )
      .resolves({
        data: btcOrdersResponse,
      });

    await binanceAPI.getFilledOrders(req);

    requests.forEach(request => sinon.assert.calledWith(axios.get, request, {
      headers: {
        'X-MBX-APIKEY': req.keys.key,
      },
    }));
  });

  it('returns /api/v3/allOrders filtered and sorted', async () => {
    const requests = [
      'https://api.binance.com/api/v3/allOrders?symbol=BTCUSDT&startTime=123&limit=1000&timestamp=233&recvWindow=5170000&signature=6df3f621399a7594e5ac2f3b2aa81bb4779d3ed5a8b547a3a4e8978f0617cf1c',
      'https://api.binance.com/api/v3/allOrders?symbol=ETHBTC&startTime=123&limit=1000&timestamp=233&recvWindow=5170000&signature=f39edf7428e9e4ec54a27764c47a84db2375dc4158f72a3bde0eda3413999de9',
      'https://api.binance.com/api/v3/allOrders?symbol=OMGETH&startTime=123&limit=1000&timestamp=233&recvWindow=5170000&signature=69ded2a32fc82a6fd3674afcfc77f2a696ec5da3f32c1a31cf8135cfbe55df5c',
    ];

    const defaultOrderResponse = {
      symbol: 'BTCUSDT',
      orderId: 1,
      clientOrderId: 'myOrder1',
      price: '0.1',
      origQty: '1.0',
      executedQty: '0.0',
      cummulativeQuoteQty: '0.0',
      status: 'NEW',
      timeInForce: 'GTC',
      type: 'LIMIT',
      side: 'BUY',
      stopPrice: '0.0',
      icebergQty: '0.0',
      time: 234,
      updateTime: 1499827319559,
      isWorking: true,
    };

    axios.get.withArgs(requests[0])
      .resolves({ data: [defaultOrderResponse] });
    axios.get.withArgs(requests[1])
      .resolves({
        data: [
          Object.assign({}, defaultOrderResponse, {
            symbol: 'ETHBTC',
            orderId: 3,
            time: 456,
          }),
        ],
      });
    axios.get.withArgs(requests[1])
      .resolves({
        data: [
          Object.assign({}, defaultOrderResponse, {
            symbol: 'OMGETH',
            orderId: 2,
            time: 345,
          }),
        ],
      });

    const orders = await binanceAPI.getFilledOrders(req);

    expect(orders)
      .toEqual([
        {
          ID: null,
          traderID: req.traderID,
          sourceID: 1,
          side: 'buy',
          asset: 'BTC',
          quoteAsset: 'USDT',
          time: 234,
        },
        {},
        {},
      ]);
  });

  it('throws error if one request fails', async () => {
    const err = new Error('Test error');
    axios.get
      .withArgs('https://api.binance.com/api/v3/allOrders?symbol=BTCUSDT&startTime=123&limit=1000&timestamp=233&recvWindow=5170000&signature=6df3f621399a7594e5ac2f3b2aa81bb4779d3ed5a8b547a3a4e8978f0617cf1c')
      .rejects(err);
    await expect(binanceAPI.getFilledOrders(req))
      .rejects
      .toThrow('Test error');
  });
});

describe('getWithdrawals', () => {
  it('throws error if secret is empty', async () => {

  });

  it('throws error if key is empty', async () => {

  });

  it('calls /wapi/v3/withdrawHistory.html with authentication', async () => {

  });

  it('returns /wapi/v3/withdrawHistory.html filtered and sorted', async () => {

  });
});

describe('getDeposits', () => {
  it('throws error if secret is empty', async () => {

  });

  it('throws error if key is empty', async () => {

  });

  it('calls /wapi/v3/depositHistory.html with authentication', async () => {

  });

  it('returns /wapi/v3/depositHistory.html filtered and sorted', async () => {

  });
});

describe('getBalances', () => {
  it('throws error if secret is empty', async () => {

  });

  it('throws error if key is empty', async () => {

  });

  it('calls /api/v3/account with authentication', async () => {

  });

  it('returns balances from /api/v3/account', async () => {

  });
});

describe('clock sync', () => {
  it('syncs with binance server time every 5 minutes', async () => {

  });
});

describe('proxy support', () => {
  it('creates axios instance with proxy params', async () => {

  });
});
