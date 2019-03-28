module.exports = class KnexUnitOfWork {
  constructor(knex, trx) {
    this.knex = knex;
    this.trx = trx;
  }

  async complete() {
    return this.trx.commit();
  }

  async rollback() {
    return this.trx.rollback();
  }
};
