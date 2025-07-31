#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SmartstoreCdkStack } from '../lib/smartstore_cdk-stack';

const app = new cdk.App();

const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
};

new SmartstoreCdkStack(app, 'SmartstoreCdkStack-dev', {
    env,
    stageName: 'dev',
});

new SmartstoreCdkStack(app, 'SmartstoreCdkStack-prd', {
    env,
    stageName: 'prd',
});