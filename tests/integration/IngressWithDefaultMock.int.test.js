const sinon = require('sinon');

process.env.MOCK_EXCHANGE_SERVICE = 'true';

const app = require('../../src/app.bootstrap');

const flushDbs = require('../flushDBs');

beforeEach(async () => {
  await flushDbs();
});

test('trader\'s first ingress', async () => {
  await app.useCases.ingressTraderExchange({
    traderID: 'trader1',
    exchangeID: 'binance',
  });

  const globalScores = await app.useCases.getTraderScoreHistory({ traderID: 'trader1' });
  expect(globalScores).toHaveLength(2);

  expect(globalScores).toContainEqual(expect.objectContaining({
    traderID: 'trader1',
    period: 'global',
    score: 1.01953643,
  }));
});