import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as os from 'os';

interface SmartstoreSubAccountVatCdkStackProps extends cdk.StackProps {
  stageName: string;
}

export class SmartstoreSubAccountVatCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SmartstoreSubAccountVatCdkStackProps) {
    super(scope, id, props);

    const stageName = props.stageName

    const vpc = ec2.Vpc.fromLookup(this, 'vpc', { vpcId: 'vpc-01ba7e04e8d32d5c4' });
    const subnet = ec2.Subnet.fromSubnetId(this, 'subnet', 'subnet-057bef8492aac53c1');
    const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'SG', 'sg-0ad8352321d6850f3');

    const architecture = os.arch() === 'arm64' ? lambda.Architecture.ARM_64 : lambda.Architecture.X86_64;

    const REDIS_URL = ssm.StringParameter.fromStringParameterName(
        this,
        'SCRAPING_REDIS_URL',
        `/cdk/bznav-care/${stageName}/secrets/SCRAPING_REDIS_URL`
    );

    const DB_HOST = ssm.StringParameter.fromStringParameterName(
        this,
        'SCRAPING_DB_HOST',
        `/cdk/bznav-care/${stageName}/secrets/SCRAPING_DB_HOST`
    );

    const DB_USERNAME = ssm.StringParameter.fromStringParameterName(
        this,
        'SCRAPING_DB_USERNAME',
        `/cdk/bznav-care/${stageName}/secrets/SCRAPING_DB_USERNAME`
    );

    const DB_PASSWORD = ssm.StringParameter.fromStringParameterName(
        this,
        'SCRAPING_DB_PASSWORD',
        `/cdk/bznav-care/${stageName}/secrets/SCRAPING_DB_PASSWORD`
    );

    const DATABASE = ssm.StringParameter.fromStringParameterName(
        this,
        'SCRAPING_DATABASE',
        `/cdk/bznav-care/${stageName}/secrets/SCRAPING_DATABASE`
    );

    const SMARTSTORE_SUB_ACCOUNT = ssm.StringParameter.fromStringParameterName(
        this,
        'SCRAPING_SMARTSTORE_SUB_ACCOUNT',
        `/cdk/bznav-care/${stageName}/secrets/SCRAPING_SMARTSTORE_SUB_ACCOUNT`
    );

    const SMARTSTORE_SUB_PASSWORD = ssm.StringParameter.fromStringParameterName(
        this,
        'SCRAPING_SMARTSTORE_SUB_PASSWORD',
        `/cdk/bznav-care/${stageName}/secrets/SCRAPING_SMARTSTORE_SUB_PASSWORD`
    );

    const lambdaFn = new lambda.DockerImageFunction(this, 'SmartstoreSubAccountVatLambda', {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../lambda'), {
        file: 'Dockerfile_smartstore_sub_account_vat',
        buildArgs: {
          IS_DOCKER: 'true',
        },
      }),
      functionName: `SmartstoreSubAccountVatFunction-${stageName}`,
      architecture: architecture,
      vpc: vpc,
      vpcSubnets: { subnets: [subnet] },
      securityGroups: [securityGroup],
      environment: {
        REDIS_URL: REDIS_URL.stringValue,
        DB_HOST: DB_HOST.stringValue,
        DB_USERNAME: DB_USERNAME.stringValue,
        DB_PASSWORD: DB_PASSWORD.stringValue,
        DATABASE: DATABASE.stringValue,
        SMARTSTORE_SUB_ACCOUNT: SMARTSTORE_SUB_ACCOUNT.stringValue,
        SMARTSTORE_SUB_PASSWORD: SMARTSTORE_SUB_PASSWORD.stringValue,
      },
      timeout : cdk.Duration.minutes(12),
      memorySize: 2048,
    });

    lambdaFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        REDIS_URL.parameterArn,
        DB_HOST.parameterArn,
        DB_USERNAME.parameterArn,
        DB_PASSWORD.parameterArn,
        DATABASE.parameterArn,
        SMARTSTORE_SUB_ACCOUNT.parameterArn,
        SMARTSTORE_SUB_PASSWORD.parameterArn
      ],
    }));

    const api = new apigateway.LambdaRestApi(this, 'SmartstoreSubAccountVatApi', {
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
