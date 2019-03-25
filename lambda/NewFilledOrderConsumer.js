const sqsAsyncRecordHandler = require('./util/sqsAsyncRecordHandler');
const app = require('../app.config');

exports.NewFilledOrderConsumer = async function (event, context) {
  await sqsAsyncRecordHandler(event, context, async (payload, record) => {
    try {
      await app.core.useCases.ingressFilledOrder(payload);
    } catch (e) {
      console.error('Failed to ingress order', e, record);
      throw e;
    }
  });
};
