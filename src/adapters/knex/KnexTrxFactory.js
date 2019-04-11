module.exports = class KnexTrxFactory {
  constructor({ knex }) {
    this.knex = knex;
  }

  async create() {
    return new Promise((resolve, reject) => {
      let resolved = false;
      this.knex.transaction((trx) => {
        resolved = true;
        resolve(trx);
      }).catch((err) => {
        if (!resolved) {
          reject(err);
        }
      });
    });
  }
};
