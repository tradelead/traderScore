const { EventEmitter } = require('events');

module.exports = class KnexUnitOfWork extends EventEmitter {
  constructor(trx) {
    super();
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
