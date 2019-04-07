const knexFactory = require('knex');
const BigNumber = require('bignumber.js');
const knexConfig = require('./knexfile');
const msToMySQLFormat = require('./msToMySQLFormat');
const OrderRepo = require('./OrderRepo');
const Order = require('../../core/models/Order');

const env = (process.env.NODE_ENV ? process.env.NODE_ENV : 'development');
const knex = knexFactory(knexConfig[env]);

const portfolioRepo = {
  incr: jest.fn(),
  decr: jest.fn(),
};

const portfolioRepoFactory = {
  create: () => portfolioRepo,
};
const orderRepo = new OrderRepo({ knexConn: knex, portfolioRepoFactory });
const tableName = 'orders';

afterAll(async () => {
  await knex(tableName).truncate();
  await knex.destroy();
});

describe('add', () => {
  let order;
  let newOrderID;

  beforeEach(async () => {
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
        quantity: 1.12345678,
        asset: 'USDT',
      },
    });

    newOrderID = await orderRepo.add(order);
  });

  afterEach(async () => {
    await knex(tableName).truncate();
  });

  it('saves traderID', async () => {
    const [savedOrder] = await knex
      .select('traderID')
      .from(tableName)
      .where({ ID: newOrderID });
    expect(savedOrder.traderID).toBe(order.traderID);
  });

  it('saves sourceID', async () => {
    const [savedOrder] = await knex
      .select('sourceID')
      .from(tableName)
      .where({ ID: newOrderID });
    expect(savedOrder.sourceID).toBe(order.sourceID);
  });

  it('saves exchangeID', async () => {
    const [savedOrder] = await knex
      .select('exchangeID')
      .from(tableName)
      .where({ ID: newOrderID });
    expect(savedOrder.exchangeID).toBe(order.exchangeID);
  });

  it('saves asset', async () => {
    const [savedOrder] = await knex
      .select('asset')
      .from(tableName)
      .where({ ID: newOrderID });
    expect(savedOrder.asset).toBe(order.asset);
  });

  it('saves quoteAsset', async () => {
    const [savedOrder] = await knex
      .select('quoteAsset')
      .from(tableName)
      .where({ ID: newOrderID });
    expect(savedOrder.quoteAsset).toBe(order.quoteAsset);
  });

  it('saves time', async () => {
    const [savedOrder] = await knex
      .select('time')
      .from(tableName)
      .where({ ID: newOrderID });
    const date = new Date(savedOrder.time);
    expect(date.getTime()).toBe(order.time);
  });

  it('saves price', async () => {
    const [savedOrder] = await knex
      .select('price')
      .from(tableName)
      .where({ ID: newOrderID });
    expect(savedOrder.price).toBe(order.price);
  });

  it('saves quantity', async () => {
    const [savedOrder] = await knex
      .select('quantity')
      .from(tableName)
      .where({ ID: newOrderID });
    expect(savedOrder.quantity).toBe(order.quantity);
  });

  it('saves quantityUnused with value of quantity', async () => {
    const [savedOrder] = await knex
      .select('quantityUnused')
      .from(tableName)
      .where({ ID: newOrderID });
    expect(savedOrder.quantityUnused).toBe(order.quantity);
  });

  it('calls portfolioRepo incr for asset when buy order', async () => {
    await knex(tableName).truncate();
    portfolioRepo.incr.mockReset();
    order.side = 'buy';
    await orderRepo.add(order);

    expect(portfolioRepo.incr).toHaveBeenCalledWith({
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: order.asset,
      time: order.time,
      quantity: order.quantity,
    });
  });

  it('calls portfolioRepo decr for asset when sell order', async () => {
    await knex(tableName).truncate();
    portfolioRepo.decr.mockReset();
    order.side = 'sell';
    await orderRepo.add(order);

    expect(portfolioRepo.decr).toHaveBeenCalledWith({
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: order.asset,
      time: order.time,
      quantity: order.quantity,
    });
  });

  it('calls portfolioRepo decr for quote asset when buy order', async () => {
    await knex(tableName).truncate();
    portfolioRepo.decr.mockReset();
    order.side = 'buy';
    await orderRepo.add(order);

    expect(portfolioRepo.decr).toHaveBeenCalledWith({
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: order.quoteAsset,
      time: order.time,
      quantity: new BigNumber(order.quantity).times(order.price).toNumber(),
    });
  });

  it('calls portfolioRepo incr for quote asset when sell order', async () => {
    await knex(tableName).truncate();
    portfolioRepo.incr.mockReset();
    order.side = 'sell';
    await orderRepo.add(order);

    expect(portfolioRepo.incr).toHaveBeenCalledWith({
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: order.quoteAsset,
      time: order.time,
      quantity: new BigNumber(order.quantity).times(order.price).toNumber(),
    });
  });

  it('calls portfolioRepo decr for fee asset', async () => {
    expect(portfolioRepo.decr).toHaveBeenCalledWith({
      traderID: order.traderID,
      exchangeID: order.exchangeID,
      asset: order.fee.asset,
      time: order.time,
      quantity: order.fee.quantity,
    });
  });

  it('prevents duplicates of trader + exchange + source', async () => {
    const similarOrder = Object.assign({}, order, {
      asset: 'ETH',
      time: 15560000000000,
      quantity: 234.12345678,
    });

    return expect(orderRepo.add(similarOrder)).rejects.toThrow();
  });
});

describe('getFilledOrders', () => {
  let ordersInDB;

  beforeAll(async () => {
    ordersInDB = [
      {
        traderID: 'trader1',
        sourceID: 'source1',
        exchangeID: 'binance',
        side: 'buy',
        asset: 'BTC',
        quoteAsset: 'USDT',
        time: msToMySQLFormat(1000),
        quantity: 123.12345678,
        quantityUnused: 0,
        price: 1123.12345678,
      },
      {
        traderID: 'trader1',
        sourceID: 'source2',
        exchangeID: 'binance',
        side: 'buy',
        asset: 'BTC',
        quoteAsset: 'USDT',
        time: msToMySQLFormat(2000),
        quantity: 123.12345678,
        quantityUnused: 0,
        price: 1123.12345678,
      },
      {
        traderID: 'trader1',
        sourceID: 'source3',
        exchangeID: 'bittrex',
        side: 'buy',
        asset: 'ETH',
        quoteAsset: 'USDT',
        time: msToMySQLFormat(3000),
        quantity: 123.12345678,
        quantityUnused: 1,
        price: 1123.12345678,
      },
      {
        traderID: 'trader2',
        sourceID: 'source4',
        exchangeID: 'binance',
        side: 'buy',
        asset: 'BTC',
        quoteAsset: 'USDT',
        time: msToMySQLFormat(4000),
        quantity: 123.12345678,
        quantityUnused: 0,
        price: 1123.12345678,
      },
      {
        traderID: 'trader2',
        sourceID: 'source5',
        exchangeID: 'binance',
        side: 'buy',
        asset: 'BTC',
        quoteAsset: 'USDT',
        time: msToMySQLFormat(4000),
        quantity: 123.12345678,
        quantityUnused: 0,
        price: 1123.12345678,
      },
    ];

    // seed for tests
    await knex.insert(ordersInDB).into(tableName);
  });

  afterAll(async () => {
    await knex(tableName).truncate();
  });

  test('traderID filter', async () => {
    const orders = await orderRepo.getFilledOrders({ traderID: 'trader1' });

    const sourceIDs = orders.map(order => order.sourceID);
    expect(sourceIDs).toHaveLength(3);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source1', 'source2', 'source3']));
  });

  test('traderID & exchangeID filters', async () => {
    const orders = await orderRepo.getFilledOrders({ traderID: 'trader1', exchangeID: 'bittrex' });

    const sourceIDs = orders.map(order => order.sourceID);
    expect(sourceIDs).toHaveLength(1);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source3']));
  });

  test('traderID & asset filters', async () => {
    const orders = await orderRepo.getFilledOrders({ traderID: 'trader1', asset: 'BTC' });

    const sourceIDs = orders.map(order => order.sourceID);
    expect(sourceIDs).toHaveLength(2);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source1', 'source2']));
  });

  test('limit param', async () => {
    const orders = await orderRepo.getFilledOrders({ limit: 2 });

    const sourceIDs = orders.map(order => order.sourceID);
    expect(sourceIDs).toHaveLength(2);
  });

  test('sort asc', async () => {
    const orders = await orderRepo.getFilledOrders({ traderID: 'trader1', sort: 'asc' });

    const sourceIDs = orders.map(order => order.sourceID);
    expect(sourceIDs).toEqual(['source1', 'source2', 'source3']);
  });

  test('sort desc', async () => {
    const orders = await orderRepo.getFilledOrders({ traderID: 'trader1', sort: 'desc' });

    const sourceIDs = orders.map(order => order.sourceID);
    expect(sourceIDs).toEqual(['source3', 'source2', 'source1']);
  });

  test('startTime filter with traderID filter', async () => {
    const orders = await orderRepo.getFilledOrders({ traderID: 'trader1', startTime: 2000 });

    const sourceIDs = orders.map(order => order.sourceID);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source2', 'source3']));
    expect(sourceIDs).toHaveLength(2);
  });

  test('endTime filter with traderID filter', async () => {
    const orders = await orderRepo.getFilledOrders({ traderID: 'trader1', endTime: 2000 });

    const sourceIDs = orders.map(order => order.sourceID);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source1', 'source2']));
    expect(sourceIDs).toHaveLength(2);
  });

  test('unused filter returns quantityUnused greater than zero', async () => {
    const orders = await orderRepo.getFilledOrders({ unused: true });

    const sourceIDs = orders.map(order => order.sourceID);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source3']));
    expect(sourceIDs).toHaveLength(1);
  });
});

describe('use', () => {
  let ordersInDB;
  let req;

  beforeEach(async () => {
    await knex(tableName).truncate();

    ordersInDB = [
      {
        traderID: 'trader1',
        sourceID: 'source1',
        exchangeID: 'binance',
        side: 'buy',
        asset: 'BTC',
        quoteAsset: 'USDT',
        time: msToMySQLFormat(1000),
        quantity: 123.12345678,
        quantityUnused: 123.12345678,
        price: 1123.12345678,
      },
    ];

    req = {
      type: ordersInDB[0].type,
      traderID: ordersInDB[0].traderID,
      exchangeID: ordersInDB[0].exchangeID,
      sourceID: ordersInDB[0].sourceID,
    };

    await knex.insert(ordersInDB).into(tableName);
  });

  it('decrements unused quantity', async () => {
    req.quantity = 123.12345678;
    await orderRepo.use(req);

    const rows = await knex.select('quantityUnused').from(tableName);
    expect(rows[0].quantityUnused).toEqual(0);
  });

  it('throws error when not enough unused qty', async () => {
    req.quantity = 133.12345678;
    expect(orderRepo.use(req)).rejects.toThrow();
  });
});
