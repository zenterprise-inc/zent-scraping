import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as os from 'os';

export class CoupangVatCdkStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const stageName = "prd"

        const vpc = ec2.Vpc.fromLookup(this, 'vpc', {vpcId: 'vpc-01ba7e04e8d32d5c4'});
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

        const KMS_KEY = ssm.StringParameter.fromStringParameterName(
            this,
            'KMS_KEY',
            `/cdk/bznav-care/${stageName}/secrets/KMS_KEY`
        );

        const PRO_CARE_ID = ssm.StringParameter.fromStringParameterName(
            this,
            'PRO_CARE_ID',
            `/cdk/bznav-care/${stageName}/secrets/PRO_CARE_ID`
        );

        const PRO_CARE_PWD = ssm.StringParameter.fromStringParameterName(
            this,
            'PRO_CARE_PWD',
            `/cdk/bznav-care/${stageName}/secrets/PRO_CARE_PWD`
        );

        const lambdaFn = new lambda.DockerImageFunction(this, 'CoupangVatLambda', {
            code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../lambda'), {
                file: 'Dockerfile_coupang_vat',
                buildArgs: {
                    IS_DOCKER: 'true',
                },
            }),
            functionName: `CoupangVatFunction-${stageName}`,
            architecture: architecture,
            vpc: vpc,
            vpcSubnets: {subnets: [subnet]},
            securityGroups: [securityGroup],
            environment: {
                REDIS_URL: REDIS_URL.stringValue,
                DB_HOST: DB_HOST.stringValue,
                DB_USERNAME: DB_USERNAME.stringValue,
                DB_PASSWORD: DB_PASSWORD.stringValue,
                DATABASE: DATABASE.stringValue,
                KMS_KEY: KMS_KEY.stringValue,
                PRO_CARE_ID: PRO_CARE_ID.stringValue,
                PRO_CARE_PWD: PRO_CARE_PWD.stringValue,
            },
            timeout: cdk.Duration.minutes(15),
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
                KMS_KEY.parameterArn,
                PRO_CARE_ID.parameterArn,
                PRO_CARE_PWD.parameterArn,
            ],
        }))
  
        lambdaFn.addToRolePolicy(new iam.PolicyStatement({
            actions: ['kms:Decrypt', 'kms:DescribeKey'],
            resources: ['*'],
        }));

        const api = new apigateway.LambdaRestApi(this, 'CoupangVatApi', {
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
