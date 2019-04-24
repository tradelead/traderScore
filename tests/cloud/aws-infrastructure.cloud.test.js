const AWS = require('aws-sdk');
const { createApolloFetch } = require('apollo-fetch');

const NewTraderExchangeTopicArn = process.env.NEW_TRADER_EXCHANGE_TOPIC_ARN;
const NewSuccessfulDepositTopicArn = process.env.NEW_SUCCESSFUL_DEPOSIT_TOPIC_ARN;
const NewFilledOrderTopicArn = process.env.NEW_FILLED_ORDER_TOPIC_ARN;
const NewSuccessfulWithdrawalTopicArn = process.env.NEW_SUCCESSFUL_WITHDRAWAL_TOPIC_ARN;
const RemoveTraderExchangeTopicArn = process.env.REMOVE_TRADER_EXCHANGE_TOPIC_ARN;
const GraphQLAPIURL = process.env.GRAPHQL_API_URL;

const sns = new AWS.SNS({ apiVersion: '2010-03-31' });
const gqlFetch = createApolloFetch({ uri: GraphQLAPIURL });

async function snsPublish(TopicArn, data) {
  const args = { TopicArn, Message: JSON.stringify(data) };
  return sns.publish(args).promise();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getTraderScore(traderID, period) {
  const periodQuery = (period ? `period: "${period}"` : '');
  const query = `{
    getTrader(id: "${traderID}") { 
      rank,
      scores(input: { 
        limit: 1
        ${periodQuery}
      }) {
        score
      }
    }
  }`;
  const { data, errors } = await gqlFetch({ query });

  if (errors) {
    const e = new Error('Couldn\'t get trader score');
    e.info = errors;
    console.error(errors);
    throw e;
  }

  if (data.getTrader.scores[0]) {
    console.log(data.getTrader.scores[0].score);
    return data.getTrader.scores[0].score;
  }

  console.log(data);

  return null;
}

it('works', async () => {
  let score;
  let prevScore;

  const traderID = `trader${parseInt(Math.random() * 10000, 10)}`;
  const exchangeID = 'binance';

  console.log(`traderID: ${traderID}`);

  // 1. Push to NewTraderExchangeTopic
  await snsPublish(NewTraderExchangeTopicArn, {
    traderID,
    exchangeID,
  });

  // 2. Verify Score is Greater Than 1
  await sleep(10000);
  score = await getTraderScore(traderID);
  expect(score).toBeGreaterThan(1);
  prevScore = score;

  // 3. Push to NewSuccessfulDepositTopic
  await snsPublish(NewSuccessfulDepositTopicArn, {
    traderID,
    exchangeID,
    sourceID: 'transfer3',
    asset: 'USDT',
    time: Date.now() - (2 * 24 * 60 * 60 * 1000),
    quantity: 1551.0729615,
  });
  await sleep(10000);

  // 4. Push to NewFilledOrderTopic (order has 30 seconds before day period drop off)
  await snsPublish(NewFilledOrderTopicArn, {
    traderID,
    exchangeID,
    sourceID: 'order2',
    side: 'buy',
    asset: 'ETH',
    quoteAsset: 'USDT',
    time: Date.now() - (1.5 * 24 * 60 * 60 * 1000),
    quantity: 12.345,
    price: 123.4567,
    fee: {
      quantity: 27,
      asset: 'USDT',
    },
  });
  await sleep(10000);

  // 5. Push to NewSuccessfulWithdrawalTopic
  await snsPublish(NewSuccessfulWithdrawalTopicArn, {
    traderID,
    exchangeID,
    sourceID: 'transfer4',
    asset: 'ETH',
    time: Date.now() - (24 * 60 * 60 * 1000) + (30 * 1000),
    quantity: 12.345,
  });

  // 6. Verify Score Increase Has Increased
  await sleep(10000);
  score = await getTraderScore(traderID);
  expect(score).toBeGreaterThan(prevScore);
  prevScore = score;
  const prevDayScore = await getTraderScore(traderID, 'day');

  // 7. (wait 60 secs) Verify Day Score Decreased
  await sleep(60000);
  const dayScore = await getTraderScore(traderID, 'day');
  expect(dayScore).toBeLessThan(prevDayScore);

  // 8. Push to RemoveTraderExchangeTopic
  await snsPublish(RemoveTraderExchangeTopicArn, {
    traderID,
    exchangeID,
  });

  // 9. Push to NewSuccessfulDepositTopic & NewFilledOrderTopic & NewSuccessfulWithdrawalTopicArn
  await sleep(10000);

  await snsPublish(NewSuccessfulDepositTopicArn, {
    traderID,
    exchangeID,
    sourceID: 'transfer5',
    asset: 'USDT',
    time: Date.now() - (2 * 24 * 60 * 60 * 1000),
    quantity: 1551.0729615,
  });

  await sleep(10000);

  await snsPublish(NewFilledOrderTopicArn, {
    traderID,
    exchangeID,
    sourceID: 'order3',
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

  await sleep(10000);

  await snsPublish(NewSuccessfulWithdrawalTopicArn, {
    traderID,
    exchangeID,
    sourceID: 'transfer6',
    asset: 'ETH',
    time: Date.now(),
    quantity: 12.345,
  });

  // 11. Verify Score is the same
  await sleep(10000);
  score = await getTraderScore(traderID);
  expect(score).toEqual(prevScore);
}, 180000);
