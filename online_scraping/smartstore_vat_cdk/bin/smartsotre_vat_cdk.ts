#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {SmartsotreVatCdkStack} from '../lib/smartsotre_vat_cdk-stack';

const app = new cdk.App();

const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
};

new SmartsotreVatCdkStack(app, 'SmartsotreVatCdkStack', {
    env
});