const { EventEmitter } = require('events');

module.exports = class KnexUnitOfWork extends EventEmitter {
  constructor(knex, trx) {
    super();
    this.knex = knex;
    this.trx = trx;
  }

  async complete() {
    const res = await this.trx.commit();
    this.emit('complete');
    return res;
  }

  async rollback() {
    const res = await this.trx.rollback();
    this.emit('rollback');
    return res;
  }
};
