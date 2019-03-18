const sinon = require('sinon');
const ExchangeService = require('./ExchangeService');

let deps = {};
const exchangeAPI = sinon.stub();

let service;

beforeEach(() => {
  deps = {
    traderPortfolioRepo: {
      portfolioSnapshot: sinon.stub(),
    },
    exchangeAPIFactory: {
      get: () => exchangeAPI,
    },
  };

  service = new ExchangeService(deps);
});

describe('getFilledOrders', () => {
  it('', async () => {

  });
});

describe('getDeposits', () => {

});

describe('getWithdrawals', () => {

});

describe('getPrice', () => {

});

describe('getBTCValue', () => {

});

describe('findMarketQuoteAsset', () => {

});
