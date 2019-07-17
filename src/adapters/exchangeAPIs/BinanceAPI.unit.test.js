jest.mock('node-binance-api');
jest.mock('axios');

const sinon = require('sinon');
const axiosMock = require('axios');
const BinanceAPI = require('./BinanceAPI');
const exchangeInfoResponse = require('./binanceExchangeInfoResponse');
const binanceKlineResponse = require('./binanceKlineResponse');

const origTimeout = setTimeout;
const sleep = ms => new Promise(resolve => origTimeout(resolve, ms));

let clock = sinon.useFakeTimers(234);

let binanceAPI;

const axios = { get: sinon.stub() };
axiosMock.create.returns(axios);

beforeEach(() => {
  clock = sinon.useFakeTimers(234);

  axios.get.reset();

  axios.get
    .withArgs('https://api.binance.com/api/v1/time')
    .resolves({ data: { serverTime: 235 } });

  binanceAPI = new BinanceAPI({ rootAssets: ['USDT', 'USDC', 'TUSD', 'PAX', 'USDS'] });
});

afterAll(() => {
  clock.restore();
});

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
      time: 1515780672000,
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
        asset: 'ETH',
      });
  });
});

describe('getFilledOrders', () => {
  let req;
  let markets;
  let getMarketsMock;

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
        quoteAsset: 'USDT',
      },
      {
        asset: 'ETH',
        quoteAsset: 'BTC',
      },
      {
        asset: 'OMG',
        quoteAsset: 'ETH',
      },
    ];
    getMarketsMock = sinon.stub(binanceAPI, 'getMarkets')
      .resolves(markets);

    axios.get
      .withArgs('https://api.binance.com/api/v1/time')
      .resolves({ data: { serverTime: 235 } });
  });

  afterEach(() => {
    getMarketsMock.restore();
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

  it('calls /api/v3/allOrders for each symbol', async () => {
    const requests = [
      'https://api.binance.com/api/v3/allOrders?symbol=BTCUSDT&startTime=0&limit=1000&timestamp=1233&recvWindow=5170000&signature=a011554ff6ae298cfe0f87729ddd3ef1e7aed45db6f2b378ff304bff695a0e3a',
      'https://api.binance.com/api/v3/allOrders?symbol=BTCUSDT&startTime=234&limit=1000&timestamp=1233&recvWindow=5170000&signature=eb0621c53ddb881e9fdecb7145cfc13d7c242044d180abb6ba5780c2333838a1',
      'https://api.binance.com/api/v3/allOrders?symbol=ETHBTC&startTime=0&limit=1000&timestamp=1233&recvWindow=5170000&signature=56331f9a2efba48f2804eaecf784d316e7d3653defd095c0d2a8a77365ae363d',
      'https://api.binance.com/api/v3/allOrders?symbol=OMGETH&startTime=0&limit=1000&timestamp=1233&recvWindow=5170000&signature=905b69e63b25ef332311d03181db926756c21ca0e1d8063158ba7cd73e8c3605',
    ];

    const btcOrdersResponse = [];
    for (let i = 0; i < 1000; i += 1) {
      btcOrdersResponse.push({
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
      });
    }

    axios.get.withArgs(requests[0]).resolves({ data: btcOrdersResponse });

    const ordersProm = binanceAPI.getFilledOrders(req);
    await sleep(10);
    clock.tick(1000);
    await sleep(10);
    clock.tick(1000);
    await ordersProm;

    requests.forEach(request => sinon.assert.calledWith(axios.get, request, {
      headers: {
        'X-MBX-APIKEY': req.keys.key,
      },
    }));
  });

  it('calls /api/v3/myTrades for each symbol within returned orders', async () => {
    const requests = [
      'https://api.binance.com/api/v3/allOrders?symbol=BTCUSDT&startTime=0&limit=1000&timestamp=1233&recvWindow=5170000&signature=a011554ff6ae298cfe0f87729ddd3ef1e7aed45db6f2b378ff304bff695a0e3a',
      'https://api.binance.com/api/v3/allOrders?symbol=ETHBTC&startTime=0&limit=1000&timestamp=1233&recvWindow=5170000&signature=56331f9a2efba48f2804eaecf784d316e7d3653defd095c0d2a8a77365ae363d',
    ];

    const ordersRsp = [
      {
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
      },
    ];
    axios.get.withArgs(requests[0])
      .resolves({ data: ordersRsp });

    axios.get.withArgs(requests[1])
      .resolves({
        data: [Object.assign({}, ordersRsp[0], { symbol: 'ETHBTC' })],
      });

    const traderequests = [
      'https://api.binance.com/api/v3/myTrades?symbol=BTCUSDT&startTime=0&limit=1000&timestamp=2233&recvWindow=5170000&signature=4a912fd816a652db24ff0bbf7c71240b406cba9af6df0fbc8164980c8d85f3d8',
      'https://api.binance.com/api/v3/myTrades?symbol=BTCUSDT&startTime=234&limit=1000&timestamp=2233&recvWindow=5170000&signature=32512d7cf1ec22553d204733b5573e83b9aa4bcb681f30937ffe470c0c811a63',
      'https://api.binance.com/api/v3/myTrades?symbol=ETHBTC&startTime=0&limit=1000&timestamp=2233&recvWindow=5170000&signature=0411b4c8616f4efec51f23e741d33cb54b64657362229aaee811a954045406e3',
    ];

    const btcTradesResponse = [];
    for (let i = 0; i < 1000; i += 1) {
      btcTradesResponse.push({
        symbol: 'BTCUSDT',
        id: 148345192,
        orderId: 487703152,
        price: '11885.93000000',
        qty: '0.00170200',
        quoteQty: '20.22985286',
        commission: '0.02022985',
        commissionAsset: 'USDT',
        time: 234,
        isBuyer: false,
        isMaker: true,
        isBestMatch: true,
      });
    }

    axios.get.withArgs(traderequests[0])
      .resolves({ data: btcTradesResponse });

    const ordersProm = binanceAPI.getFilledOrders(req);
    await sleep(10);
    clock.tick(1000);
    await sleep(10);
    clock.tick(1000);
    await ordersProm;

    traderequests.forEach(request => sinon.assert.calledWith(axios.get, request, {
      headers: {
        'X-MBX-APIKEY': req.keys.key,
      },
    }));
  });

  it('returns orders formatted, filtered, sorted', async () => {
    const requests = [
      'https://api.binance.com/api/v3/allOrders?symbol=BTCUSDT&startTime=0&limit=1000&timestamp=1233&recvWindow=5170000&signature=a011554ff6ae298cfe0f87729ddd3ef1e7aed45db6f2b378ff304bff695a0e3a',
      'https://api.binance.com/api/v3/allOrders?symbol=ETHBTC&startTime=0&limit=1000&timestamp=1233&recvWindow=5170000&signature=56331f9a2efba48f2804eaecf784d316e7d3653defd095c0d2a8a77365ae363d',
      'https://api.binance.com/api/v3/allOrders?symbol=OMGETH&startTime=0&limit=1000&timestamp=1233&recvWindow=5170000&signature=905b69e63b25ef332311d03181db926756c21ca0e1d8063158ba7cd73e8c3605',
    ];

    const defaultOrderResponse = {
      symbol: 'BTCUSDT',
      orderId: 1,
      clientOrderId: 'web_a85878ff00b4463aba9cc717736d41ea',
      price: '11885.93000000',
      origQty: '0.00170200',
      executedQty: '0.00170200',
      cummulativeQuoteQty: '20.22985286',
      status: 'FILLED',
      timeInForce: 'GTC',
      type: 'LIMIT',
      side: 'SELL',
      stopPrice: '0.00000000',
      icebergQty: '0.00000000',
      time: 234,
      updateTime: 1562197142610,
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
    axios.get.withArgs(requests[2])
      .resolves({
        data: [
          Object.assign({}, defaultOrderResponse, {
            symbol: 'OMGETH',
            orderId: 2,
            time: 345,
            type: 'MARKET',
            price: '0.00000000',
            side: 'BUY',
          }),
        ],
      });

    const traderequests = [
      'https://api.binance.com/api/v3/myTrades?symbol=BTCUSDT&startTime=0&limit=1000&timestamp=2233&recvWindow=5170000&signature=4a912fd816a652db24ff0bbf7c71240b406cba9af6df0fbc8164980c8d85f3d8',
      'https://api.binance.com/api/v3/myTrades?symbol=ETHBTC&startTime=0&limit=1000&timestamp=2233&recvWindow=5170000&signature=0411b4c8616f4efec51f23e741d33cb54b64657362229aaee811a954045406e3',
      'https://api.binance.com/api/v3/myTrades?symbol=OMGETH&startTime=0&limit=1000&timestamp=2233&recvWindow=5170000&signature=2a7aba5861bbf29c05cac1d5bfdfcfd86056d3d0bc23648e52136d9ff3491a3d',
    ];

    const defaultTradeRsp = {
      symbol: 'BTCUSDT',
      id: 148345192,
      orderId: 1,
      price: '11885.93000000',
      qty: '0.00170200',
      quoteQty: '20.22985286',
      commission: '0.02022985',
      commissionAsset: 'USDT',
      time: 234,
      isBuyer: false,
      isMaker: true,
      isBestMatch: true,
    };
    axios.get.withArgs(traderequests[0])
      .resolves({ data: [defaultTradeRsp] });

    axios.get.withArgs(traderequests[1])
      .resolves({
        data: [
          Object.assign({}, defaultTradeRsp, {
            symbol: 'ETHBTC',
            orderId: 3,
            time: 456,
            commission: '0.00001200',
            commissionAsset: 'BTC',
          }),
        ],
      });

    axios.get.withArgs(traderequests[2])
      .resolves({
        data: [
          Object.assign({}, defaultTradeRsp, {
            symbol: 'OMGETH',
            orderId: 2,
            time: 345,
            commission: '0.00001200',
            commissionAsset: 'OMG',
          }),
          Object.assign({}, defaultTradeRsp, {
            symbol: 'OMGETH',
            orderId: 2,
            time: 345,
            commission: '0.00001200',
            commissionAsset: 'OMG',
          }),
        ],
      });

    const ordersProm = binanceAPI.getFilledOrders(req);
    await sleep(10);
    clock.tick(1000);
    await sleep(10);
    clock.tick(1000);
    const orders = await ordersProm;

    expect(orders)
      .toEqual([
        {
          ID: null,
          traderID: req.traderID,
          sourceID: 1,
          exchangeID: 'binance',
          side: 'sell',
          asset: 'BTC',
          quoteAsset: 'USDT',
          time: 234,
          quantity: 0.00170200,
          price: 11885.93,
          fee: {
            quantity: 0.02022985,
            asset: 'USDT',
          },
        },
        {
          ID: null,
          traderID: req.traderID,
          sourceID: 2,
          exchangeID: 'binance',
          side: 'buy',
          asset: 'OMG',
          quoteAsset: 'ETH',
          time: 345,
          quantity: 0.00170200,
          price: 11885.93,
          fee: {
            quantity: 0.00002400,
            asset: 'OMG',
          },
        },
        {
          ID: null,
          traderID: req.traderID,
          sourceID: 3,
          exchangeID: 'binance',
          side: 'sell',
          asset: 'ETH',
          quoteAsset: 'BTC',
          time: 456,
          quantity: 0.00170200,
          price: 11885.93,
          fee: {
            quantity: 0.00001200,
            asset: 'BTC',
          },
        },
      ]);
  });

  it('throws error if one request fails', async () => {
    const err = new Error('Test error');
    axios.get
      .withArgs('https://api.binance.com/api/v3/allOrders?symbol=BTCUSDT&startTime=0&limit=1000&timestamp=1233&recvWindow=5170000&signature=a011554ff6ae298cfe0f87729ddd3ef1e7aed45db6f2b378ff304bff695a0e3a')
      .rejects(err);

    const ordersProm = binanceAPI.getFilledOrders(req);
    await sleep(10);
    clock.tick(1000);

    await expect(ordersProm)
      .rejects
      .toThrow('Test error');
  });
});

describe('getWithdrawals', () => {
  let req;

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
      status: 'success',
    };
  });

  it('throws error if key is empty', async () => {
    delete req.keys.key;
    await expect(binanceAPI.getWithdrawals(req))
      .rejects
      .toThrow('Key is required.');
  });

  it('throws error if secret is empty', async () => {
    delete req.keys.secret;
    await expect(binanceAPI.getWithdrawals(req))
      .rejects
      .toThrow('Secret is required.');
  });

  it('formats and returns withdrawals from /wapi/v3/withdrawHistory.html', async () => {
    const url = 'https://api.binance.com/wapi/v3/withdrawHistory.html?startTime=123&status=6&timestamp=233&recvWindow=5170000&signature=dbf667ba353ef54e899d8337f9bf9c09ba45ddc96f2522e23fc01b57c8e5df2e';
    axios.get
      .withArgs(url, { headers: { 'X-MBX-APIKEY': req.keys.key } })
      .resolves({
        data: {
          withdrawList: [
            {
              id: '7213fea8e94b4a5593d507237e5a555b',
              amount: 1,
              address: '0x6915f16f8791d0a1cc2bf47c13a6b2a92000504b',
              asset: 'ETH',
              txId: '0xdf33b22bdb2b28b1f75ccd201a4a4m6e7g83jy5fc5d5a9d1340961598cfcb0a1',
              applyTime: 1508198532000,
              status: 6,
            },
            {
              id: '7213fea8e94b4a5534ggsd237e5a555b',
              amount: 1000,
              address: '463tWEBn5XZJSxLU34r6g7h8jtxuNcDbjLSjkn3XAXHCbLrTTErJrBWYgHJQyrCwkNgYvyV3z8zctJLPCZy24jvb3NiTcTJ',
              addressTag: '342341222',
              txId: 'b3c6219639c8ae3f9cf010cdc24fw7f7yt8j1e063f9b4bd1a05cb44c4b6e2509',
              asset: 'XMR',
              applyTime: 1508198532000,
              status: 6,
            },
          ],
          success: true,
        },
      });

    const withdrawals = await binanceAPI.getWithdrawals(req);

    expect(withdrawals).toEqual([
      {
        ID: null,
        traderID: 'trader123',
        sourceID: '7213fea8e94b4a5593d507237e5a555b',
        exchangeID: 'binance',
        asset: 'ETH',
        time: 1508198532000,
        quantity: 1,
      },
      {
        ID: null,
        traderID: 'trader123',
        sourceID: '7213fea8e94b4a5534ggsd237e5a555b',
        exchangeID: 'binance',
        asset: 'XMR',
        time: 1508198532000,
        quantity: 1000,
      },
    ]);
  });
});

describe('getDeposits', () => {
  let req;

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
      status: 'success',
    };
  });

  it('throws error if key is empty', async () => {
    delete req.keys.key;
    await expect(binanceAPI.getDeposits(req))
      .rejects
      .toThrow('Key is required.');
  });

  it('throws error if secret is empty', async () => {
    delete req.keys.secret;
    await expect(binanceAPI.getDeposits(req))
      .rejects
      .toThrow('Secret is required.');
  });

  it('formats and returns deposits from /wapi/v3/depositHistory.html', async () => {
    const url = 'https://api.binance.com/wapi/v3/depositHistory.html?startTime=123&status=1&timestamp=233&recvWindow=5170000&signature=c49ceee2e475f4a9d651b3f3635f67c19a0adc229c9606070bf9b9aaf8611e82';
    axios.get
      .withArgs(url, { headers: { 'X-MBX-APIKEY': req.keys.key } })
      .resolves({
        data: {
          depositList: [
            {
              insertTime: 1508198532000,
              amount: 0.04670582,
              asset: 'ETH',
              address: '0x6915f16f8791d0a1cc2bf47c13a6b2a92000504b',
              txId: '0xdf33b22bdb2b28b1f75ccd201a4a4m6e7g83jy5fc5d5a9d1340961598cfcb0a1',
              status: 1,
            },
            {
              insertTime: 1508298532000,
              amount: 1000,
              asset: 'XMR',
              address: '463tWEBn5XZJSxLU34r6g7h8jtxuNcDbjLSjkn3XAXHCbLrTTErJrBWYgHJQyrCwkNgYvyV3z8zctJLPCZy24jvb3NiTcTJ',
              addressTag: '342341222',
              txId: 'b3c6219639c8ae3f9cf010cdc24fw7f7yt8j1e063f9b4bd1a05cb44c4b6e2509',
              status: 1,
            },
          ],
          success: true,
        },
      });

    const deposits = await binanceAPI.getDeposits(req);

    expect(deposits).toEqual([
      {
        ID: null,
        traderID: 'trader123',
        sourceID: '0xdf33b22bdb2b28b1f75ccd201a4a4m6e7g83jy5fc5d5a9d1340961598cfcb0a1',
        exchangeID: 'binance',
        asset: 'ETH',
        time: 1508198532000,
        quantity: 0.04670582,
      },
      {
        ID: null,
        traderID: 'trader123',
        sourceID: 'b3c6219639c8ae3f9cf010cdc24fw7f7yt8j1e063f9b4bd1a05cb44c4b6e2509',
        exchangeID: 'binance',
        asset: 'XMR',
        time: 1508298532000,
        quantity: 1000,
      },
    ]);
  });
});

describe('getBalances', () => {
  let req;

  beforeEach(() => {
    req = {
      traderID: 'trader123',
      keys: {
        key: 'key123',
        secret: 'secret123',
      },
    };
  });

  it('throws error if key is empty', async () => {
    delete req.keys.key;
    await expect(binanceAPI.getBalances(req))
      .rejects
      .toThrow('Key is required.');
  });

  it('throws error if secret is empty', async () => {
    delete req.keys.secret;
    await expect(binanceAPI.getBalances(req))
      .rejects
      .toThrow('Secret is required.');
  });

  it('formats and returns balances from /api/v3/account', async () => {
    const url = 'https://api.binance.com/api/v3/account?timestamp=233&recvWindow=5170000&signature=f08121bcb71951714565b04c14a4d3843511be5a7558cfc65308191f067746ed';
    axios.get
      .withArgs(url, { headers: { 'X-MBX-APIKEY': req.keys.key } })
      .resolves({
        data: {
          makerCommission: 15,
          takerCommission: 15,
          buyerCommission: 0,
          sellerCommission: 0,
          canTrade: true,
          canWithdraw: true,
          canDeposit: true,
          updateTime: 123456789,
          balances: [
            {
              asset: 'BTC',
              free: '4723846.89208129',
              locked: '1.00000000',
            },
            {
              asset: 'LTC',
              free: '4763368.68006011',
              locked: '1.00000000',
            },
          ],
        },
      });

    const deposits = await binanceAPI.getBalances(req);

    expect(deposits).toEqual([
      {
        asset: 'BTC',
        quantity: 4723847.89208129,
      },
      {
        asset: 'LTC',
        quantity: 4763369.68006011,
      },
    ]);
  });
});

describe('clock sync', () => {
  it('syncs with binance server time every 5 minutes', async () => {
    expect(binanceAPI.serverOffset).toEqual(1);

    axios.get
      .withArgs('https://api.binance.com/api/v1/time')
      .resolves({ data: { serverTime: 236 + (5 * 60000) } });

    clock.tick(5 * 60000);

    await sleep(100);

    expect(binanceAPI.serverOffset).toEqual(2);
  });
});

describe('proxy support', () => {
  it('creates axios instance with proxy params', async () => {
    const proxy = { test: 1 };

    binanceAPI = new BinanceAPI({ proxy, rootAssets: ['USDT', 'USDC', 'TUSD', 'PAX', 'USDS'] });

    sinon.assert.calledWith(axiosMock.create, sinon.match({
      proxy,
    }));
  });
});
