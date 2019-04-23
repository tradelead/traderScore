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
        const VisibilityTimeout = heartbeatIntervalMs / 500;
        console.log('changeMessageVisibility', { QueueUrl, ReceiptHandle, VisibilityTimeout });
        await sqs.changeMessageVisibility({
          QueueUrl,
          ReceiptHandle,
          VisibilityTimeout,
        }).promise();
        console.log('END: changeMessageVisibility', { QueueUrl, ReceiptHandle, VisibilityTimeout });
      } catch (e) {
        console.error('error changing message visibility', e);
      }
    }, heartbeatIntervalMs);

    try {
      await fn(payload, record);

      console.log('Delete Message', { QueueUrl, ReceiptHandle });
      await sqs.deleteMessage({ QueueUrl, ReceiptHandle }).promise();
      console.log('END: Delete Message', { QueueUrl, ReceiptHandle });
    } catch (e) {
      throw e;
    } finally {
      clearInterval(heartbeatWatchID);
    }
  }));
};
