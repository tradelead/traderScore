const knexFactory = require('knex');
const knexConfig = require('./knexfile');
const ExchangeIngressRepo = require('./ExchangeIngressRepo');

const env = (process.env.NODE_ENV ? process.env.NODE_ENV : 'development');
const knex = knexFactory(knexConfig[env]);
const tableName = 'exchangeIngress';

const exchangeIngressRepo = new ExchangeIngressRepo({ knexConn: knex });

beforeAll(async () => {
  await knex(tableName).truncate();
});

afterAll(async () => {
  await knex(tableName).truncate();
  await knex.destroy();
});

const req = {
  traderID: 'traderID',
  exchangeID: 'binance',
};

it('works', async () => {
  let isComplete = await exchangeIngressRepo.isComplete(req);
  expect(isComplete).toEqual(false);

  await exchangeIngressRepo.markComplete(req);
  isComplete = await exchangeIngressRepo.isComplete(req);
  expect(isComplete).toEqual(true);

  await exchangeIngressRepo.markIncomplete(req);
  isComplete = await exchangeIngressRepo.isComplete(req);
  expect(isComplete).toEqual(false);
});

it('does not throw error on duplicate', async () => {
  await exchangeIngressRepo.markComplete(req);
  await exchangeIngressRepo.markComplete(req);
});
