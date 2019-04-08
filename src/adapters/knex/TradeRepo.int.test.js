const knexFactory = require('knex');
const knexConfig = require('./knexfile');
const msToMySQLFormat = require('./msToMySQLFormat');
const TradeRepo = require('./TradeRepo');
const Trade = require('../../core/models/Trade');

const env = (process.env.NODE_ENV ? process.env.NODE_ENV : 'development');
const knex = knexFactory(knexConfig[env]);

const tradeRepo = new TradeRepo({ knexConn: knex });
const tableName = 'trades';

afterAll(async () => {
  await knex(tableName).truncate();
  await knex.destroy();
});

let dbObjs;
const defaultDbObj = {
  traderID: 'trader1',
  exchangeID: 'binance',
  asset: 'BTC',
  quoteAsset: 'USDT',
  quantity: 123.45789012,
  weight: 0.12345789,
  score: 1.12345789,
  entrySourceID: 'source1',
  entrySourceType: 'order',
  entryTime: msToMySQLFormat(1540000000000),
  entryPrice: 1.12345789,
  exitSourceID: 'source1',
  exitSourceType: 'withdrawal',
  exitTime: msToMySQLFormat(1550000000000),
  exitPrice: 1.12345789,
};

beforeEach(async () => {
  // db trade
  dbObjs = [
    Object.assign({}, defaultDbObj, {
      exitSourceID: 'source1',
      exitTime: msToMySQLFormat(1550000000000),
      score: 12.123,
    }),
    Object.assign({}, defaultDbObj, {
      exitSourceID: 'source2',
      exitTime: msToMySQLFormat(1560000000000),
      score: 121.23,
    }),
    Object.assign({}, defaultDbObj, {
      exitSourceID: 'source3',
      exitTime: msToMySQLFormat(1570000000000),
      score: 2.123,
    }),
    Object.assign({}, defaultDbObj, {
      traderID: 'trader2',
      exitSourceID: 'source4',
      exitTime: msToMySQLFormat(1570000000000),
    }),
  ];

  // insert into db
  await knex(tableName).truncate();
  await knex(tableName).insert(dbObjs);
});

describe('getTrade', () => {
  it('returns full trade', async () => {
    // db trade
    const dbObj = {
      traderID: 'trader1',
      exchangeID: 'binance',
      asset: 'BTC',
      quoteAsset: 'USDT',
      quantity: 123.45789012,
      weight: 0.12345789,
      score: 1.12345789,
      entrySourceID: 'source123',
      entrySourceType: 'order',
      entryTime: msToMySQLFormat(1550000000000),
      entryPrice: 1.12345789,
      exitSourceID: 'source234',
      exitSourceType: 'withdrawal',
      exitTime: msToMySQLFormat(1550000000000),
      exitPrice: 1.12345789,
    };

    // insert into db
    const [id] = await knex(tableName).insert(dbObj, ['ID']);

    // get from db
    const trade = await tradeRepo.getTrade(id);

    expect(trade.ID).toEqual(id.toString());
    expect(trade.traderID).toEqual(dbObj.traderID);
    expect(trade.exchangeID).toEqual(dbObj.exchangeID);
    expect(trade.asset).toEqual(dbObj.asset);
    expect(trade.quoteAsset).toEqual(dbObj.quoteAsset);
    expect(trade.quantity).toEqual(dbObj.quantity);
    expect(trade.weight).toEqual(dbObj.weight);
    expect(trade.score).toEqual(dbObj.score);
    expect(trade.sourceID).toEqual(dbObj.exitSourceID);
    expect(trade.sourceType).toEqual(dbObj.exitSourceType);
    expect(trade.entry.sourceID).toEqual(dbObj.entrySourceID);
    expect(trade.entry.sourceType).toEqual(dbObj.entrySourceType);
    expect(trade.entry.time).toEqual(new Date(dbObj.entryTime).getTime());
    expect(trade.entry.price).toEqual(dbObj.entryPrice);
    expect(trade.exit.time).toEqual(new Date(dbObj.exitTime).getTime());
    expect(trade.exit.price).toEqual(dbObj.exitPrice);
  });
});

describe('getTrades', () => {
  test('traderID filter', async () => {
    const trades = await tradeRepo.getTrades({ traderID: 'trader1' });
    const exitSourceIDs = trades.map(trade => trade.sourceID);
    expect(exitSourceIDs).toEqual(['source1', 'source2', 'source3']);
  });

  test('startTime filter', async () => {
    const trades = await tradeRepo.getTrades({ traderID: 'trader1', startTime: 1560000000000 });
    const exitSourceIDs = trades.map(trade => trade.sourceID);
    expect(exitSourceIDs).toEqual(['source2', 'source3']);
  });

  test('endTime filter', async () => {
    const trades = await tradeRepo.getTrades({ traderID: 'trader1', endTime: 1560000000000 });
    const exitSourceIDs = trades.map(trade => trade.sourceID);
    expect(exitSourceIDs).toEqual(['source1', 'source2']);
  });

  test('limit filter', async () => {
    const trades = await tradeRepo.getTrades({ traderID: 'trader1', limit: 2 });
    const exitSourceIDs = trades.map(trade => trade.sourceID);
    expect(exitSourceIDs).toEqual(['source1', 'source2']);
  });

  test('sort filter', async () => {
    const trades = await tradeRepo.getTrades({ traderID: 'trader1', sort: 'desc' });
    const exitSourceIDs = trades.map(trade => trade.sourceID);
    expect(exitSourceIDs).toEqual(['source3', 'source2', 'source1']);
  });
});

describe('addTrade', () => {
  const defaultTrade = {
    traderID: 'trader1',
    sourceID: 'source1',
    sourceType: 'order',
    exchangeID: 'binance',
    asset: 'BTC',
    quoteAsset: 'USDT',
    quantity: 1.12345678,
    entry: {
      sourceID: 'source1',
      sourceType: 'order',
      price: 12.12345678,
      time: 1540000000000,
    },
    exit: {
      price: 12.12345678,
      time: 1540000000000,
    },
    weight: 0.5,
    score: 12.12345678,
  };

  test('saves to db', async () => {
    const trade = new Trade(defaultTrade);

    const id = await tradeRepo.addTrade(trade);
    trade.ID = id.toString();

    const [dbRow] = await knex(tableName).select().where({ ID: id });
    expect(TradeRepo.dbRowToTrade(dbRow)).toEqual(trade);
  });
});
