#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {CoupangVatCdkStack} from '../lib/coupang_vat_cdk-stack';

const app = new cdk.App();

const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
};

new CoupangVatCdkStack(app, 'CoupangVatCdkStack', {
    env
});