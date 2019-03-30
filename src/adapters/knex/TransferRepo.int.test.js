const sinon = require('sinon');
const knexFactory = require('knex');
const knexConfig = require('./knexfile');
const msToMySQLFormat = require('./msToMySQLFormat');
const TransferRepo = require('./TransferRepo');
const Deposit = require('../../core/models/Deposit');
const Withdrawal = require('../../core/models/Withdrawal');

const env = (process.env.NODE_ENV ? process.env.NODE_ENV : 'development');
const knex = knexFactory(knexConfig[env]);

const portfolioRepo = {
  incr: sinon.spy(),
  decr: sinon.spy(),
};

const portfolioRepoFactory = {
  create: () => portfolioRepo,
};
const transferRepo = new TransferRepo({ knexConn: knex, portfolioRepoFactory });
const tableName = 'transfers';

afterAll(async () => {
  await knex(tableName).truncate();
  await knex.destroy();
});

describe('addDeposit', () => {
  let deposit;
  let newDepositID;

  beforeAll(async () => {
    deposit = new Deposit({
      traderID: 'trader123',
      sourceID: 'source123',
      exchangeID: 'binance',
      asset: 'BTC',
      time: 1550000000000,
      quantity: 123.12345678,
    });

    newDepositID = await transferRepo.addDeposit(deposit);
  });

  afterAll(async () => {
    await knex(tableName).truncate();
  });

  it('saves with type deposit', async () => {
    const [savedDeposit] = await knex
      .select('type')
      .from(tableName)
      .where({ ID: newDepositID });
    expect(savedDeposit.type).toBe('deposit');
  });

  it('saves traderID', async () => {
    const [savedDeposit] = await knex
      .select('traderID')
      .from(tableName)
      .where({ ID: newDepositID });
    expect(savedDeposit.traderID).toBe(deposit.traderID);
  });

  it('saves sourceID', async () => {
    const [savedDeposit] = await knex
      .select('sourceID')
      .from(tableName)
      .where({ ID: newDepositID });
    expect(savedDeposit.sourceID).toBe(deposit.sourceID);
  });

  it('saves exchangeID', async () => {
    const [savedDeposit] = await knex
      .select('exchangeID')
      .from(tableName)
      .where({ ID: newDepositID });
    expect(savedDeposit.exchangeID).toBe(deposit.exchangeID);
  });

  it('saves asset', async () => {
    const [savedDeposit] = await knex
      .select('asset')
      .from(tableName)
      .where({ ID: newDepositID });
    expect(savedDeposit.asset).toBe(deposit.asset);
  });

  it('saves time', async () => {
    const [savedDeposit] = await knex
      .select('time')
      .from(tableName)
      .where({ ID: newDepositID });
    const date = new Date(savedDeposit.time);
    expect(date.getTime()).toBe(deposit.time);
  });

  it('saves quantity', async () => {
    const [savedDeposit] = await knex
      .select('quantity')
      .from(tableName)
      .where({ ID: newDepositID });
    expect(savedDeposit.quantity).toBe(deposit.quantity);
  });

  it('saves quantityUnused with value of quantity', async () => {
    const [savedDeposit] = await knex
      .select('quantityUnused')
      .from(tableName)
      .where({ ID: newDepositID });
    expect(savedDeposit.quantityUnused).toBe(deposit.quantity);
  });

  it('calls portfolioRepo incr with correct params', async () => {
    portfolioRepo.incr.calledOnceWithExactly({
      traderID: deposit.traderID,
      exchangeID: deposit.exchangeID,
      asset: deposit.asset,
      time: deposit.time,
      quantity: deposit.quantity,
    });
  });

  it('prevents duplicates of trader + exchange + source', async () => {
    const similarDeposit = Object.assign({}, deposit, {
      asset: 'ETH',
      time: 15560000000000,
      quantity: 234.12345678,
    });

    return expect(transferRepo.addDeposit(similarDeposit)).rejects.toThrow();
  });
});

describe('addWithdrawal', () => {
  let withdrawal;
  let newWithdrawalID;

  beforeAll(async () => {
    withdrawal = new Withdrawal({
      traderID: 'trader123',
      sourceID: 'source123',
      exchangeID: 'binance',
      asset: 'BTC',
      time: 1550000000000,
      quantity: 123.12345678,
    });

    newWithdrawalID = await transferRepo.addWithdrawal(withdrawal);
  });

  afterAll(async () => {
    await knex(tableName).truncate();
  });

  it('saves with type withdrawal', async () => {
    const [savedWithdrawal] = await knex
      .select('type')
      .from(tableName)
      .where({ ID: newWithdrawalID });
    expect(savedWithdrawal.type).toBe('withdrawal');
  });

  it('saves traderID', async () => {
    const [savedWithdrawal] = await knex
      .select('traderID')
      .from(tableName)
      .where({ ID: newWithdrawalID });
    expect(savedWithdrawal.traderID).toBe(withdrawal.traderID);
  });

  it('saves sourceID', async () => {
    const [savedWithdrawal] = await knex
      .select('sourceID')
      .from(tableName)
      .where({ ID: newWithdrawalID });
    expect(savedWithdrawal.sourceID).toBe(withdrawal.sourceID);
  });

  it('saves exchangeID', async () => {
    const [savedWithdrawal] = await knex
      .select('exchangeID')
      .from(tableName)
      .where({ ID: newWithdrawalID });
    expect(savedWithdrawal.exchangeID).toBe(withdrawal.exchangeID);
  });

  it('saves asset', async () => {
    const [savedWithdrawal] = await knex
      .select('asset')
      .from(tableName)
      .where({ ID: newWithdrawalID });
    expect(savedWithdrawal.asset).toBe(withdrawal.asset);
  });

  it('saves time', async () => {
    const [savedWithdrawal] = await knex
      .select('time')
      .from(tableName)
      .where({ ID: newWithdrawalID });
    const date = new Date(savedWithdrawal.time);
    expect(date.getTime()).toBe(withdrawal.time);
  });

  it('saves quantity', async () => {
    const [savedWithdrawal] = await knex
      .select('quantity')
      .from(tableName)
      .where({ ID: newWithdrawalID });
    expect(savedWithdrawal.quantity).toBe(withdrawal.quantity);
  });

  it('calls portfolioRepo decr with correct params', async () => {
    portfolioRepo.decr.calledOnceWithExactly({
      traderID: withdrawal.traderID,
      exchangeID: withdrawal.exchangeID,
      asset: withdrawal.asset,
      time: withdrawal.time,
      quantity: withdrawal.quantity,
    });
  });

  it('prevents duplicates of trader + exchange + source', async () => {
    const similarWithdrawal = Object.assign({}, withdrawal, {
      asset: 'ETH',
      time: 15560000000000,
      quantity: 234.12345678,
    });

    return expect(transferRepo.addWithdrawal(similarWithdrawal)).rejects.toThrow();
  });
});

describe('findDeposits', () => {
  let depositsInDB;

  beforeAll(async () => {
    depositsInDB = [
      {
        type: 'deposit',
        traderID: 'trader1',
        sourceID: 'source1',
        exchangeID: 'binance',
        asset: 'BTC',
        time: msToMySQLFormat(1000),
        quantity: 123.12345678,
        quantityUnused: 0,
      },
      {
        type: 'deposit',
        traderID: 'trader1',
        sourceID: 'source2',
        exchangeID: 'binance',
        asset: 'BTC',
        time: msToMySQLFormat(2000),
        quantity: 123.12345678,
        quantityUnused: 0,
      },
      {
        type: 'deposit',
        traderID: 'trader1',
        sourceID: 'source3',
        exchangeID: 'bittrex',
        asset: 'ETH',
        time: msToMySQLFormat(3000),
        quantity: 123.12345678,
        quantityUnused: 1,
      },
      {
        type: 'deposit',
        traderID: 'trader2',
        sourceID: 'source4',
        exchangeID: 'binance',
        asset: 'BTC',
        time: msToMySQLFormat(4000),
        quantity: 123.12345678,
        quantityUnused: 0,
      },
      {
        type: 'withdrawal',
        traderID: 'trader2',
        sourceID: 'source5',
        exchangeID: 'binance',
        asset: 'BTC',
        time: msToMySQLFormat(4000),
        quantity: 123.12345678,
        quantityUnused: 0,
      },
    ];

    // seed for tests
    await knex.insert(depositsInDB).into(tableName);
  });

  afterAll(async () => {
    await knex(tableName).truncate();
  });

  test('traderID filter', async () => {
    const deposits = await transferRepo.findDeposits({ traderID: 'trader1' });

    const sourceIDs = deposits.map(deposit => deposit.sourceID);
    expect(sourceIDs).toHaveLength(3);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source1', 'source2', 'source3']));
  });

  test('traderID & exchangeID filters', async () => {
    const deposits = await transferRepo.findDeposits({ traderID: 'trader1', exchangeID: 'bittrex' });

    const sourceIDs = deposits.map(deposit => deposit.sourceID);
    expect(sourceIDs).toHaveLength(1);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source3']));
  });

  test('traderID & asset filters', async () => {
    const deposits = await transferRepo.findDeposits({ traderID: 'trader1', asset: 'BTC' });

    const sourceIDs = deposits.map(deposit => deposit.sourceID);
    expect(sourceIDs).toHaveLength(2);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source1', 'source2']));
  });

  test('limit param', async () => {
    const deposits = await transferRepo.findDeposits({ limit: 2 });

    const sourceIDs = deposits.map(deposit => deposit.sourceID);
    expect(sourceIDs).toHaveLength(2);
  });

  test('sort asc', async () => {
    const deposits = await transferRepo.findDeposits({ traderID: 'trader1', sort: 'asc' });

    const sourceIDs = deposits.map(deposit => deposit.sourceID);
    expect(sourceIDs).toEqual(['source1', 'source2', 'source3']);
  });

  test('sort desc', async () => {
    const deposits = await transferRepo.findDeposits({ traderID: 'trader1', sort: 'desc' });

    const sourceIDs = deposits.map(deposit => deposit.sourceID);
    expect(sourceIDs).toEqual(['source3', 'source2', 'source1']);
  });

  test('startTime filter with traderID filter', async () => {
    const deposits = await transferRepo.findDeposits({ traderID: 'trader1', startTime: 2000 });

    const sourceIDs = deposits.map(deposit => deposit.sourceID);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source2', 'source3']));
    expect(sourceIDs).toHaveLength(2);
  });

  test('endTime filter with traderID filter', async () => {
    const deposits = await transferRepo.findDeposits({ traderID: 'trader1', endTime: 2000 });

    const sourceIDs = deposits.map(deposit => deposit.sourceID);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source1', 'source2']));
    expect(sourceIDs).toHaveLength(2);
  });

  test('unused filter returns quantityUnused greater than zero', async () => {
    const deposits = await transferRepo.findDeposits({ unused: true });

    const sourceIDs = deposits.map(deposit => deposit.sourceID);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source3']));
    expect(sourceIDs).toHaveLength(1);
  });

  test('only returns deposits', async () => {
    const deposits = await transferRepo.findDeposits({});

    const types = deposits.map(deposit => deposit.type);
    const uniqueTypes = Array.from(new Set(types));
    expect(uniqueTypes).toEqual(expect.arrayContaining(['deposit']));
    expect(uniqueTypes).toHaveLength(1);
  });
});

describe('findWithdrawals', () => {
  let withdrawalsInDB;

  beforeAll(async () => {
    withdrawalsInDB = [
      {
        type: 'withdrawal',
        traderID: 'trader1',
        sourceID: 'source1',
        exchangeID: 'binance',
        asset: 'BTC',
        time: msToMySQLFormat(1000),
        quantity: 123.12345678,
        quantityUnused: 0,
      },
      {
        type: 'withdrawal',
        traderID: 'trader1',
        sourceID: 'source2',
        exchangeID: 'binance',
        asset: 'BTC',
        time: msToMySQLFormat(2000),
        quantity: 123.12345678,
        quantityUnused: 0,
      },
      {
        type: 'withdrawal',
        traderID: 'trader1',
        sourceID: 'source3',
        exchangeID: 'bittrex',
        asset: 'ETH',
        time: msToMySQLFormat(3000),
        quantity: 123.12345678,
        quantityUnused: 0,
      },
      {
        type: 'withdrawal',
        traderID: 'trader2',
        sourceID: 'source4',
        exchangeID: 'binance',
        asset: 'BTC',
        time: msToMySQLFormat(4000),
        quantity: 123.12345678,
        quantityUnused: 0,
      },
      {
        type: 'deposit',
        traderID: 'trader2',
        sourceID: 'source5',
        exchangeID: 'binance',
        asset: 'BTC',
        time: msToMySQLFormat(4000),
        quantity: 123.12345678,
        quantityUnused: 0,
      },
    ];

    // seed for tests
    await knex.insert(withdrawalsInDB).into(tableName);
  });

  afterAll(async () => {
    await knex(tableName).truncate();
  });

  test('traderID filter', async () => {
    const withdrawals = await transferRepo.findWithdrawals({ traderID: 'trader1' });

    const sourceIDs = withdrawals.map(withdrawal => withdrawal.sourceID);
    expect(sourceIDs).toHaveLength(3);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source1', 'source2', 'source3']));
  });

  test('traderID & exchangeID filters', async () => {
    const withdrawals = await transferRepo.findWithdrawals({ traderID: 'trader1', exchangeID: 'bittrex' });

    const sourceIDs = withdrawals.map(withdrawal => withdrawal.sourceID);
    expect(sourceIDs).toHaveLength(1);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source3']));
  });

  test('traderID & asset filters', async () => {
    const withdrawals = await transferRepo.findWithdrawals({ traderID: 'trader1', asset: 'BTC' });

    const sourceIDs = withdrawals.map(withdrawal => withdrawal.sourceID);
    expect(sourceIDs).toHaveLength(2);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source1', 'source2']));
  });

  test('limit param', async () => {
    const withdrawals = await transferRepo.findWithdrawals({ limit: 2 });

    const sourceIDs = withdrawals.map(withdrawal => withdrawal.sourceID);
    expect(sourceIDs).toHaveLength(2);
  });

  test('sort asc', async () => {
    const withdrawals = await transferRepo.findWithdrawals({ traderID: 'trader1', sort: 'asc' });

    const sourceIDs = withdrawals.map(withdrawal => withdrawal.sourceID);
    expect(sourceIDs).toEqual(['source1', 'source2', 'source3']);
  });

  test('sort desc', async () => {
    const withdrawals = await transferRepo.findWithdrawals({ traderID: 'trader1', sort: 'desc' });

    const sourceIDs = withdrawals.map(withdrawal => withdrawal.sourceID);
    expect(sourceIDs).toEqual(['source3', 'source2', 'source1']);
  });

  test('startTime filter with traderID filter', async () => {
    const withdrawals = await transferRepo.findWithdrawals({ traderID: 'trader1', startTime: 2000 });

    const sourceIDs = withdrawals.map(withdrawal => withdrawal.sourceID);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source2', 'source3']));
    expect(sourceIDs).toHaveLength(2);
  });

  test('endTime filter with traderID filter', async () => {
    const withdrawals = await transferRepo.findWithdrawals({ traderID: 'trader1', endTime: 2000 });

    const sourceIDs = withdrawals.map(withdrawal => withdrawal.sourceID);
    expect(sourceIDs).toEqual(expect.arrayContaining(['source1', 'source2']));
    expect(sourceIDs).toHaveLength(2);
  });

  test('only returns withdrawals', async () => {
    const withdrawals = await transferRepo.findWithdrawals({});

    const types = withdrawals.map(withdrawal => withdrawal.type);
    const uniqueTypes = Array.from(new Set(types));
    expect(uniqueTypes).toEqual(expect.arrayContaining(['withdrawal']));
    expect(uniqueTypes).toHaveLength(1);
  });
});
