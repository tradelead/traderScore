const msToMySQLFormat = require('../msToMySQLFormat');

exports.seed = async function (knex) {
  await knex('portfolio').truncate();
  await knex('portfolioAssets').truncate();

  const [BTC] = await knex('portfolioAssets')
    .insert({
      traderID: 'trader1',
      exchangeID: 'binance',
      asset: 'BTC',
    }, ['ID']);

  const [ETH] = await knex('portfolioAssets')
    .insert({
      traderID: 'trader1',
      exchangeID: 'binance',
      asset: 'ETH',
    }, ['ID']);

  const [LTC] = await knex('portfolioAssets')
    .insert({
      traderID: 'trader1',
      exchangeID: 'binance',
      asset: 'LTC',
    }, ['ID']);

  let time = 1550000000000;
  let quantity = 1;

  const prom = [];
  for (let i = 0; i < 20000; i++) {
    time += 1000000;
    quantity += 1;

    prom.push(knex('portfolio')
      .insert({
        traderExchangeAssetID: BTC,
        quantity,
        time: msToMySQLFormat(time),
      }));

    prom.push(knex('portfolio')
      .insert({
        traderExchangeAssetID: ETH,
        quantity,
        time: msToMySQLFormat(time),
      }));

    prom.push(knex('portfolio')
      .insert({
        traderExchangeAssetID: LTC,
        quantity,
        time: msToMySQLFormat(time),
      }));
  }

  await Promise.all(prom);
};
