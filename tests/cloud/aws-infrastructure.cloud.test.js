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

it('works', async () => {
  // 1. Push to NewTraderExchangeTopic

  // 2. (wait 5 secs) Verify Score is Greater Than 0

  // 3. Push to NewSuccessfulDepositTopic

  // 4. Push to NewFilledOrderTopic (order has 30 seconds before day period drop off)

  // 5. (wait 5 secs) Verify Score Increase Has Increased

  // 6. (wait 75 secs) Verify Day Score Decreased

  // 7. Push to NewSuccessfulWithdrawalTopic

  // 8. (wait 5 secs) Verify Score Increase Has Increased

  // 9. Push to RemoveTraderExchangeTopic

  // 10. Push to NewSuccessfulDepositTopic & NewFilledOrderTopic

  // 11. (wait 5 secs) Verify Score is the same
});
