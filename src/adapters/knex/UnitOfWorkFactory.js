const BufferedEventEmitter = require('../../utilities/BufferedEventEmitter');
const KnexUnitOfWork = require('./UnitOfWork');
const KnexTrxFactory = require('./KnexTrxFactory');

module.exports = class KnexUnitOfWorkFactory {
  constructor(knex, serviceFactories, eventEmitter) {
    this.knex = knex;
    this.serviceFactories = serviceFactories;
    this.eventEmitter = eventEmitter;
  }

  async create() {
    const trx = await new KnexTrxFactory({ knex: this.knex }).create();
    const uow = new KnexUnitOfWork(trx);
    const uowEvents = new BufferedEventEmitter(this.eventEmitter);

    await Promise.all(Object.keys(this.serviceFactories).map(async (key) => {
      uow[key] = await this.serviceFactories[key].create({
        knexConn: trx,
        events: uowEvents,
        unitOfWork: uow,
      });
    }));

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

    return uow;
  }
};
