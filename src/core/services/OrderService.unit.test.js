const BigNumber = require('bignumber.js');
const OrderService = require('./OrderService');
const Order = require('../../core/models/Order');

let deps;
let service;

beforeEach(() => {
  deps = {
    orderRepo: {
      add: jest.fn(),
      getFilledOrders: jest.fn(),
      use: jest.fn(),
    },
    portfolioService: {
      incr: jest.fn(),
      decr: jest.fn(),
    },
  };

  service = new OrderService(deps);
});

describe('add', () => {
  let order;

  beforeEach(() => {
    order = new Order({
      traderID: 'trader123',
      sourceID: 'source123',
      exchangeID: 'binance',
      side: 'buy',
      asset: 'BTC',
      quoteAsset: 'USDT',
      time: 1550000000000,
      quantity: 123.12345678,
      price: 1123.12345678,
      fee: {
        asset: 'ABC',
        quantity: 1.12345678,
      },
    });
  });

  it('calls orderRepo add', async () => {
    await service.add(order);

    expect(deps.portfolioService.incr).toHaveBeenCalledWith({
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: order.asset,
      time: order.time,
      quantity: order.quantity,
    });
  });

  it('calls portfolioRepo incr for asset when buy order', async () => {
    order.side = 'buy';
    await service.add(order);

    expect(deps.portfolioService.incr).toHaveBeenCalledWith({
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: order.asset,
      time: order.time,
      quantity: order.quantity,
    });
  });

  it('calls portfolioRepo decr for asset when sell order', async () => {
    order.side = 'sell';
    await service.add(order);

    expect(deps.portfolioService.decr).toHaveBeenCalledWith({
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: order.asset,
      time: order.time,
      quantity: order.quantity,
    });
  });

  it('calls portfolioRepo decr for quote asset when buy order', async () => {
    order.side = 'buy';
    await service.add(order);

    expect(deps.portfolioService.decr).toHaveBeenCalledWith({
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: order.quoteAsset,
      time: order.time,
      quantity: new BigNumber(order.quantity).times(order.price).toNumber(),
    });
  });

  it('calls portfolioRepo incr for quote asset when sell order', async () => {
    order.side = 'sell';
    await service.add(order);

    expect(deps.portfolioService.incr).toHaveBeenCalledWith({
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: order.quoteAsset,
      time: order.time,
      quantity: new BigNumber(order.quantity).times(order.price).toNumber(),
    });
  });

  it('calls portfolioRepo decr for fee asset', async () => {
    await service.add(order);
    expect(deps.portfolioService.decr).toHaveBeenCalledWith({
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: order.fee.asset,
      time: order.time,
      quantity: order.fee.quantity,
    });
  });
});

test('getFilledOrders() should call orderRepo', async () => {
  await service.getFilledOrders({ test: 1 });
  expect(deps.orderRepo.getFilledOrders).toHaveBeenCalledWith({ test: 1 });
});

test('use() should call orderRepo', async () => {
  await service.use({ test: 1 });
  expect(deps.orderRepo.use).toHaveBeenCalledWith({ test: 1 });
});
