const sinon = require('sinon');
const knexFactory = require('knex');
const knexConfig = require('./knexfile');
const TransferRepo = require('./TransferRepo');
const Deposit = require('../../core/models/Deposit');

const env = (process.env.NODE_ENV ? process.env.NODE_ENV : 'development');
console.log(knexConfig[env], env);
const knex = knexFactory(knexConfig[env]);

const portfolioRepo = {
  incr: sinon.spy(),
  decr: sinon.spy(),
};

const portfolioRepoFactory = {
  create: () => portfolioRepo,
};
const transferRepo = new TransferRepo({ knexConn: knex, portfolioRepoFactory });

afterAll(() => {
  knex.destroy();
});

describe('addDeposit', async () => {
  let deposit;
  let newDepositID;

  beforeAll(async () => {
    deposit = new Deposit({
      traderID: 'trader123',
      sourceID: 'source123',
      exchangeID: 'binance',
      asset: 'BTC',
      time: Date.now(),
      quantity: 123.12345678,
    });

    deposit.quantityUsedAsEntry = 234.12345678;

    newDepositID = await transferRepo.addDeposit(deposit);
  });


  test('saves traderID', async () => {
    const [savedDeposit] = await knex
      .select('traderID')
      .from('transfers')
      .where({ ID: newDepositID });
    expect(savedDeposit.traderID).toBe(deposit.traderID);
  });

  test('saves sourceID', async () => {
    const [savedDeposit] = await knex
      .select('sourceID')
      .from('transfers')
      .where({ ID: newDepositID });
    expect(savedDeposit.sourceID).toBe(deposit.sourceID);
  });

  test('saves exchangeID', async () => {
    const [savedDeposit] = await knex
      .select('exchangeID')
      .from('transfers')
      .where({ ID: newDepositID });
    expect(savedDeposit.exchangeID).toBe(deposit.exchangeID);
  });

  test('saves asset', async () => {
    const [savedDeposit] = await knex
      .select('asset')
      .from('transfers')
      .where({ ID: newDepositID });
    expect(savedDeposit.asset).toBe(deposit.asset);
  });

  test('saves time', async () => {
    const [savedDeposit] = await knex
      .select('time')
      .from('transfers')
      .where({ ID: newDepositID });
    const date = new Date(savedDeposit.time);
    expect(date.getTime()).toBe(deposit.time);
  });

  test('saves quantity', async () => {
    const [savedDeposit] = await knex
      .select('quantity')
      .from('transfers')
      .where({ ID: newDepositID });
    expect(savedDeposit.quantity).toBe(deposit.quantity);
  });

  test('saves quantityUsedAsEntry', async () => {
    const [savedDeposit] = await knex
      .select('quantityUsedAsEntry')
      .from('transfers')
      .where({ ID: newDepositID });
    expect(savedDeposit.quantityUsedAsEntry).toBe(deposit.quantityUsedAsEntry);
  });
});
