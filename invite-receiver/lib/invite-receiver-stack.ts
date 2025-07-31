import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import os from "os";

export class InviteReceiverStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const queue = new sqs.Queue(this, 'InviteReceiverQueue', {
      visibilityTimeout: cdk.Duration.seconds(10),
    });

    const architecture = os.arch() === 'arm64' ? lambda.Architecture.ARM_64 : lambda.Architecture.X86_64;

    const vpc = ec2.Vpc.fromLookup(this, 'vpc', { vpcId: 'vpc-01ba7e04e8d32d5c4' });
    const subnet = ec2.Subnet.fromSubnetId(this, 'subnet', 'subnet-057bef8492aac53c1');
    const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'SG', 'sg-0ad8352321d6850f3');

    const lambdaFn = new lambda.Function(this, 'InviteReceiverLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'main.handler',
      code: lambda.Code.fromAsset('lambda'),
      architecture: architecture,
      vpc: vpc,
      vpcSubnets: { subnets: [subnet] },
      securityGroups: [securityGroup],
      environment: {
        QUEUE_URL: queue.queueUrl,
      },
      timeout : cdk.Duration.minutes(1),
      memorySize: 512,
    });

    // Lambda에 SQS 전송 권한 부여
    queue.grantSendMessages(lambdaFn);

    // API Gateway 생성 및 Lambda 연결
    const api = new apigateway.LambdaRestApi(this, 'InviteReceiverApi', {
      handler: lambdaFn,
      proxy: true,
      deployOptions: {
        stageName: 'dev',
      },
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'QueueUrl', { value: queue.queueUrl });
  }
}
