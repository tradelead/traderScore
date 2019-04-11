const app = require('../../app.bootstrap');

const Order = require('../../src/core/models/Order');
const Deposit = require('../../src/core/models/Deposit');
const Withdrawal = require('../../src/core/models/Withdrawal');

const ExchangeService = require('../../src/core/services/ExchangeService');

jest.mock('../../src/core/services/ExchangeService');

let orders;
let deposits;
let withdrawals;

const defaultOrder = new Order({
  traderID: 'trader123',
  sourceID: 'order1',
  exchangeID: 'exchange123',
  side: 'buy',
  asset: 'ETH',
  quoteAsset: 'USD',
  time: Date.now(),
  quantity: 12.345,
  price: 123.4567,
});

const defaultDeposit = new Deposit({
  traderID: 'trader123',
  sourceID: 'source123',
  exchangeID: 'exchange123',
  asset: 'ETH',
  time: Date.now(),
  quantity: 12.345,
});

const defaultWithdrawal = new Withdrawal({
  traderID: 'trader123',
  sourceID: 'source123',
  exchangeID: 'exchange123',
  asset: 'ETH',
  time: Date.now(),
  quantity: 12.345,
});

beforeEach(async () => {
  orders = [defaultOrder];
  deposits = [defaultDeposit];
  withdrawals = [defaultWithdrawal];

  const mockExchangeService = new ExchangeService({});

  mockExchangeService.getFilledOrders.mockImplementation(async () => []);
  mockExchangeService.getFilledOrders.mockImplementationOnce(async () => orders);

  mockExchangeService.getSuccessfulDeposits.mockImplementation(async () => []);
  mockExchangeService.getSuccessfulDeposits.mockImplementationOnce(async () => deposits);

  mockExchangeService.getSuccessfulWithdrawals.mockImplementation(async () => []);
  mockExchangeService.getSuccessfulWithdrawals.mockImplementationOnce(async () => withdrawals);

  mockExchangeService.isRootAsset.mockImplementation(async ({ symbol }) => symbol === 'USDT');

  mockExchangeService.findMarketQuoteAsset
    .mockImplementation(async ({ asset, preferredQuoteAsset }) => {
      if (asset === 'USDT') {
        return 'USDT';
      }
      return preferredQuoteAsset;
    });

  const exchangeService = new ExchangeService({});
  console.log(await exchangeService.getFilledOrders(), await exchangeService.getFilledOrders());
});

test('trader\'s first exchange ingress', async () => {
  await app.useCases.ingressTraderExchange({
    traderID: 'trader1',
    exchangeID: 'binance',
  });

  console.log(await app.useCases.getTraderScoreHistory({ traderID: 'trader1' }));
});
