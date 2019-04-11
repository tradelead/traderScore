const AWS = require('aws-sdk');
const SQSQueue = require('./SQSQueue');

const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15' });
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

const testName = `sqsQueue-test-${Date.now()}`;
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
        },
      },
      Outputs: {
        QueueUrl: {
          Value: { Ref: 'TestQueue' },
        },
      },
    }),
  };

  const res = await cloudformation.createStack(stackParams).promise();
  stackId = res.StackId;
  console.log(`Create Stack Requested: ${stackId}`);

  await cloudformation.waitFor('stackCreateComplete', { StackName: stackId }).promise();
  console.log(`Stack Created: ${stackId}`);

  const { Stacks } = await cloudformation.describeStacks({ StackName: stackId }).promise();
  queueUrl = Stacks[0].Outputs.find(Output => Output.OutputKey === 'QueueUrl').OutputValue;
  console.log(`New Queue Url: ${queueUrl}`);
}, 60 * 1000);

afterAll(async () => {
  const res = await cloudformation.deleteStack({ StackName: stackId }).promise();
  console.log('Delete Stack Requested:', res);
});

beforeEach(() => {
  queue = new SQSQueue({ queueUrl });
});

it('works', async () => {
  const data = { test: 1 };
  queue.push(data);

  const { Messages } = await sqs.receiveMessage({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 5,
  }).promise();

  const obj = JSON.parse(Messages[0].Body);
  expect(obj).toEqual(data);
});
