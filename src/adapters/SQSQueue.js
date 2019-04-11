const AWS = require('aws-sdk');

const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

module.exports = class SQSQueue {
  constructor({ queueUrl }) {
    this.queueUrl = queueUrl;
  }

  async push(obj) {
    await sqs.sendMessage({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(obj),
    }).promise();
  }
};
