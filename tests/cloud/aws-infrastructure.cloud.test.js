const AWS = require('aws-sdk');
const ApolloClient = require('apollo-client');

const NewTraderExchangeTopicArn = process.env.NEW_TRADER_EXCHANGE_TOPIC_ARN;
const NewSuccessfulDepositTopicArn = process.env.NEW_SUCCESSFUL_DEPOSIT_TOPIC_ARN;
const NewFilledOrderTopicArn = process.env.NEW_FILLED_ORDER_TOPIC_ARN;
const NewSuccessfulWithdrawalTopicArn = process.env.NEW_SUCCESSFUL_WITHDRAWAL_TOPIC_ARN;
const RemoveTraderExchangeTopicArn = process.env.REMOVE_TRADER_EXCHANGE_TOPIC_ARN;
const GraphQLAPIURL = process.env.GRAPHQL_API_URL;

const sns = new AWS.SNS({ apiVersion: '2010-03-31' });
const gqlClient = new ApolloClient({ uri: GraphQLAPIURL });

async function snsPublish(TopicArn, data) {
  const args = { TopicArn, MessageAttributes: { DataType: 'String' } };
  args.Message = JSON.stringify(data);
  return sns.publish(args).promise();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getTraderScore(traderID, period) {
  const periodQuery = (period ? `period: "${period}"` : null);
  const res = await gqlClient(`
    {
      getTrader(id: "${traderID}") { 
        rank,
        scores(input: { 
          limit: 1
          ${periodQuery}
        }) {
          score
        }
      }
    }
  `);

  if (res.errors) {
    const e = new Error('Couldn\'t get trader score');
    e.info = res.errors;
    throw e;
  }

  if (res.getTrader.scores[0]) {
    return res.getTrader.scores[0].score;
  }

  return null;
}

it('works', async () => {
  let score;
  let prevScore;

  const traderID = 'trader1';
  const exchangeID = 'binance';

  // 1. Push to NewTraderExchangeTopic
  await snsPublish(NewTraderExchangeTopicArn, {
    traderID,
    exchangeID,
  });

  // 2. (wait 5 secs) Verify Score is Greater Than 1
  await sleep(2000);
  score = await getTraderScore('trader1');
  expect(score).toBeGreaterThan(1);
  prevScore = score;

  // 3. Push to NewSuccessfulDepositTopic
  await snsPublish(NewSuccessfulDepositTopicArn, {
    traderID,
    exchangeID,
    sourceID: 'transfer1',
    asset: 'USDT',
    time: Date.now() - (2 * 24 * 60 * 60 * 1000),
    quantity: 1551.0729615,
  });

  // 4. Push to NewFilledOrderTopic (order has 30 seconds before day period drop off)
  await snsPublish(NewFilledOrderTopicArn, {
    traderID: 'trader1',
    sourceID: 'order1',
    exchangeID: 'binance',
    side: 'buy',
    asset: 'ETH',
    quoteAsset: 'USDT',
    time: Date.now() - (24 * 60 * 60 * 1000) + (30 * 1000),
    quantity: 12.345,
    price: 123.4567,
    fee: {
      quantity: 27,
      asset: 'USDT',
    },
  });

  // 5. (wait 5 secs) Verify Score Increase Has Increased
  await sleep(2000);
  score = await getTraderScore('trader1');
  expect(score).toBeGreaterThan(prevScore);
  prevScore = score;
  const prevDayScore = await getTraderScore('trader1', 'day');

  // 6. (wait 60 secs) Verify Day Score Decreased
  await sleep(60000);
  const dayScore = await getTraderScore('trader1', 'day');
  expect(dayScore).toBeLessThan(prevDayScore);

  // 7. Push to NewSuccessfulWithdrawalTopic
  await snsPublish(NewSuccessfulWithdrawalTopicArn, {
    traderID: 'trader1',
    sourceID: 'transfer2',
    exchangeID: 'binance',
    asset: 'ETH',
    time: Date.now(),
    quantity: 12.345,
  });

  // 8. (wait 5 secs) Verify Score Increase Has Increased
  await sleep(2000);
  score = await getTraderScore('trader1');
  expect(score).toBeGreaterThan(prevScore);
  prevScore = score;

  // 9. Push to RemoveTraderExchangeTopic
  await snsPublish(RemoveTraderExchangeTopicArn, {
    traderID,
    exchangeID,
  });

  // 10. (wait 5 secs) Push to NewSuccessfulDepositTopic & NewFilledOrderTopic
  await sleep(2000);

  await snsPublish(NewSuccessfulDepositTopicArn, {
    traderID,
    exchangeID,
    sourceID: 'transfer3',
    asset: 'USDT',
    time: Date.now() - (2 * 24 * 60 * 60 * 1000),
    quantity: 1551.0729615,
  });

  await snsPublish(NewFilledOrderTopicArn, {
    traderID: 'trader1',
    sourceID: 'order2',
    exchangeID: 'binance',
    side: 'buy',
    asset: 'ETH',
    quoteAsset: 'USDT',
    time: Date.now() - (24 * 60 * 60 * 1000) + (30 * 1000),
    quantity: 12.345,
    price: 123.4567,
    fee: {
      quantity: 27,
      asset: 'USDT',
    },
  });

  // 11. (wait 5 secs) Verify Score is the same
  await sleep(2000);
  score = await getTraderScore('trader1');
  expect(score).toEqual(prevScore);
});
