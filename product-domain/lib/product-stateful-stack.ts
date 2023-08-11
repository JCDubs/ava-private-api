import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import * as DynamoDB from 'aws-cdk-lib/aws-dynamodb';

export class ProductStatefulStack extends cdk.Stack {
    
    readonly productTable: DynamoDB.Table;

    constructor(scope: Construct, id: string, props: cdk.StackProps) {
        super(scope, id);

        this.productTable = new DynamoDB.Table(this, 'ProductTable', {
            tableName: 'ProductTable',
            billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecovery: true,
            partitionKey: {name: 'PK', type: DynamoDB.AttributeType.STRING},
            sortKey: {name: 'SK', type: DynamoDB.AttributeType.STRING},
        })
    }
}
