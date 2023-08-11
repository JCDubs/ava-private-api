import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as nodeLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as logs from "aws-cdk-lib/aws-logs";
import * as apiGateway from 'aws-cdk-lib/aws-apigateway';
import { HttpMethod } from "../shared/utils/http-method";
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as r53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as iam from 'aws-cdk-lib/aws-iam';

interface ProductDomainStackProps extends cdk.StackProps {
  vpc: ec2.IVpc,
  productTable: Table,
  vpceId: string,
  apiEniList: string[]
}

const defaultEnvironment = {
  LOG_LEVEL: 'DEBUG',
  POWERTOOLS_LOGGER_LOG_EVENT: "true",
  POWERTOOLS_LOGGER_SAMPLE_RATE: "1",
  POWERTOOLS_TRACE_ENABLED: "enabled",
  POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS: "captureHTTPsRequests",
  POWERTOOLS_TRACER_CAPTURE_RESPONSE: "captureResult",
};

const commonLambdaProps = {
  runtime: lambda.Runtime.NODEJS_16_X,
  architecture: lambda.Architecture.ARM_64,
  awsSdkConnectionReuse: true,
  tracing: lambda.Tracing.ACTIVE,
  timeout: cdk.Duration.minutes(1),
  bundling: {
    minify: true,
    sourceMap: true,
    sourceMapMode: nodeLambda.SourceMapMode.INLINE,
    sourcesContent: false,
    target: "node16",
    externalModules: ["aws-sdk"],
  },
}

// Need to change this based on the hosted zone.
const subDomain = 'product';
const productAPIDomainName = `${subDomain}.arc.fdv.featuredev.architecture.cefcloud.net`;
const avaGroupId = 'vagr-0e8caf12992abb3ca';
const hostedZoneId = 'Z06589852CH25FNQ8ONOR';

export class ProductDomainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ProductDomainStackProps) {
    super(scope, id, props);

    const createProductFunction = new nodeLambda.NodejsFunction(this, 'CreateProductLambda', {
      ...commonLambdaProps,
      entry: path.join(
        __dirname,
        "../src/handler/create-product-function/index.ts"
      ),
      description: "Create a product",
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE_ISOLATED}),
      environment: {
        ...defaultEnvironment,
        POWERTOOLS_METRICS_NAMESPACE: 'CreateProductService',
        PRODUCT_TABLE: props.productTable.tableName
      }
    });

    const getProductFunction = new nodeLambda.NodejsFunction(this, 'GetProductLambda', {
      ...commonLambdaProps,
      entry: path.join(
        __dirname,
        "../src/handler/get-product-function/index.ts"
      ),
      description: "Get a product by product id",
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE_ISOLATED}),
      environment: {
        ...defaultEnvironment,
        POWERTOOLS_METRICS_NAMESPACE: 'GetProductService',
        PRODUCT_TABLE: props.productTable.tableName
      }
    });

    const apiResourcePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ['execute-api:Invoke'],
          principals: [new iam.AnyPrincipal()],
          resources: ['execute-api:/*/*/*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          principals: [new iam.AnyPrincipal()],
          actions: ['execute-api:Invoke'],
          resources: ['execute-api:/*/*/*'],
          conditions: {
            'StringNotEquals': {
              "aws:SourceVpce": [
                props.vpceId,
              ]
            }
          }
        })
      ]
    })

    const api = new apiGateway.RestApi(this, 'ProductAPI', {
      ...props,
      minimumCompressionSize: 0,
      endpointConfiguration: { types: [apiGateway.EndpointType.PRIVATE] },
      cloudWatchRole: true,
      deploy: true,
      policy: apiResourcePolicy,
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apiGateway.MethodLoggingLevel.INFO,
        metricsEnabled: true,
        accessLogDestination: new apiGateway.LogGroupLogDestination(
          new logs.LogGroup(
            this,
            `/aws/api-gateway/product-access-logs`
          )
        ),
        accessLogFormat: apiGateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
      },
      restApiName: 'product-api',
    });

    api.root.resourceForPath('/product').addMethod(HttpMethod.POST, new apiGateway.LambdaIntegration(createProductFunction, {
      proxy: true,
    }));

    api.root.resourceForPath('/product/{id}').addMethod(HttpMethod.GET, new apiGateway.LambdaIntegration(getProductFunction, {
      proxy: true,
    }));

    // Create Route53 C_NAME pointing to the endpoint DNS name.
    const productHostedZone = r53.HostedZone.fromHostedZoneAttributes(this, 'ProductPublicHostedZone', {
      zoneName: 'arc.fdv.featuredev.architecture.cefcloud.net',
      hostedZoneId: hostedZoneId
    });

    const productAPICert = new acm.Certificate(this, 'ProductAPICertificate', {
      domainName: productAPIDomainName,
      certificateName: 'Product API',
      validation: acm.CertificateValidation.fromDns(productHostedZone),
    });

    const mySecurityGroupWithoutInlineRules = new ec2.SecurityGroup(this, 'ProductAPIAVAEndpointSecurityGroup', {
      vpc: props.vpc,
      description: 'ProductAPIAVAEndpoint Security Group',
    });
    mySecurityGroupWithoutInlineRules.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow https access')

    // Create attrEndpointDomain
    const productAPIEndpoint = new ec2.CfnVerifiedAccessEndpoint(this, "ProductAPIAVAEndpoint", {
      applicationDomain: productAPIDomainName,
      attachmentType: 'vpc',
      domainCertificateArn: productAPICert.certificateArn,
      endpointDomainPrefix: 'product',
      endpointType: 'network-interface',
      verifiedAccessGroupId: avaGroupId,
      description: 'Product API verified access group endpoint',
      securityGroupIds: [mySecurityGroupWithoutInlineRules.securityGroupId],
      policyDocument: `permit(principal, action, resource)
when {
    context.AVAAzureAD.family_name == "Linford"
};`,
      networkInterfaceOptions: {
        networkInterfaceId: props.apiEniList[0],
        port: 443,
        protocol: 'https'
      }
    });

    new r53.CnameRecord(this, 'ProductPublicDomainName', {
      domainName: productAPIEndpoint.attrEndpointDomain,
      zone: productHostedZone,
      recordName: subDomain
    });
  }
}
