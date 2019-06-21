from troposphere import Tags, ImportValue, Parameter, Sub, GetAtt, Ref, Join
from troposphere import Template
from troposphere import serverless, awslambda, sqs, sns, iam

t = Template()
t.add_version('2010-09-09')
t.add_transform('AWS::Serverless-2016-10-31')

# Parameters

t.add_parameter(Parameter('CoreStack', Type='String'))
t.add_parameter(Parameter('MySQLDbName', Type='String'))
t.add_parameter(Parameter('MySQLUser', Type='String'))
t.add_parameter(Parameter('MySQLPass', Type='String'))
t.add_parameter(Parameter('NodeEnv', Type='String'))
t.add_parameter(Parameter('MockExchangeService', Type='String'))

# Lambda Variables

lambdaSrcPath = '../.'
lambdaHandlerPath = 'src/lambda/'
nodeRuntime = 'nodejs8.10'

lambdaVpcConfig = awslambda.VPCConfig(
    None, 
    SecurityGroupIds=[
        ImportValue(Sub('${CoreStack}-RDS-Access-SG-ID')), 
        ImportValue(Sub('${CoreStack}-Redis-Access-SG-ID')),
    ], 
    SubnetIds=[ImportValue(Sub('${CoreStack}-SubnetID'))],
)

importRedisAddress = ImportValue(Sub('${CoreStack}-Redis-Address'))
importRedisPort = ImportValue(Sub('${CoreStack}-Redis-Port'))
lambdaEnvVars = {
    'DATABASE_PORT': ImportValue(Sub('${CoreStack}-MySQL-Port')),
    'DATABASE_HOST': ImportValue(Sub('${CoreStack}-MySQL-Address')),
    'DATABASE_NAME': Ref('MySQLDbName'),
    'DATABASE_USER': Ref('MySQLUser'),
    'DATABASE_PASSWORD': Ref('MySQLPass'),
    'DATABASE_POOL_MIN': 1,
    'DATABASE_POOL_MAX': 2,
    'REDIS_URL': Join('', ['redis://', importRedisAddress, ':', importRedisPort]),
    'SCORE_PERIOD_CONFIG': '[{"id":"day","duration":86400000},{"id":"week","duration":604800000}]',
    'SCORE_UPDATES_QUEUE_URL': Ref('ScoreUpdatesQueue'),
    'NODE_ENV': Ref('NodeEnv'),
    'MOCK_EXCHANGE_SERVICE': Ref('MockExchangeService'),
}

# Setup Resources

graphQL = serverless.Function('GraphQL')
graphQL.Runtime = nodeRuntime
graphQL.CodeUri = lambdaSrcPath
graphQL.Handler = lambdaHandlerPath + 'GraphQL.handler'
graphQL.Events = {
    'API': {
        'Type': 'Api',
        'Properties': {
            'Path': '/graphql',
            'Method': 'post'
        }
    }
}
graphQL.Policies = ['arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole']
graphQL.VpcConfig = lambdaVpcConfig
graphQL.Environment = awslambda.Environment(None, Variables = lambdaEnvVars)
t.add_resource(graphQL)

def createSQSConsumer(name, timeout=5, snsTopic=None):
    res = {}

    # create queue
    res['QueueName'] = name + 'Queue'
    queue = t.add_resource(sqs.Queue(res['QueueName'], VisibilityTimeout = timeout*2))
    queueArn = GetAtt(res['QueueName'], 'Arn')    

    # create subscription
    if (snsTopic) :
        res['SubscriptionName'] = name + 'Subscription'
        subscription = t.add_resource(sns.SubscriptionResource(
            res['SubscriptionName'],
            TopicArn = snsTopic,
            Endpoint = queueArn,
            Protocol = 'sqs',
            RawMessageDelivery = 'true',
        ))

        t.add_resource(sqs.QueuePolicy(
            name + 'AllowSNS2SQSPolicy',
            Queues = [queue.Ref()],
            PolicyDocument = {
                "Version": "2008-10-17",
                "Id": "PublicationPolicy",
                "Statement": [{
                    "Sid": "Allow-SNS-SendMessage",
                    "Effect": "Allow",
                    "Principal": {
                        "AWS": "*"
                    },
                    "Action": ["sqs:SendMessage"],
                    "Resource": queue.GetAtt("Arn"),
                    "Condition": {
                        "ArnEquals": { "aws:SourceArn": snsTopic }
                    }
                }]
            }
        ))

    # create consumer function
    res['FunctionName'] = name + 'Consumer'
    consumer = t.add_resource(serverless.Function(
        res['FunctionName'],
        Runtime = nodeRuntime,
        CodeUri = lambdaSrcPath,
        Handler = lambdaHandlerPath + name + 'Consumer.handler',
        Timeout = timeout,
        Events = {
            'SQSTrigger': {
                'Type': 'SQS',
                'Properties': {
                    'Queue': queueArn,
                    'BatchSize': 10
                }
            }
        },
        Policies = [
            'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
            {
                'Version': '2012-10-17',
                'Statement': [{
                    'Effect': 'Allow',
                    'Action': ['sqs:ReceiveMessage', 'sqs:ChangeMessageVisibility', 'sqs:DeleteMessage'],
                    'Resource': GetAtt(res['QueueName'], 'Arn')
                }],
            }
        ],
        VpcConfig = lambdaVpcConfig,
        Environment = awslambda.Environment(None, Variables = lambdaEnvVars),
    ))

    return res

createSQSConsumer('NewFilledOrder', 10, ImportValue(Sub('${CoreStack}-NewFilledOrderTopicArn')))
createSQSConsumer('NewSuccessfulDeposit', 10, ImportValue(Sub('${CoreStack}-NewSuccessfulDepositTopicArn')))
createSQSConsumer('NewSuccessfulWithdrawal', 10, ImportValue(Sub('${CoreStack}-NewSuccessfulWithdrawalTopicArn')))

scoreUpdatesRes = createSQSConsumer('ScoreUpdates', 30)

moveDueScoreUpdatesToQueue = serverless.Function('MoveDueScoreUpdatesToQueue')
moveDueScoreUpdatesToQueue.Runtime = nodeRuntime
moveDueScoreUpdatesToQueue.CodeUri = lambdaSrcPath
moveDueScoreUpdatesToQueue.Timeout = 30
moveDueScoreUpdatesToQueue.Handler = lambdaHandlerPath + 'MoveDueScoreUpdatesToQueue.handler'
moveDueScoreUpdatesToQueue.Events = {
    'CronJob': {
        'Type': 'Schedule',
        'Properties': {
            'Schedule': 'rate(1 minute)',
        }
    }
}
moveDueScoreUpdatesToQueue.Policies = [
    'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
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
