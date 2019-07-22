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
    const res = await this.trx.commit();
    console.log(res);
    debug(`complete ${this.idShort()}`);
    this.emit('complete');
    return res;
  }

  async rollback() {
    debug(`rollback ${this.idShort()}`);
    const res = await this.trx.rollback();
    this.emit('rollback');
    return res;
  }

  idShort() {
    return this.ID.substring(0, 6);
  }
};
