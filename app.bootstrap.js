/**
 * setup modules
 */
const knexFactory = require('knex');
const Redis = require('ioredis');
const { EventEmitter } = require('events');

const knexConfig = require('./src/adapters/knex/knexfile');

const env = process.env.NODE_ENV || 'development';
const knex = knexFactory(knexConfig[env]);

const redis = new Redis(process.env.REDIS_URL);

const events = new EventEmitter();

/**
 * collect env vars
 */
const exchangeActivityFetchLimit = parseInt(process.env.EXCHANGE_ACTIVITY_FETCH_LIMIT, 10) || 100;
const getEntriesLimitPerFetch = parseInt(process.env.ENTRIES_FETCH_LIMIT, 10) || 100;
const tradeFetchLimit = parseInt(process.env.TRADE_FETCH_LIMIT, 10) || 100;
const scorePeriodConfig = JSON.parse(process.env.SCORE_PERIOD_CONFIG);
const numRecentTrades = parseInt(process.env.SCORE_RECENT_TRADES_NUM, 10) || 100;
const scoreUpdatesQueueUrl = process.env.SCORE_UPDATES_QUEUE_URL;

/**
 * setup adapters
 */
const RedisMutex = require('./src/adapters/RedisMutex');
const SQSQueue = require('./src/adapters/SQSQueue');
const ScoreUpdateScheduleRepo = require('./src/adapters/knex/ScoreUpdateScheduleRepo');

const UnitOfWorkFactory = require('./src/adapters/knex/UnitOfWorkFactory');
const ExchangeIngressRepoFactory = require('./src/adapters/knex/factories/ExchangeIngressRepoFactory');
const PortfolioRepoFactory = require('./src/adapters/knex/factories/PortfolioRepoFactory');
const OrderRepoFactory = require('./src/adapters/knex/factories/OrderRepoFactory');
const TransferRepoFactory = require('./src/adapters/knex/factories/TransferRepoFactory');
const ScoreRepoFactory = require('./src/adapters/knex/factories/ScoreRepoFactory');
const TradeRepoFactory = require('./src/adapters/knex/factories/TradeRepoFactory');

const exchangeIngressRepoFactory = new ExchangeIngressRepoFactory();
const portfolioRepoFactory = new PortfolioRepoFactory();
const orderRepoFactory = new OrderRepoFactory();
const transferRepoFactory = new TransferRepoFactory();
const traderScoreRepoFactory = new ScoreRepoFactory({ knex, redis });
const tradeRepoFactory = new TradeRepoFactory();

const mutex = RedisMutex({ redis });
const scoreUpdateScheduleRepo = new ScoreUpdateScheduleRepo({ knexConn: knex });
const exchangeIngressRepo = exchangeIngressRepoFactory.create({ knexConn: knex });
const traderScoreRepo = traderScoreRepoFactory.create({ knexConn: knex, knex, redis });

/**
 * setup services
 */
const ExchangeService = require('./src/core/services/ExchangeService');
const TraderScoreMutex = require('./src/core/services/TraderScoreMutex');

const PortfolioServiceFactory = require('./src/adapters/knex/factories/PortfolioServiceFactory');
const OrderServiceFactory = require('./src/adapters/knex/factories/OrderServiceFactory');
const TransferServiceFactory = require('./src/adapters/knex/factories/TransferServiceFactory');
const ScoreServiceFactory = require('./src/adapters/knex/factories/ScoreServiceFactory');
const EntryServiceFactory = require('./src/adapters/knex/factories/EntryServiceFactory');
const TradeServiceFactory = require('./src/adapters/knex/factories/TradeServiceFactory');

// TODO: inject exchangeAPIFactory, traderExchangeKeysRepo
const exchangeService = new ExchangeService({});

const traderScoreMutex = new TraderScoreMutex({ mutex });

const portfolioServiceFactory = new PortfolioServiceFactory({
  portfolioRepoFactory,
  exchangeService,
});

const orderServiceFactory = new OrderServiceFactory({
  orderRepoFactory,
  portfolioServiceFactory,
});
const orderService = orderServiceFactory.create({ knexConn: knex });

const transferServiceFactory = new TransferServiceFactory({
  transferRepoFactory,
  portfolioServiceFactory,
});
const transferService = transferServiceFactory.create({ knexConn: knex });

const scoreServiceFactory = new ScoreServiceFactory({
  traderScorePeriodConfig: scorePeriodConfig,
  traderScoreRepoFactory,
  traderScoreMutex,
  tradeRepoFactory,
  tradeFetchLimit,
});
const scoreService = scoreServiceFactory.create({ knexConn: knex });

const entryServiceFactory = new EntryServiceFactory({
  getEntriesLimitPerFetch,
  exchangeService,
  orderServiceFactory,
  transferServiceFactory,
});

const tradeServiceFactory = new TradeServiceFactory({
  numRecentTrades,
  tradeRepoFactory,
  exchangeService,
  portfolioServiceFactory,
  orderServiceFactory,
  transferServiceFactory,
  scoreServiceFactory,
  entryServiceFactory,
});

/**
 * setup use cases
 */
const GetTopTraders = require('./src/core/useCases/GetTopTraders');
const GetTraderScoreHistory = require('./src/core/useCases/GetTraderScoreHistory');
const IngressDeposit = require('./src/core/useCases/IngressDeposit');
const IngressFilledOrder = require('./src/core/useCases/IngressFilledOrder');
const IngressWithdrawal = require('./src/core/useCases/IngressWithdrawal');
const IngressTraderExchange = require('./src/core/useCases/IngressTraderExchange');
const RemoveTraderExchange = require('./src/core/useCases/RemoveTraderExchange');

const getTopTraders = new GetTopTraders({ traderScoreRepo, allowedPeriods: scorePeriodConfig });

const getTraderScoreHistory = new GetTraderScoreHistory({ traderScoreRepo });

const depositUOWFactory = new UnitOfWorkFactory({
  knex,
  events,
  serviceFactories: {
    exchangeIngressRepo: exchangeIngressRepoFactory,
    transferService: transferServiceFactory,
  },
});
const ingressDeposit = new IngressDeposit({ unitOfWorkFactory: depositUOWFactory });

const filledOrderUOWFactory = new UnitOfWorkFactory({
  knex,
  events,
  serviceFactories: {
    orderService: orderServiceFactory,
    tradeService: tradeServiceFactory,
    exchangeIngressRepo: exchangeIngressRepoFactory,
  },
});
const ingressFilledOrder = new IngressFilledOrder({ unitOfWorkFactory: filledOrderUOWFactory });

const withdrawalUOWFactory = new UnitOfWorkFactory({
  knex,
  events,
  serviceFactories: {
    transferService: transferServiceFactory,
    tradeService: tradeServiceFactory,
    exchangeIngressRepo: exchangeIngressRepoFactory,
  },
});
const ingressWithdrawal = new IngressWithdrawal({ unitOfWorkFactory: withdrawalUOWFactory });

const ingressTraderExchange = new IngressTraderExchange({
  ingressDeposit,
  ingressFilledOrder,
  ingressWithdrawal,
  exchangeService,
  orderService,
  transferService,
  exchangeActivityLimitPerFetch: exchangeActivityFetchLimit,
  exchangeIngressRepo,
  scoreService,
});

const removeTraderExchange = new RemoveTraderExchange({ exchangeIngressRepo });

/**
 * setup controllers
 */
const MoveDueScoreUpdatesQueue = require('./src/core/controllers/MoveDueScoreUpdatesQueue');

const scoreUpdatesQueue = new SQSQueue({ queueUrl: scoreUpdatesQueueUrl });
const moveDueScoreUpdatesQueue = new MoveDueScoreUpdatesQueue({
  scoreUpdateScheduleRepo,
  scoreUpdatesQueue,
});

/**
 * export config
 */
module.exports = {
  useCases: {
    getTopTraders: getTopTraders.execute.bind(getTopTraders),
    getTraderScoreHistory: getTraderScoreHistory.execute.bind(getTraderScoreHistory),
    ingressDeposit: ingressDeposit.execute.bind(ingressDeposit),
    ingressFilledOrder: ingressFilledOrder.execute.bind(ingressFilledOrder),
    ingressWithdrawal: ingressWithdrawal.execute.bind(ingressWithdrawal),
    ingressTraderExchange: ingressTraderExchange.execute.bind(ingressTraderExchange),
    removeTraderExchange: removeTraderExchange.execute.bind(removeTraderExchange),
  },
  controllers: {
    moveDueScoreUpdatesQueue: moveDueScoreUpdatesQueue.execute.bind(moveDueScoreUpdatesQueue),
  },
};
