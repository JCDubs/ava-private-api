#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SharedToolsStack } from '../lib/shared-tools-stack';

const app = new cdk.App();
new SharedToolsStack(app, 'SharedToolsStack', {env: {region: process.env.CDK_DEFAULT_REGION, account: process.env.CDK_DEFAULT_ACCOUNT}});
