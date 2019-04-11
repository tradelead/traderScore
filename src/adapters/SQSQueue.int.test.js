const AWS = require('aws-sdk');
const SQSQueue = require('./SQSQueue');

const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15' });
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

const testName = `sqsQueue.int.test-${Date.now()}`;
let stackId;
let queueUrl;
let queue;

beforeAll(async () => {
  const stackParams = {
    StackName: testName,
    Capabilities: ['CAPABILITY_IAM'],
    TemplateBody: JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        TestQueue: {
          Type: 'AWS::SQS::Queue',
          QueueName: testName,
        },
      },
    }),
  };

  const res = await cloudformation.createStack(stackParams).promise();
  stackId = res.StackId;
  queueUrl = await sqs.getQueueUrl({ QueueName: testName }).promise();
});

afterAll(async () => {
  await cloudformation.deleteStack({ StackName: stackId });
});

beforeEach(() => {
  queue = new SQSQueue({ queueUrl });
});

it('works', async () => {
  queue.push({ test: 1 });
});
