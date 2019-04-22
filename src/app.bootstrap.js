/**
 * setup modules
 */
const knexFactory = require('knex');
const Redis = require('ioredis');
const { EventEmitter } = require('events');

const knexConfig = require('./adapters/knex/knexfile');

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
const rescoreFetchLimit = parseInt(process.env.RESCORE_TRADES_FETCH_LIMIT, 10) || 100;
const scoreUpdatesQueueUrl = process.env.SCORE_UPDATES_QUEUE_URL;

/**
 * setup adapters
 */
const RedisMutex = require('./adapters/RedisMutex');
const SQSQueue = require('./adapters/SQSQueue');
const ScoreUpdateScheduleRepo = require('./adapters/knex/ScoreUpdateScheduleRepo');

const UnitOfWorkFactory = require('./adapters/knex/UnitOfWorkFactory');
const ExchangeIngressRepoFactory = require('./adapters/knex/factories/ExchangeIngressRepoFactory');
const PortfolioRepoFactory = require('./adapters/knex/factories/PortfolioRepoFactory');
const OrderRepoFactory = require('./adapters/knex/factories/OrderRepoFactory');
const TransferRepoFactory = require('./adapters/knex/factories/TransferRepoFactory');
const ScoreRepoFactory = require('./adapters/knex/factories/ScoreRepoFactory');
const TradeRepoFactory = require('./adapters/knex/factories/TradeRepoFactory');

const exchangeIngressRepoFactory = new ExchangeIngressRepoFactory();
const portfolioRepoFactory = new PortfolioRepoFactory();
const orderRepoFactory = new OrderRepoFactory();
const transferRepoFactory = new TransferRepoFactory();
const traderScoreRepoFactory = new ScoreRepoFactory({ redis });
const tradeRepoFactory = new TradeRepoFactory();

const mutex = RedisMutex({ redis });
const scoreUpdateScheduleRepo = new ScoreUpdateScheduleRepo({ knexConn: knex });
const exchangeIngressRepo = exchangeIngressRepoFactory.create({ knexConn: knex });
const traderScoreRepo = traderScoreRepoFactory.create({ knexConn: knex, knex, redis });

/**
 * setup services
 */
let ExchangeService;
if (process.env.MOCK_EXCHANGE_SERVICE === 'true') {
  // eslint-disable-next-line global-require
  ExchangeService = require('./core/services/ExchangeService');
} else {
  // eslint-disable-next-line global-require
  ExchangeService = require('./core/services/__mocks__/ExchangeServiceDefault');
}
const TraderScoreMutex = require('./core/services/TraderScoreMutex');

const PortfolioServiceFactory = require('./adapters/knex/factories/PortfolioServiceFactory');
const OrderServiceFactory = require('./adapters/knex/factories/OrderServiceFactory');
const TransferServiceFactory = require('./adapters/knex/factories/TransferServiceFactory');
const ScoreServiceFactory = require('./adapters/knex/factories/ScoreServiceFactory');
const EntryServiceFactory = require('./adapters/knex/factories/EntryServiceFactory');
const TradeServiceFactory = require('./adapters/knex/factories/TradeServiceFactory');

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

const entryServiceFactory = new EntryServiceFactory({
  getEntriesLimitPerFetch,
  exchangeService,
  orderServiceFactory,
  transferServiceFactory,
});

const tradeServiceFactory = new TradeServiceFactory({
  numRecentTrades,
  rescoreFetchLimit,
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
const CalculateTraderScore = require('./core/useCases/CalculateTraderScore');
const GetTopTraders = require('./core/useCases/GetTopTraders');
const GetTraderScoreHistory = require('./core/useCases/GetTraderScoreHistory');
const GetTradersRank = require('./core/useCases/GetTradersRank');
const IngressDeposit = require('./core/useCases/IngressDeposit');
const IngressFilledOrder = require('./core/useCases/IngressFilledOrder');
const IngressWithdrawal = require('./core/useCases/IngressWithdrawal');
const IngressTraderExchange = require('./core/useCases/IngressTraderExchange');
const RemoveTraderExchange = require('./core/useCases/RemoveTraderExchange');

const calcTraderScoreUOWFactory = new UnitOfWorkFactory({
  knex,
  events,
  serviceFactories: {
    scoreService: scoreServiceFactory,
  },
});
const calculateTraderScore = new CalculateTraderScore({
  unitOfWorkFactory: calcTraderScoreUOWFactory,
});

const getTopTraders = new GetTopTraders({
  traderScoreRepo,
  allowedPeriods: scorePeriodConfig.map(config => config.id),
});

const getTraderScoreHistory = new GetTraderScoreHistory({ traderScoreRepo });

const getTradersRank = new GetTradersRank({ traderScoreRepo });

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

const ingressExchangeUOWFactory = new UnitOfWorkFactory({
  knex,
  events,
  serviceFactories: {
    scoreService: scoreServiceFactory,
    tradeService: tradeServiceFactory,
    exchangeIngressRepo: exchangeIngressRepoFactory,
  },
});
const ingressTraderExchange = new IngressTraderExchange({
  ingressDeposit,
  ingressFilledOrder,
  ingressWithdrawal,
  exchangeService,
  orderService,
  transferService,
  exchangeActivityLimitPerFetch: exchangeActivityFetchLimit,
  unitOfWorkFactory: ingressExchangeUOWFactory,
});

const removeTraderExchange = new RemoveTraderExchange({ exchangeIngressRepo });

/**
 * setup controllers
 */
const MoveDueScoreUpdatesQueue = require('./core/controllers/MoveDueScoreUpdatesQueue');

const scoreUpdatesQueue = new SQSQueue({ queueUrl: scoreUpdatesQueueUrl });
const moveDueScoreUpdatesQueue = new MoveDueScoreUpdatesQueue({
  scoreUpdateScheduleRepo,
  scoreUpdatesQueue,
});

/**
 * setup hooks
 */
const OnTradeScheduleScoreUpdates = require('./core/hooks/OnTradeScheduleScoreUpdates');

const onTradeScheduleScoreUpdates = new OnTradeScheduleScoreUpdates({
  scoreUpdateScheduleRepo,
  traderScorePeriodConfig: scorePeriodConfig,
  events,
});

onTradeScheduleScoreUpdates.watch();

/**
 * export config
 */
module.exports = {
  useCases: {
    getTopTraders: getTopTraders.execute.bind(getTopTraders),
    getTraderScoreHistory: getTraderScoreHistory.execute.bind(getTraderScoreHistory),
    getTradersRank: getTradersRank.execute.bind(getTradersRank),
    ingressDeposit: ingressDeposit.execute.bind(ingressDeposit),
    ingressFilledOrder: ingressFilledOrder.execute.bind(ingressFilledOrder),
    ingressWithdrawal: ingressWithdrawal.execute.bind(ingressWithdrawal),
    ingressTraderExchange: ingressTraderExchange.execute.bind(ingressTraderExchange),
    removeTraderExchange: removeTraderExchange.execute.bind(removeTraderExchange),
    calculateTraderScore: calculateTraderScore.execute.bind(calculateTraderScore),
  },
  controllers: {
    moveDueScoreUpdatesQueue: moveDueScoreUpdatesQueue.execute.bind(moveDueScoreUpdatesQueue),
  },
};
