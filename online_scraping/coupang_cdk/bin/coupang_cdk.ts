#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CoupangCdkStack } from '../lib/coupang_cdk-stack';

const app = new cdk.App();

const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
};

new CoupangCdkStack(app, 'CoupangCdkStack-dev', {
    env,
    stageName: 'dev',
});

new CoupangCdkStack(app, 'CoupangCdkStack-prd', {
    env,
    stageName: 'prd',
});