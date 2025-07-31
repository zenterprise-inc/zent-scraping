#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SmartstoreSubAccountVatCdkStack } from '../lib/smartstore_sub_account_vat_cdk-stack';

const app = new cdk.App();

const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
};

new SmartstoreSubAccountVatCdkStack(app, 'SmartstoreSubAccountVatCdkStack-dev', {
    env,
    stageName: 'dev',
});

new SmartstoreSubAccountVatCdkStack(app, 'SmartstoreSubAccountVatCdkStack-prd', {
    env,
    stageName: 'prd',
});
