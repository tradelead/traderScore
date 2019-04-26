const AWS = require('aws-sdk');
const https = require('https');
const argv = require('minimist')(process.argv.slice(2));
const expireOldSSHRules = require('./expireOldSSHRules');

const StackName = argv['stack-name'];

if (!StackName) {
  console.error('Must pass arg --stack-name');
}

function getIP() {
  return new Promise((resolve, reject) => {
    https.get('https://api.ipify.org/', (res) => {
      res.on('data', (d) => {
        resolve(d.toString());
      });
    }).on('error', e => reject(e));
  });
}

(async () => {
  const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15' });
  const { Stacks } = await cloudformation.describeStacks({ StackName }).promise();
  const outputs = Stacks[0].Outputs.reduce((acc, Output) => {
    acc[Output.OutputKey] = Output.OutputValue;
    return acc;
  }, {});

  const natSGID = outputs.NATSecurityGroup;

  const ip = await getIP();

  // Authorize IP for SSH
  const ec2 = new AWS.EC2({ apiVersion: '2016-11-15' });
  const authorizeParams = {
    GroupId: natSGID,
    IpPermissions: [{
      FromPort: 22,
      IpProtocol: 'tcp',
      IpRanges: [{
        CidrIp: `${ip}/32`,
        Description: `Generated By CLI: ${Date.now() + (12 * 60 * 60 * 1000)}`,
      }],
      ToPort: 22,
    }],
  };
  try {
    await ec2.authorizeSecurityGroupIngress(authorizeParams).promise();
  } catch (e) {
    if (e.name !== 'InvalidPermission.Duplicate') {
      throw e;
    }

    console.log('Already Exists, Update Expiration');
    await ec2.updateSecurityGroupRuleDescriptionsIngress(authorizeParams).promise();
  }

  console.log(`${ip} has been whitelisted for ${StackName}:${natSGID}`);

  // Expire Old Rules
  await expireOldSSHRules(natSGID);
})();
