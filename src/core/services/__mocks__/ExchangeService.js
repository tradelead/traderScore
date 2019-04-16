const sinon = require('sinon');

const mockExchangeService = {
  getFilledOrders: sinon.stub(),
  getSuccessfulDeposits: sinon.stub(),
  getSuccessfulWithdrawals: sinon.stub(),
  isRootAsset: sinon.stub(),
  getPrice: sinon.stub(),
  getBTCValue: sinon.stub(),
  findMarketQuoteAsset: sinon.stub(),
};

// eslint-disable-next-line prefer-arrow-callback
module.exports = jest.fn().mockImplementation(function () { return mockExchangeService; });
