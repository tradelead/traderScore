from troposphere import Tags, ImportValue, Parameter, Sub, GetAtt, Ref, Join
from troposphere import Template
from troposphere import serverless, awslambda, sqs, sns

t = Template()
t.add_version('2010-09-09')
t.add_transform('AWS::Serverless-2016-10-31')

# Parameters

t.add_parameter(Parameter('NetworkStack', Type='String'))
t.add_parameter(Parameter('DBStack', Type='String'))
t.add_parameter(Parameter('TraderExchangeWatchStack', Type='String'))
t.add_parameter(Parameter('AccountStack', Type='String'))
t.add_parameter(Parameter('MySQLDbName', Type='String'))
t.add_parameter(Parameter('MySQLUser', Type='String'))
t.add_parameter(Parameter('MySQLPass', Type='String'))

# Lambda Variables

lambdaSrcPath = '../src/lambda/'
nodeRuntime = 'nodejs8.10'

lambdaVpcConfig = awslambda.VPCConfig(
    None, 
    SecurityGroupIds=[
        ImportValue(Sub('${DBStack}-RDS-Access-SG-ID')), 
        ImportValue(Sub('${DBStack}-Redis-Access-SG-ID')),
    ], 
    SubnetIds=[ImportValue(Sub('${NetworkStack}-SubnetID'))],
)

importRedisAddress = ImportValue(Sub('${DBStack}-Redis-Address'))
importRedisPort = ImportValue(Sub('${DBStack}-Redis-Port'))
lambdaEnvVars = {
    'DATABASE_PORT': ImportValue(Sub('${DBStack}-MySQL-Port')),
    'DATABASE_HOST': ImportValue(Sub('${DBStack}-MySQL-Address')),
    'DATABASE_NAME': Ref('MySQLDbName'),
    'DATABASE_USER': Ref('MySQLUser'),
    'DATABASE_PASSWORD': Ref('MySQLPass'),
    'DATABASE_POOL_MIN': 1,
    'DATABASE_POOL_MAX': 2,
    'REDIS_URL': Join('', ['redis://', importRedisAddress, ':', importRedisPort]),
    'SCORE_PERIOD_CONFIG': '[{"id":"day","duration":86400000},{"id":"week","duration":604800000}]',
    'SCORE_UPDATES_QUEUE_URL': Ref('ScoreUpdatesQueue')
}

# Setup Resources

graphQL = serverless.Function('GraphQL')
graphQL.Runtime = nodeRuntime
graphQL.CodeUri = lambdaSrcPath
graphQL.Handler = 'GraphQL.handler'
graphQL.Events = {
    'API': {
        'Type': 'Api',
        'Properties': {
            'Path': '/graphql',
            'Method': 'post'
        }
    }
}
graphQL.VpcConfig = lambdaVpcConfig
graphQL.Environment = awslambda.Environment(None, Variables = lambdaEnvVars)
t.add_resource(graphQL)

def createSQSConsumer(name, snsTopic=None):
    res = {}

    # create queue
    res['QueueName'] = name + 'Queue'
    queue = sqs.Queue(res['QueueName'])
    queueArn = GetAtt(res['QueueName'], 'Arn')
    t.add_resource(queue)
    

    # create subscription
    if (snsTopic) :
        res['SubscriptionName'] = name + 'Subscription'
        subscription = sns.SubscriptionResource(res['SubscriptionName'])
        subscription.TopicArn = snsTopic
        subscription.Endpoint = queueArn
        subscription.Protocol = 'sqs'
        subscription.RawMessageDelivery = 'true'
        t.add_resource(subscription)

    # create consumer function
    res['FunctionName'] = name + 'Consumer'
    consumer = serverless.Function(res['FunctionName'])
    consumer.Runtime = nodeRuntime
    consumer.CodeUri = lambdaSrcPath
    consumer.Handler = name + '.handler'
    consumer.Events = {
        'SQSTrigger': {
            'Type': 'SQS',
            'Properties': {
                'Queue': queueArn,
                'BatchSize': 10
            }
        }
    }
    consumer.Policies = [
        {
            'Version': '2012-10-17',
            'Statement': [{
                'Effect': 'Allow',
                'Action': ['sqs:ReceiveMessage', 'sqs:ChangeMessageVisibility', 'sqs:DeleteMessage'],
                'Resource': GetAtt(res['QueueName'], 'Arn')
            }],
        }
    ]
    consumer.VpcConfig = lambdaVpcConfig
    consumer.Environment = awslambda.Environment(None, Variables = lambdaEnvVars)
    t.add_resource(consumer)

    return res

createSQSConsumer('NewFilledOrder', ImportValue(Sub('${TraderExchangeWatchStack}-NewFilledOrderTopicArn')))
createSQSConsumer('NewSuccessfulDeposit', ImportValue(Sub('${TraderExchangeWatchStack}-NewSuccessfulDepositTopicArn')))
createSQSConsumer('NewSuccessfulWithdrawal', ImportValue(Sub('${TraderExchangeWatchStack}-NewSuccessfulWithdrawalTopicArn')))
createSQSConsumer('NewTraderExchange', ImportValue(Sub('${AccountStack}-NewTraderExchangeTopicArn')))
createSQSConsumer('RemoveTraderExchange', ImportValue(Sub('${AccountStack}-RemoveTraderExchangeTopicArn')))

scoreUpdatesRes = createSQSConsumer('ScoreUpdates')

moveDueScoreUpdatesToQueue = serverless.Function('MoveDueScoreUpdatesToQueue')
moveDueScoreUpdatesToQueue.Runtime = nodeRuntime
moveDueScoreUpdatesToQueue.CodeUri = lambdaSrcPath
moveDueScoreUpdatesToQueue.Handler = 'MoveDueScoreUpdatesToQueue.handler'
moveDueScoreUpdatesToQueue.Events = {
    'CronJob': {
        'Type': 'Schedule',
        'Properties': {
            'Schedule': 'rate(1 minute)',
        }
    }
}
moveDueScoreUpdatesToQueue.Policies = [
    {
        'Version': '2012-10-17',
        'Statement': [{
            'Effect': 'Allow',
            'Action': ['sqs:SendMessage'],
            'Resource': GetAtt(scoreUpdatesRes['QueueName'], 'Arn')
        }],
    }
]
moveDueScoreUpdatesToQueue.VpcConfig = lambdaVpcConfig
moveDueScoreUpdatesToQueue.Environment = awslambda.Environment(None, Variables = lambdaEnvVars)
t.add_resource(moveDueScoreUpdatesToQueue)

# Save File

with open('template.yml', 'w') as f:
    f.write(t.to_yaml())
