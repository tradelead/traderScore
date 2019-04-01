
exports.up = async function (knex) {
  return knex.schema.createTable('portfolioAssets', (t) => {
    t.increments('ID').primary();

    t.string('traderID', 60).notNullable();
    t.string('exchangeID', 60).notNullable();
    t.string('asset', 10).notNullable();

    t.unique(['traderID', 'exchangeID', 'asset']);
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTable('portfolioAssets');
};
