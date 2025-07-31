#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CoupangSubAccountVatCdkStack } from '../lib/coupang_sub_account_vat_cdk-stack';

const app = new cdk.App();

const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
};

new CoupangSubAccountVatCdkStack(app, 'CoupangSubAccountVatCdkStack-dev', {
    env,
    stageName: 'dev',
});

new CoupangSubAccountVatCdkStack(app, 'CoupangSubAccountVatCdkStack-prd', {
    env,
    stageName: 'prd',
});