import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ram from 'aws-cdk-lib/aws-ram';

export class SharedToolsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

   
    const secret = sm.Secret.fromSecretAttributes(this, "AzureADSecret", {
      secretCompleteArn: "arn:aws:secretsmanager:eu-west-1:566088922123:secret:prod/AVA/AzureADKeys-uG1Dl0"
    });

    const clientSecret = secret.secretValueFromJson('clientSecret').unsafeUnwrap();
    const clientId = secret.secretValueFromJson('clientId').unsafeUnwrap();
    
    const verifiedAccessTrustProvider = new ec2.CfnVerifiedAccessTrustProvider(this, 'VerifiedAccessTrustProvider', {
      policyReferenceName: 'AVAAzureAD',
      trustProviderType: 'user',
      description: 'Azure AD Trust Provicer for AWS Verified Access',
      oidcOptions: {
        authorizationEndpoint: 'https://login.microsoftonline.com/cebb7b87-7dbb-44e2-817b-880d3c49929d/oauth2/v2.0/authorize',
        clientId,
        clientSecret,
        issuer: 'https://login.microsoftonline.com/cebb7b87-7dbb-44e2-817b-880d3c49929d/v2.0',
        scope: 'openid profile email offline_access',
        tokenEndpoint: 'https://login.microsoftonline.com/cebb7b87-7dbb-44e2-817b-880d3c49929d/oauth2/v2.0/token',
        userInfoEndpoint: 'https://graph.microsoft.com/oidc/userinfo',
      },
      userTrustProviderType: 'oidc'
    });

    verifiedAccessTrustProvider.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    const logGroup = new logs.LogGroup(this, 'AVALogGroup', {
      logGroupName: "AVALogs",
      retention: logs.RetentionDays.THREE_MONTHS
    });

    const verifiedAccessInstance = new ec2.CfnVerifiedAccessInstance(this, 'VerifiedAccessInstance', {
      description: 'description',
      loggingConfigurations: {
        cloudWatchLogs: {
          enabled: true,
          logGroup: logGroup.logGroupName,
        }
      },
      verifiedAccessTrustProviderIds: [verifiedAccessTrustProvider.getAtt("VerifiedAccessTrustProviderId").toString()],
    });

    verifiedAccessInstance.addPropertyOverride("LoggingConfigurations.IncludeTrustContext", true);
    verifiedAccessInstance.addPropertyOverride("LoggingConfigurations.LogVersion", "ocsf-1.0.0-rc.2");
    verifiedAccessInstance.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    const verifiedAccessGroup = new ec2.CfnVerifiedAccessGroup(this, 'VerifiedAccessGroup', {
      verifiedAccessInstanceId: verifiedAccessInstance.getAtt("VerifiedAccessInstanceId").toString(),
      description: 'Product Managers',
      policyDocument: `permit(principal, action, resource)
when {
    context.AVAAzureAD.family_name == "Linford"
};`,
      policyEnabled: true,
    });

    new ram.CfnResourceShare(this, "VerifiedAccessGroupShare", {
      name: 'myGroupResourceShare',
      allowExternalPrincipals: false,
      permissionArns: ['arn:aws:ram::aws:permission/AWSRAMPermissionVerifiedAccessGroup'],
      principals: ['arn:aws:organizations::048420268934:organization/o-d3yvabwsqc'],
      resourceArns: [verifiedAccessGroup.getAtt('VerifiedAccessGroupArn').toString()]
    });
  }
}
