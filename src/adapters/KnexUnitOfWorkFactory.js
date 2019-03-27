const KnexUnitOfWork = require('./KnexUnitOfWork');

module.exports = class KnexUnitOfWorkFactory {
  constructor(knex, serviceFactories) {
    this.knex = knex;
    this.serviceFactories = serviceFactories;
  }

  create() {
    return new Promise((resolve, reject) => {
      this.knex.transaction((trx) => {
        const uow = new KnexUnitOfWork(trx);

        Promise.all(Object.keys(this.serviceFactories).map(async (key) => {
          uow[key] = await this.serviceFactories[key].create(trx);
        }))
          .then(() => resolve(uow))
          .catch(e => reject(e));
      });
    });
  }
};
