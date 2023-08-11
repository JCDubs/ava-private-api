#!/usr/bin/env node
// import 'dotenv/config';
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductInfraStack } from '../lib/product-infra-stack';
import { ProductDomainStack } from '../lib/product-domain-stack';
import { ProductStatefulStack} from '../lib/product-stateful-stack';

const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION
}

const app = new cdk.App();
const infraStack = new ProductInfraStack(app, "ProductInfraStack", {env})
const statefulStack = new ProductStatefulStack(app, 'ProductStatefulStack', {env})
new ProductDomainStack(app, 'ProductDomainStack', {
    env,
    vpc: infraStack.vpc,
    productTable: statefulStack.productTable,
    vpceId: infraStack.vpceId,
    apiEniList: infraStack.apiEniList
});