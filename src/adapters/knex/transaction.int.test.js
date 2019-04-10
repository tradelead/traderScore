const knexFactory = require('knex');

const knexConfig = require('./knexfile');

const env = (process.env.NODE_ENV ? process.env.NODE_ENV : 'development');
const knex = knexFactory(knexConfig[env]);

it('testing transaction', async () => {
  try {
    await knex
      .transaction(async (trx) => {
        const res = await trx
          .select()
          .from('scores')
          .where({ traderID: 'trader1' })
          .orderBy('time', 'desc')
          .limit(10);

        console.log(res);

        await trx.commit();
      })
      .then((res) => {
        console.log(res);
      })
      .catch((error) => {
        console.log(error);
      });
  } catch (e) {
    console.error(e);
  } finally {
    await knex.destroy();
  }
});
