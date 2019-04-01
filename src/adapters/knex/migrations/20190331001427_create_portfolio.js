
exports.up = async function (knex) {
  return knex.schema.createTable('portfolio', (t) => {
    t.increments('ID').primary();

    t.integer('traderExchangeAssetID').notNullable();
    t.decimal('quantity', 65, 8).notNullable();
    t.timestamp('time', 3).notNullable().defaultTo(knex.fn.now(3));

    t.index(['traderExchangeAssetID', 'time']);
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTable('portfolio');
};
