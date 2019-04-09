
exports.up = async function (knex) {
  return knex.schema.createTable('scoreUpdateSchedule', (t) => {
    t.increments('ID').primary();
    t.string('traderID', 60).notNullable();
    t.string('period', 60).notNullable();
    t.timestamp('time', 3).notNullable().defaultTo(knex.fn.now(3));

    t.index(['time']);
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTable('scoreUpdateSchedule');
};
