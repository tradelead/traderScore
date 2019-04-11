const EntryService = require('../../../core/services/EntryService');

module.exports = class EntryServiceFactory {
  constructor({
    getEntriesLimitPerFetch,
    exchangeService,
    orderServiceFactory,
    transferServiceFactory,
  }) {
    this.getEntriesLimitPerFetch = getEntriesLimitPerFetch;
    this.exchangeService = exchangeService;
    this.orderServiceFactory = orderServiceFactory;
    this.transferServiceFactory = transferServiceFactory;
  }

  create(req) {
    const newReq = Object.assign({}, req);
    newReq.getEntriesLimitPerFetch = this.getEntriesLimitPerFetch;
    newReq.exchangeService = this.exchangeService;
    newReq.orderService = this.orderServiceFactory.create(req);
    newReq.transferService = this.transferServiceFactory.create(req);
    return new EntryService(newReq);
  }
};
