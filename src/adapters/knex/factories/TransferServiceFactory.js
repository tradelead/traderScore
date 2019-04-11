const TransferService = require('../../../core/services/TransferService');

module.exports = class TransferServiceFactory {
  constructor({
    transferRepoFactory,
    portfolioServiceFactory,
  }) {
    this.transferRepoFactory = transferRepoFactory;
    this.portfolioServiceFactory = portfolioServiceFactory;
  }

  create(req) {
    const newReq = Object.assign({}, req);
    newReq.portfolioService = this.portfolioServiceFactory.create(req);
    newReq.transferRepo = this.transferRepoFactory.create(req);
    return new TransferService(newReq);
  }
};
