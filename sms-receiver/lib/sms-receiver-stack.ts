import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import os from "os";

export class SmsReceiverStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const stageName = 'dev';

        const vpc = ec2.Vpc.fromLookup(this, 'vpc', {vpcId: 'vpc-01ba7e04e8d32d5c4'});
        const subnet = ec2.Subnet.fromSubnetId(this, 'subnet', 'subnet-057bef8492aac53c1');
        const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'SG', 'sg-0ad8352321d6850f3');

        const REDIS_URL = ssm.StringParameter.fromStringParameterName(
            this,
            'SCRAPING_REDIS_URL',
            `/cdk/bznav-care/${stageName}/secrets/SCRAPING_REDIS_URL`
        );

        const architecture = os.arch() === 'arm64' ? lambda.Architecture.ARM_64 : lambda.Architecture.X86_64;

        const lambdaFn = new lambda.Function(this, 'SmsReceiverLambda', {
            functionName: `SmsReceiverFunction-${stageName}`,
            runtime: lambda.Runtime.NODEJS_22_X,
            handler: 'main.handler',
            code: lambda.Code.fromAsset('lambda'),
            architecture: architecture,
            vpc: vpc,
            vpcSubnets: {subnets: [subnet]},
            securityGroups: [securityGroup],
            environment: {
                REDIS_URL: REDIS_URL.stringValue,
            },
            timeout: cdk.Duration.minutes(1),
            memorySize: 512,
        });

        lambdaFn.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ssm:GetParameter'],
            resources: [
                REDIS_URL.parameterArn,
            ],
        }));

        const api = new apigateway.LambdaRestApi(this, 'SmsReceiverApi', {
            handler: lambdaFn,
            proxy: true,
            deployOptions: {
                stageName: stageName,
            },
        });

        new cdk.CfnOutput(this, 'ApiUrl', {
            value: api.url,
        });
    }
}
