const sqsAsyncRecordHandler = require('./util/sqsAsyncRecordHandler');
const app = require('../app.bootstrap');

exports.NewFilledOrderConsumer = async function (event, context) {
  await sqsAsyncRecordHandler(event, context, async (payload, record) => {
    try {
      await app.useCases.ingressFilledOrder(payload);
    } catch (e) {
      console.error('Failed to ingress order', e, record);
      throw e;
    }
  });
};
