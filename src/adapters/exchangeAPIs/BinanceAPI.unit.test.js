jest.mock('node-binance-api');
jest.mock('axios');

const sinon = require('sinon');
const axiosMock = require('axios');
const BinanceAPI = require('./BinanceAPI');
const exchangeInfoResponse = require('./binanceExchangeInfoResponse');
const binanceKlineResponse = require('./binanceKlineResponse');

const axios = { get: sinon.stub() };
axiosMock.create.returns(axios);

const binanceAPI = new BinanceAPI({ rootAssets: ['USDT', 'USDC', 'TUSD', 'PAX', 'USDS'] });

describe('isRootAsset', () => {
  it('returns true when asset is in rootAssets array', async () => {
    axios.get
      .withArgs('https://api.binance.com/api/v1/exchangeInfo')
      .resolves({ data: exchangeInfoResponse });

    expect(await binanceAPI.isRootAsset('USDT')).toBe(true);
    expect(await binanceAPI.isRootAsset('USDC')).toBe(true);
    expect(await binanceAPI.isRootAsset('TUSD')).toBe(true);
    expect(await binanceAPI.isRootAsset('PAX')).toBe(true);
    expect(await binanceAPI.isRootAsset('USDS')).toBe(true);
  });

  it('returns false when is not in rootAssets array', async () => {
    axios.get
      .withArgs('https://api.binance.com/api/v1/exchangeInfo')
      .resolves({ data: exchangeInfoResponse });

    expect(await binanceAPI.isRootAsset('BTC')).toBe(false);
  });
});

describe('getPrice', () => {
  it('returns close price from close minute candle', async () => {
    axios.get
      .withArgs('https://api.binance.com/api/v1/klines?symbol=BTCUSDT&interval=1m&startTime=1515780672000&limit=1')
      .resolves({ data: binanceKlineResponse });

    expect(await binanceAPI.getPrice({ asset: 'BTC', quoteAsset: 'USDT', time: 1515780672000 }))
      .toEqual(13414.01);
  });
});

describe('getMarkets', () => {
  it('returns asset and quoteAsset of all binance markets', async () => {
    axios.get
      .withArgs('https://api.binance.com/api/v1/exchangeInfo')
      .resolves({ data: exchangeInfoResponse });

    const markets = await binanceAPI.getMarkets();
    expect(markets[0]).toEqual({ quoteAsset: 'BTC', asset: 'ETH' });
  });
});
