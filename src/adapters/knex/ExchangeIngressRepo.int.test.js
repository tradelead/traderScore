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

it('works', async () => {
  const req = {
    traderID: 'traderID',
    exchangeID: 'binance',
  };

  let isComplete = await exchangeIngressRepo.isComplete(req);
  expect(isComplete).toEqual(false);

  await exchangeIngressRepo.markComplete(req);
  isComplete = await exchangeIngressRepo.isComplete(req);
  expect(isComplete).toEqual(true);
});
