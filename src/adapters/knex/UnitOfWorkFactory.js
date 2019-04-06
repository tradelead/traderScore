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
        const uow = new KnexUnitOfWork(trx);
        const uowEvents = new BufferedEventEmitter(this.eventEmitter);

        Promise.all(Object.keys(this.serviceFactories).map(async (key) => {
          uow[key] = await this.serviceFactories[key].create({
            knexConn: trx,
            events: uowEvents,
            unitOfWork: uow,
          });
        }))
          .then(() => resolve(uow))
          .catch(e => reject(e));

        // Only one event will ever be called, therefore to prevent
        // a memory leak listeners call removeListener for the other.
        let uowRollbackListener;
        const uowCompleteListener = () => {
          uowEvents.removeListener('rollback', uowRollbackListener);
          uowEvents.flush();
        };
        uowRollbackListener = () => {
          uowEvents.removeListener('complete', uowCompleteListener);
        };
        uow.once('complete', uowCompleteListener);
        uow.once('rollback', uowRollbackListener);
      });
    });
  }
};
