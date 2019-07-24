const debug = require('debug')('traderScore:UnitOfWork');
const { EventEmitter } = require('events');
const uuidv4 = require('uuid/v4');

module.exports = class KnexUnitOfWork extends EventEmitter {
  constructor(trx) {
    super();
    this.setMaxListeners(100);
    this.trx = trx;

    this.ID = uuidv4();
    debug(`start ${this.idShort()}`);
  }

  async complete() {
    await this.trx.commit();
    debug(`complete ${this.idShort()}`);
    this.emit('complete');
  }

  async rollback() {
    await this.trx.rollback();
    debug(`rollback ${this.idShort()}`);
    this.emit('rollback');
  }

  idShort() {
    return this.ID.substring(0, 6);
  }
};
