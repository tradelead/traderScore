
exports.up = async function (knex) {
  return knex.schema.createTable('transfers', (t) => {
    t.increments('ID').primary().unique();

    t.string('type', 60);
    t.string('traderID', 60);
    t.string('sourceID', 60);
    t.string('exchangeID', 60);
    t.string('asset', 10);
    t.timestamp('time', 3);
    t.decimal('quantity', 65, 8);
    t.decimal('quantityUsedAsEntry', 65, 8);
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTable('transfers');
};
