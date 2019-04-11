const mockExchangeService = {
  getFilledOrders: jest.fn(),
  getSuccessfulDeposits: jest.fn(),
  getSuccessfulWithdrawals: jest.fn(),
  isRootAsset: jest.fn(),
  getPrice: jest.fn(),
  getBTCValue: jest.fn(),
  findMarketQuoteAsset: jest.fn(),
};

// eslint-disable-next-line prefer-arrow-callback
module.exports = jest.fn().mockImplementation(function () { return mockExchangeService; });
