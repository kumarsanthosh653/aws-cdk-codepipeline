// import * as cdk from 'aws-cdk-lib';
// import { Construct } from 'constructs';
// import * as codebuild from 'aws-cdk-lib/aws-codebuild';
// import * as iam from 'aws-cdk-lib/aws-iam';
// import * as s3 from 'aws-cdk-lib/aws-s3';
// import * as logs from 'aws-cdk-lib/aws-logs';
// import { Pipeline, Artifact } from 'aws-cdk-lib/aws-codepipeline';
// import { CodeBuildAction, ManualApprovalAction, GitHubSourceAction } from 'aws-cdk-lib/aws-codepipeline-actions';
// import { config } from './variable'; // Import configuration

// export class MyCdkAppStack extends cdk.Stack {
//   constructor(scope: Construct, id: string, props?: cdk.StackProps) {
//     super(scope, id, props);

//     // S3 Bucket for artifacts
//     const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
//       bucketName: config.bucketName,
//       removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
//       autoDeleteObjects: true, // Deletes objects when bucket is destroyed
//     });

//     // IAM role for CodeBuild
//     const codeBuildRole = new iam.Role(this, 'CodeBuildServiceRole', {
//       assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
//       managedPolicies: [
//         iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
//         iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeBuildDeveloperAccess'),
//         iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
//       ],
//     });

//   }
// }


import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { config } from './variable'; // Import configuration

export class MyCdkAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // IAM role for Lambda
    const lambdaRole = new iam.Role(this, 'LambdaServiceRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Lambda function
    const helloWorldLambda = new lambda.Function(this, 'HelloWorldLambda', {
      runtime: lambda.Runtime.NODEJS_16_X, // or any supported runtime
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          const response = {
            statusCode: 200,
            body: JSON.stringify('Hello, world!'),
          };
          return response;
        };
      `),
      handler: 'index.handler',
      role: lambdaRole,
    });
  }
}

