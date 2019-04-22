const ExchangeService = require('./ExchangeServiceDefault');

const exchangeService = ExchangeService();

test('it works', async () => {
  expect(await exchangeService.getFilledOrders({ traderID: 'trader1', exchangeID: 'binance' })).toHaveLength(1);
  expect(await exchangeService.getFilledOrders({ traderID: 'trader1', exchangeID: 'binance' })).toHaveLength(0);

  expect(await exchangeService.getFilledOrders({ traderID: 'trader2', exchangeID: 'bittrex' })).toHaveLength(1);
  expect(await exchangeService.getFilledOrders({ traderID: 'trader2', exchangeID: 'bitfinex' })).toHaveLength(1);

  expect(await exchangeService.getSuccessfulDeposits({ traderID: 'trader1', exchangeID: 'binance' })).toHaveLength(1);
  expect(await exchangeService.getSuccessfulDeposits({ traderID: 'trader1', exchangeID: 'binance' })).toHaveLength(0);

  expect(await exchangeService.getSuccessfulDeposits({ traderID: 'trader2', exchangeID: 'bittrex' })).toHaveLength(1);
  expect(await exchangeService.getSuccessfulDeposits({ traderID: 'trader2', exchangeID: 'bitfinex' })).toHaveLength(1);

  expect(await exchangeService.getSuccessfulWithdrawals({ traderID: 'trader1', exchangeID: 'binance' })).toHaveLength(1);
  expect(await exchangeService.getSuccessfulWithdrawals({ traderID: 'trader1', exchangeID: 'binance' })).toHaveLength(0);

  expect(await exchangeService.getSuccessfulWithdrawals({ traderID: 'trader2', exchangeID: 'bittrex' })).toHaveLength(1);
  expect(await exchangeService.getSuccessfulWithdrawals({ traderID: 'trader2', exchangeID: 'bitfinex' })).toHaveLength(1);
});