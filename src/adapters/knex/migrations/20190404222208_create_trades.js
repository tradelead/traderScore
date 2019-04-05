
exports.up = async function (knex) {
  return knex.schema.createTable('trades', (t) => {
    t.increments('ID').primary();

    t.string('traderID', 60).notNullable();
    t.string('exchangeID', 60).notNullable();
    t.string('asset', 10).notNullable();
    t.string('quoteAsset', 10).notNullable();
    t.decimal('quantity', 65, 8).notNullable();
    t.decimal('weight', 65, 8).notNullable();
    t.decimal('score', 65, 8).notNullable();

    t.string('entrySourceID', 60).notNullable();
    t.string('entrySourceType', 60).notNullable();
    t.decimal('entryPrice', 65, 8).notNullable();
    t.timestamp('entryTime', 3).notNullable().defaultTo(knex.fn.now(3));

    t.string('exitSourceID', 60).notNullable();
    t.string('exitSourceType', 60).notNullable();
    t.decimal('exitPrice', 65, 8).notNullable();
    t.timestamp('exitTime', 3).notNullable().defaultTo(knex.fn.now(3));

    t.index(['traderID', 'exitTime']);
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTable('trades');
};
