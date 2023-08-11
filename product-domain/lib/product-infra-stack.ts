import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';

// const vpcId = "vpc-0ae0b200ae2caa757" // process.env.VPC_ID; /fdv/arc/vpc
// const vpcEndpointId = "vpce-0739a68412f05b80b" // process.env.VPCE_ID!; /fdv/arc/vpce
// /fdv/arc/apigw/eni

export class ProductInfraStack extends cdk.Stack {
    readonly vpc: ec2.IVpc;
    readonly vpceId: string;
    readonly apiEniList: string[];

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const vpcId = ssm.StringParameter.valueFromLookup(this, '/fdv/arc/vpc');
    this.vpceId = ssm.StringParameter.valueFromLookup(this, '/fdv/arc/vpce');
    this.apiEniList = ssm.StringParameter.valueFromLookup(this, '/fdv/arc/apigw/eni').split(',');
    console.log(this.apiEniList)
    this.vpc = ec2.Vpc.fromLookup(this, "ProductVPC", {vpcId});
  }
}
