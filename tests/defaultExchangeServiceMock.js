const Order = require('../src/core/models/Order');
const Deposit = require('../src/core/models/Deposit');
const Withdrawal = require('../src/core/models/Withdrawal');

const ExchangeService = require('../src/core/services/ExchangeService');

module.exports = () => {
  const sampleTime = 1555377480513;
  const defaultOrder = new Order({
    traderID: 'trader1',
    sourceID: 'order1',
    exchangeID: 'binance',
    side: 'buy',
    asset: 'ETH',
    quoteAsset: 'USDT',
    time: sampleTime - (24 * 60 * 60 * 1000),
    quantity: 12.345,
    price: 123.4567,
    fee: {
      quantity: 27,
      asset: 'USDT',
    },
  });

  const defaultDeposit = new Deposit({
    traderID: 'trader1',
    sourceID: 'transfer1',
    exchangeID: 'binance',
    asset: 'USDT',
    time: sampleTime - (2 * 24 * 60 * 60 * 1000),
    quantity: 1551.0729615,
  });

  const defaultWithdrawal = new Withdrawal({
    traderID: 'trader1',
    sourceID: 'transfer2',
    exchangeID: 'binance',
    asset: 'ETH',
    time: sampleTime,
    quantity: 12.345,
  });

  const orders = [defaultOrder];
  const deposits = [defaultDeposit];
  const withdrawals = [defaultWithdrawal];

  const mockExchangeService = new ExchangeService({});

  const oncePerExchange = (onceValue, defaultValue) => {
    const cache = {};
    return async ({ exchangeID }) => {
      if (cache[exchangeID]) {
        return defaultValue;
      }

      cache[exchangeID] = true;
      return onceValue.map(item => Object.assign({}, item, { exchangeID }));
    };
  };

  mockExchangeService.getFilledOrders.mockImplementation(oncePerExchange(orders, []));
  mockExchangeService.getSuccessfulDeposits.mockImplementation(oncePerExchange(deposits, []));
  mockExchangeService.getSuccessfulWithdrawals.mockImplementation(oncePerExchange(withdrawals, []));

  mockExchangeService.isRootAsset.mockImplementation(async ({ symbol }) => symbol === 'USDT');

  const priceDB = {};

  priceDB['ETH-USDT'] = {};
  priceDB['ETH-USDT'][defaultDeposit.time] = 100;
  priceDB['ETH-USDT'][defaultOrder.time] = 150;
  priceDB['ETH-USDT'][defaultWithdrawal.time] = 225;

  mockExchangeService.getPrice.mockImplementation(async ({ asset, quoteAsset, time }) => {
    const pair = `${asset}-${quoteAsset}`;
    if (priceDB && priceDB[pair] && priceDB[pair][time]) {
      return priceDB[pair][time];
    }

    return 1;
  });

  const btcValueDB = {};

  btcValueDB['ETH-BTC'] = {};
  btcValueDB['ETH-BTC'][defaultOrder.time] = 0.3;
  btcValueDB['ETH-BTC'][defaultWithdrawal.time] = 0.3;

  btcValueDB['USDT-USDT'] = {};
  btcValueDB['USDT-USDT'][defaultOrder.time] = 0.3;

  btcValueDB['ETH-USDT'] = {};
  btcValueDB['ETH-USDT'][defaultOrder.time] = 0.3;
  btcValueDB['ETH-USDT'][defaultWithdrawal.time] = 0.45;

  mockExchangeService.getBTCValue.mockImplementation(async ({ asset, quoteAsset, time }) => {
    const pair = `${asset}-${quoteAsset}`;
    if (btcValueDB && btcValueDB[pair] && btcValueDB[pair][time]) {
      return btcValueDB[pair][time];
    }

    return 1;
  });

  mockExchangeService.findMarketQuoteAsset
    .mockImplementation(async ({ asset, preferredQuoteAsset }) => {
      if (asset === 'USDT') {
        return 'USDT';
      }
      return preferredQuoteAsset;
    });

  return {
    orders,
    deposits,
    withdrawals,
  };
};
