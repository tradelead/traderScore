const BufferedEventEmitter = require('../../utilities/BufferedEventEmitter');
const KnexUnitOfWork = require('./UnitOfWork');

module.exports = class KnexUnitOfWorkFactory {
  constructor(knex, serviceFactories, eventEmitter) {
    this.knex = knex;
    this.serviceFactories = serviceFactories;
    this.eventEmitter = eventEmitter;
  }

  create() {
    return new Promise((resolve, reject) => {
      this.knex.transaction((trx) => {
        let uow = new KnexUnitOfWork(trx);
        let uowEvents = new BufferedEventEmitter(this.eventEmitter);

        Promise.all(Object.keys(this.serviceFactories).map(async (key) => {
          uow[key] = await this.serviceFactories[key].create(trx, uowEvents, uow);
        }))
          .then(() => resolve(uow))
          .catch(e => reject(e));

        uow.once('complete', () => {
          uowEvents.flush();
        });

        // prevent memory leak. otherwise complete listener would wait forever.
        uow.once('rollback', () => {
          uow = null;
          uowEvents = null;
        });
      });
    });
  }
};
