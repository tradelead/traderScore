const AWS = require('aws-sdk');

module.exports = async function (event, context, fn) {
  AWS.config.setPromisesDependency(Promise);
  const sqs = new AWS.SQS();

  await Promise.all(event.Records.map(async (record) => {
    const { body } = record;
    const payload = JSON.parse(body);

    const accountId = record.eventSourceARN.split(':')[4];
    const queueName = record.eventSourceARN.split(':')[5];
    const QueueUrl = `${sqs.endpoint.href + accountId}/${queueName}`;
    const ReceiptHandle = record.receiptHandle;

    let heartbeatIntervalMs = 15000;
    if (process.env.SQS_VISIBILITY_HEARTBEAT > 0) {
      heartbeatIntervalMs = process.env.SQS_VISIBILITY_HEARTBEAT;
    }

    const heartbeatWatchID = setInterval(async () => {
      try {
        await sqs.changeMessageVisibility({
          QueueUrl,
          ReceiptHandle,
          VisibilityTimeout: heartbeatIntervalMs / 500,
        }).promise();
      } catch (e) {
        console.error('error changing message visibility', e);
      }
    }, heartbeatIntervalMs);

    try {
      await fn(payload, record);
    } catch (e) {
      throw e;
    } finally {
      clearInterval(heartbeatWatchID);
    }

    await sqs.deleteMessage({ QueueUrl, ReceiptHandle }).promise();
  }));
};
