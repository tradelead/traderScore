
exports.up = async function (knex) {
  return knex.schema.createTable('transfers', (t) => {
    t.increments('ID').primary().unique();

    t.string('type', 60).notNullable();
    t.string('traderID', 60).notNullable();
    t.string('sourceID', 60).notNullable();
    t.string('exchangeID', 60).notNullable();
    t.string('asset', 10).notNullable();
    t.timestamp('time', 3).notNullable();
    t.decimal('quantity', 65, 8).notNullable();
    t.decimal('quantityUnused', 65, 8).notNullable();

    t.unique(['type', 'traderID', 'exchangeID', 'sourceID']);

    t.index(['traderID', 'exchangeID', 'time']);
    t.index(['traderID', 'exchangeID', 'asset', 'quantityUnused', 'time']);
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTable('transfers');
};
