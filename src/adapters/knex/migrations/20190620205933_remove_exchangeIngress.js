
exports.up = async function (knex) {
  return knex.schema.dropTable('exchangeIngress');
};

exports.down = async function (knex) {
  return knex.schema.createTable('exchangeIngress', (t) => {
    t.increments('ID').primary();
    t.string('traderID', 60).notNullable();
    t.string('exchangeID', 60).notNullable();
  });
};
