const knexFactory = require('knex');
const knexConfig = require('./knexfile');
const msToMySQLFormat = require('./msToMySQLFormat');
const PortfolioRepo = require('./PortfolioRepo');

const env = (process.env.NODE_ENV ? process.env.NODE_ENV : 'development');
const knex = knexFactory(knexConfig[env]);

const portfolioRepo = new PortfolioRepo({ knexConn: knex });
const tableName = 'portfolio';
const assetTableName = 'portfolioAssets';

afterAll(async () => {
  await knex(tableName).truncate();
  await knex(assetTableName).truncate();
  await knex.destroy();
});

describe('incr method', () => {
  const defaultReq = {
    traderID: 'trader1',
    exchangeID: 'binance',
    asset: 'BTC',
    quantity: 12.345,
    time: 1550000000000,
  };
  let req = Object.assign({}, defaultReq);

  beforeEach(() => {
    req = Object.assign({}, defaultReq);
  });

  beforeAll(async () => {
    await knex(tableName).truncate();
    await knex(assetTableName).truncate();
    await portfolioRepo.incr(req);
  });

  it('saves traderID, exchangeID, asset on first', async () => {
    const [savedAsset] = await knex.select().from(assetTableName);
    console.log(savedAsset);
    expect(savedAsset.traderID).toBe(req.traderID);
    expect(savedAsset.exchangeID).toBe(req.exchangeID);
    expect(savedAsset.asset).toBe(req.asset);
  });

  it('uses existing asset on additional incr', async () => {
    req.time += 100000;
    await portfolioRepo.incr(req);

    const assets = await knex.select().from(assetTableName);
    expect(assets).toHaveLength(1);

    const [savedRow] = await knex.select().from(tableName).orderBy('time', 'desc').limit(1);
    expect(savedRow.traderExchangeAssetID).toBe(assets[0].ID);
  });

  it('saves time', async () => {
    const [savedRow] = await knex.select().from(tableName);

    const d = new Date(savedRow.time);
    expect(d.getTime()).toBe(req.time);
  });

  it('quantity saved on first', async () => {
    const [savedRow] = await knex.select().from(tableName);
    expect(savedRow.quantity).toBe(req.quantity);
  });

  it('increments asset quantity on additional', async () => {
    await knex(tableName).truncate();

    await portfolioRepo.incr(req);

    req.time += 100000;
    await portfolioRepo.incr(req);

    const [savedRow] = await knex.select().from(tableName).orderBy('time', 'desc').limit(1);
    expect(savedRow.quantity).toBe(req.quantity * 2);
  });

  it('increments each asset portfolio entry greater than time', async () => {
    await knex(tableName).truncate();

    await portfolioRepo.incr(req);

    req.time += 100000;
    await portfolioRepo.incr(req);

    // this call should increment previous two call since their time is greater
    req.time -= 200000;
    await portfolioRepo.incr(req);

    const savedRows = await knex.select().from(tableName).orderBy('time', 'asc').limit(3);

    expect(new Date(savedRows[0].time).getTime()).toBe(defaultReq.time - 100000);
    expect(savedRows[0].quantity).toBe(12.345);

    expect(new Date(savedRows[1].time).getTime()).toBe(defaultReq.time);
    expect(savedRows[1].quantity).toBe(24.69);

    expect(new Date(savedRows[2].time).getTime()).toBe(defaultReq.time + 100000);
    expect(savedRows[2].quantity).toBe(37.035);
  });

  it('increments asset quantity with floating point precision', async () => {
    await knex(tableName).truncate();

    req.quantity = 0.7;
    await portfolioRepo.incr(req);

    req.time += 100000;
    req.quantity = 0.1;
    await portfolioRepo.incr(req);

    req.time += 100000;
    req.quantity = 242342324231.0001;
    await portfolioRepo.incr(req);

    const [savedRow] = await knex.select().from(tableName).orderBy('time', 'desc').limit(1);
    expect(savedRow.quantity).toBe(242342324231.8001);
  });

  it('creates new row per call', async () => {
    await knex(tableName).truncate();

    await portfolioRepo.incr(req);
    await portfolioRepo.incr(req);

    const rows = await knex.select().from(tableName);
    expect(rows).toHaveLength(2);
  });
});

describe('decr method', () => {
  const defaultReq = {
    traderID: 'trader1',
    exchangeID: 'binance',
    asset: 'BTC',
    quantity: 12.345,
    time: 1550000000000,
  };
  let req = Object.assign({}, defaultReq);
  let assetID;

  beforeEach(async () => {
    await knex(tableName).truncate();
    await knex(assetTableName).truncate();

    req = Object.assign({}, defaultReq);

    [assetID] = await knex(assetTableName).insert({
      traderID: req.traderID,
      exchangeID: req.exchangeID,
      asset: req.asset,
    }, ['ID']);

    await knex(tableName).insert({
      traderExchangeAssetID: assetID,
      quantity: 13.345,
      time: msToMySQLFormat(req.time - 100000),
    });
  });

  it('throws error if qty 0', async () => {
    await knex(tableName).truncate();
    expect(portfolioRepo.decr(req)).rejects.toThrow();
  });

  it('throws error if decr qty is greater than curr qty', async () => {
    req.quantity = 15;
    expect(portfolioRepo.decr(req)).rejects.toThrow();
  });

  it('decrements asset quantity', async () => {
    await portfolioRepo.decr(req);

    const [savedRow] = await knex.select().from(tableName).orderBy('time', 'desc').limit(1);
    expect(savedRow.quantity).toBe(1);
  });

  it('uses existing asset', async () => {
    await portfolioRepo.decr(req);

    const assets = await knex.select().from(assetTableName);
    expect(assets).toHaveLength(1);

    const [savedRow] = await knex.select().from(tableName).orderBy('time', 'desc').limit(1);
    expect(savedRow.traderExchangeAssetID).toBe(assets[0].ID);
  });

  it('saves time', async () => {
    await portfolioRepo.decr(req);

    const [savedRow] = await knex.select().from(tableName).orderBy('time', 'desc').limit(1);

    const d = new Date(savedRow.time);
    expect(d.getTime()).toBe(req.time);
  });

  it('creates new row per call', async () => {
    await portfolioRepo.decr(req);

    const rows = await knex.select().from(tableName);
    expect(rows).toHaveLength(2);
  });

  it('decrements each asset portfolio entry greater than time', async () => {
    await knex(tableName).insert([
      {
        traderExchangeAssetID: assetID,
        quantity: 23.345,
        time: msToMySQLFormat(req.time + 100000),
      },
      {
        traderExchangeAssetID: assetID,
        quantity: 33.345,
        time: msToMySQLFormat(req.time + 200000),
      },
    ]);

    await portfolioRepo.decr(req);

    const savedRows = await knex.select().from(tableName).orderBy('time', 'asc').limit(4);

    expect(new Date(savedRows[0].time).getTime()).toBe(defaultReq.time - 100000);
    expect(savedRows[0].quantity).toBe(13.345);

    expect(new Date(savedRows[1].time).getTime()).toBe(defaultReq.time);
    expect(savedRows[1].quantity).toBe(1);

    expect(new Date(savedRows[2].time).getTime()).toBe(defaultReq.time + 100000);
    expect(savedRows[2].quantity).toBe(11);

    expect(new Date(savedRows[3].time).getTime()).toBe(defaultReq.time + 200000);
    expect(savedRows[3].quantity).toBe(21);
  });
});

describe('snapshot', () => {
  const defaultReq = {
    traderID: 'trader1',
    time: 1550000000000,
  };

  let req;
  let assetIDs;

  beforeEach(async () => {
    await knex(tableName).truncate();
    await knex(assetTableName).truncate();

    req = Object.assign({}, defaultReq);

    assetIDs = [];
    let assetID;

    [assetID] = await knex(assetTableName).insert({
      traderID: req.traderID,
      exchangeID: 'binance',
      asset: 'BTC',
    }, ['ID']);
    assetIDs.push(assetID);

    await knex(tableName).insert([
      {
        traderExchangeAssetID: assetID,
        quantity: 3.345,
        time: msToMySQLFormat(req.time - 100000),
      },
      {
        traderExchangeAssetID: assetID,
        quantity: 5.345,
        time: msToMySQLFormat(req.time - 10000),
      },
    ]);

    [assetID] = await knex(assetTableName).insert({
      traderID: req.traderID,
      exchangeID: 'bittrex',
      asset: 'ETH',
    }, ['ID']);
    assetIDs.push(assetID);

    await knex(tableName).insert([
      {
        traderExchangeAssetID: assetID,
        quantity: 13.345,
        time: msToMySQLFormat(req.time - 100000),
      },
      {
        traderExchangeAssetID: assetID,
        quantity: 15.345,
        time: msToMySQLFormat(req.time - 10000),
      },
    ]);
  });

  it('returns snapshot', async () => {
    const snapshot = await portfolioRepo.snapshot(req);

    const expectedSnapshot = [
      {
        ID: assetIDs[0],
        traderID: req.traderID,
        exchangeID: 'binance',
        asset: 'BTC',
        quantity: 5.345,
      },
      {
        ID: assetIDs[1],
        traderID: req.traderID,
        exchangeID: 'bittrex',
        asset: 'ETH',
        quantity: 15.345,
      },
    ];

    expect(snapshot).toEqual(expectedSnapshot);
  });
});
