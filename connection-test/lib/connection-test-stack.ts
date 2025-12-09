import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import os from "os";

export class ConnectionTestStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const stageName = 'dev';

        const architecture = os.arch() === 'arm64' ? lambda.Architecture.ARM_64 : lambda.Architecture.X86_64;

        const lambdaFn = new lambda.Function(this, 'ConnectionTestLambda', {
            functionName: `ConnectionTestFunction-${stageName}`,
            runtime: lambda.Runtime.NODEJS_22_X,
            handler: 'main.handler',
            code: lambda.Code.fromAsset('lambda'),
            architecture: architecture,
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
        });

    }
}

