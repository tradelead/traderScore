const OrderService = require('../../../core/services/OrderService');

module.exports = class OrderServiceFactory {
  constructor({
    orderRepoFactory,
    portfolioServiceFactory,
  }) {
    this.orderRepoFactory = orderRepoFactory;
    this.portfolioServiceFactory = portfolioServiceFactory;
  }

  create(req) {
    const newReq = Object.assign({}, req);
    newReq.portfolioService = this.portfolioServiceFactory.create(req);
    newReq.orderRepo = this.orderRepoFactory.create(req);
    return new OrderService(newReq);
  }
};
