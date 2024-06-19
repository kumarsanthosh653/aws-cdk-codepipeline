import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Pipeline, Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { CodeBuildAction, ManualApprovalAction, GitHubSourceAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { config } from './variable'; // Import configuration

export class MyCdkAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket for artifacts
    const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: config.bucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
      autoDeleteObjects: true, // Deletes objects when bucket is destroyed
    });

    // IAM role for CodeBuild
    const codeBuildRole = new iam.Role(this, 'CodeBuildServiceRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeBuildDeveloperAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
      ],
    });

    // Define the LogGroups
    const logGroupMain = new logs.LogGroup(this, 'LogGroupMain', {
      logGroupName: `/aws/codebuild/${config.githubRepo}-main`,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
    });

    const logGroupDev = new logs.LogGroup(this, 'LogGroupDev', {
      logGroupName: `/aws/codebuild/${config.githubRepo}-dev`,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
    });

    // Define the CodeBuild projects
    const projectMain = new codebuild.Project(this, 'TestMain', {
      projectName: `${config.githubRepo}-main`,
      description: `CodeBuild project for ${config.mainBranch} branch`,
      concurrentBuildLimit: 1,
      source: codebuild.Source.gitHub({
        owner: config.githubOwner,
        repo: config.githubRepo,
        webhook: true,
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH).andBranchIs(config.mainBranch)
        ]
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true,
      },
      role: codeBuildRole,
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
      artifacts: codebuild.Artifacts.s3({
        bucket: artifactBucket,
        name: `${config.githubRepo}-main-artifact.zip`,
        includeBuildId: false,
        packageZip: true,
      }),
      timeout: cdk.Duration.minutes(60),
    });

    const projectDev = new codebuild.Project(this, 'TestDev', {
      projectName: `${config.githubRepo}-dev`,
      description: `CodeBuild project for ${config.devBranch} branch`,
      concurrentBuildLimit: 1,
      source: codebuild.Source.gitHub({
        owner: config.githubOwner,
        repo: config.githubRepo,
        webhook: true,
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH).andBranchIs(config.devBranch)
        ]
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true,
      },
      role: codeBuildRole,
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
      artifacts: codebuild.Artifacts.s3({
        bucket: artifactBucket,
        name: `${config.githubRepo}-dev-artifact.zip`,
        includeBuildId: false,
        packageZip: true,
      }),
      timeout: cdk.Duration.minutes(60),
    });

    // Artifact buckets for pipeline
    const devSourceOutput = new Artifact('DevSourceOutput');
    const devSourceAction = new GitHubSourceAction({
      actionName: 'GitHub_Source_Dev',
      owner: config.githubOwner,
      repo: config.githubRepo,
      oauthToken: cdk.SecretValue.secretsManager(config.githubTokenSecret),
      output: devSourceOutput,
      branch: config.devBranch,
    });

    const mainSourceOutput = new Artifact('MainSourceOutput');
    const mainSourceAction = new GitHubSourceAction({
      actionName: 'GitHub_Source_Main',
      owner: config.githubOwner,
      repo: config.githubRepo,
      oauthToken: cdk.SecretValue.secretsManager(config.githubTokenSecret),
      output: mainSourceOutput,
      branch: config.mainBranch,
    });

    const buildDevAction = new CodeBuildAction({
      actionName: 'Build_Dev',
      project: projectDev,
      input: devSourceOutput,
      outputs: [new Artifact('BuildOutputDev')],
    });

    const buildMainAction = new CodeBuildAction({
      actionName: 'Build_Main',
      project: projectMain,
      input: mainSourceOutput,
      outputs: [new Artifact('BuildOutputMain')],
      runOrder: 3, // Ensure it runs after manual approval
    });

    // Manual approval stage
    const manualApprovalAction = new ManualApprovalAction({
      actionName: 'Manual_Approval',
      additionalInformation: 'Approve to deploy to production',
      runOrder: 2, // Adjust run order as needed
    });

    // Define the pipeline
    const pipeline = new Pipeline(this, 'MyPipeline', {
      pipelineName: 'MyPipeline',
      artifactBucket: artifactBucket,
      stages: [
        {
          stageName: 'Source',
          actions: [devSourceAction, mainSourceAction],
        },
        {
          stageName: 'Build-Dev',
          actions: [buildDevAction],
        },
        {
          stageName: 'Manual-Approval',
          actions: [manualApprovalAction],
        },
        {
          stageName: 'Build-Main',
          actions: [buildMainAction],
        },
      ],
    });
  }
}
