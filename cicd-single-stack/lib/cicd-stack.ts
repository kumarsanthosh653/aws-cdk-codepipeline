import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codestarconnections from 'aws-cdk-lib/aws-codestarconnections';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { config } from './config';

export interface CicdPipelineProps extends cdk.StackProps {}

export class cicdstack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const codeBuildRole = new iam.Role(this, 'CodeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      path: '/',
      inlinePolicies: {
        CodeBuildPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: [
                `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/codebuild/${id}-*`,
                `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/codebuild/${id}-*/*`,
              ],
            }),
            new iam.PolicyStatement({
              actions: ['ssm:GetParameter'],
              resources: [`arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter/${config.gitHubRepo}/*`],
            }),
            new iam.PolicyStatement({
              actions: [
                's3:PutObject',
                's3:GetObject',
                's3:GetObjectVersion',
                's3:GetBucketAcl',
                's3:GetBucketLocation',
              ],
              resources: [`arn:aws:s3:::${id}/*`],
            }),
            new iam.PolicyStatement({
              actions: ['sts:AssumeRole'],
              resources: [
                `arn:aws:iam::${config.labAccountId}:role/${id}-deployer-role`,
                `arn:aws:iam::${config.devAccountId}:role/${id}-deployer-role`,
                `arn:aws:iam::${config.preprodAccountId}:role/${id}-deployer-role`,
                `arn:aws:iam::${config.prodAccountId}:role/${id}-deployer-role`,
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                'sts:GetServiceBearerToken',
                'codeartifact:List*',
                'codeartifact:Describe*',
                'codeartifact:ReadFromRepository',
                'codeartifact:Get*',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              actions: [
                'codeartifact:PublishPackageVersion',
                'codeartifact:PutPackageMetadata',
              ],
              resources: [`arn:aws:codeartifact:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:package/matson/${config.codeArtifactRepository}/*`],
            }),
            new iam.PolicyStatement({
              actions: [
                's3:GetObject',
                's3:GetObjectVersion',
                's3:GetBucketAcl',
                's3:GetBucketLocation',
                's3:ListBucket',
              ],
              resources: [
                'arn:aws:s3:::cicd-configuration',
                'arn:aws:s3:::cicd-configuration/*',
              ],
            }),
          ],
        }),
      },
    });

    // CodeStar Connection for GitHub
    // const codeStarConnection = new codestarconnections.CfnConnection(this, 'CodeStarConnection', {
    //   connectionName: `${id}-github-connection`,
    //   providerType: 'GitHub',
    // });

    // SNS Topics for notifications
    const notificationPpsnsTopic = new sns.Topic(this, 'NotificationPPSNSTopic', {
      displayName: config.snsNotificationDisplayName,
      topicName: `${id}-Approval-PP`,
    });

    const notificationProdSnsTopic = new sns.Topic(this, 'NotificationProdSNSTopic', {
      displayName: config.snsNotificationDisplayName,
      topicName: `${id}-Approval-Prod`,
    });

    // S3 Bucket for CodePipeline
    const codePipelineBucket = new s3.Bucket(this, 'CodePipelineBucket', {
      bucketName: `${id}-bucket`,
      lifecycleRules: [{
        id: config.bucketLifecyclePolicy.id,
        enabled: config.bucketLifecyclePolicy.status === 'Enabled',
        prefix: config.bucketLifecyclePolicy.prefix,
        transitions: [{
          storageClass: s3.StorageClass.INTELLIGENT_TIERING,
          transitionAfter: cdk.Duration.days(config.bucketLifecyclePolicy.transitionInDays),
        }],
        expiration: cdk.Duration.days(config.bucketLifecyclePolicy.expirationInDays),
      }],
    });

    // Helper function to create CodeBuild projects
    const createCodeBuildProject = (name: string, description: string, buildSpec: string, environmentVariables: { [name: string]: codebuild.BuildEnvironmentVariable }) => new codebuild.PipelineProject(this, name, {
      projectName: `${id}-${name}`,
      description,
      role: codeBuildRole,
      buildSpec: codebuild.BuildSpec.fromSourceFilename(buildSpec),
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId(config.codeBuildImage),
        computeType: (codebuild.ComputeType as any)[config.codeBuildComputeType],
        environmentVariables,
      },
    });

    // Convert array to environment variable object
    const envVariables = (envVars: { name: string; value: string; }[]) => {
      const result: { [name: string]: codebuild.BuildEnvironmentVariable } = {};
      envVars.forEach(ev => {
        result[ev.name] = { value: ev.value };
      });
      return result;
    };

    // CodeBuild projects
    const codeBuildSAST = createCodeBuildProject('SAST', 'Static Application Security Testing', config.buildSpecs.sast, envVariables([
      { name: 'STAGE', value: 'SAST' },
      { name: 'CICD_CONFIG_PATH', value: 's3://cicd-configuration/' },
    ]));

    const codeBuild = createCodeBuildProject('Build', 'Build application', config.buildSpecs.build, envVariables([
      { name: 'STAGE', value: 'Build' },
      { name: 'CICD_CONFIG_PATH', value: 's3://cicd-configuration/' },
    ]));

    const codeBuildDAST = createCodeBuildProject('DAST', 'Dynamic Application Security Testing', config.buildSpecs.dast, envVariables([
      { name: 'STAGE', value: 'DAST' },
      { name: 'CICD_CONFIG_PATH', value: 's3://cicd-configuration/' },
    ]));

    const codeBuildDeployDev = createCodeBuildProject('BuildDev', 'Deploy CodeBuildDeploy to Dev', config.buildSpecs.dev, envVariables([
      { name: 'STAGE', value: 'dev' },
      { name: 'CROSS_ACCOUNT_S3_BUCKET', value: `${id}-dev` },
      { name: 'CICD_CONFIG_PATH', value: 's3://cicd-configuration/' },
      { name: 'CROSS_ACCOUNT_S3_BUCKET_PATH', value: `s3://${id}-dev` },
    ]));

    const codeBuildDeployLab = createCodeBuildProject('BuildLab', 'Deploy CodeBuildDeploy to Lab', config.buildSpecs.lab, envVariables([
      { name: 'STAGE', value: 'lab' },
      { name: 'CROSS_ACCOUNT_S3_BUCKET', value: `${id}-lab` },
      { name: 'CICD_CONFIG_PATH', value: 's3://cicd-configuration/' },
      { name: 'CROSS_ACCOUNT_S3_BUCKET_PATH', value: `s3://${id}-lab` },
    ]));

    const codeBuildDeployPp = createCodeBuildProject('BuildPreProd', 'Deploy to Preprod', config.buildSpecs.pp, envVariables([
      { name: 'STAGE', value: 'preprod' },
      { name: 'CROSS_ACCOUNT_S3_BUCKET', value: `${id}-preprod` },
      { name: 'CICD_CONFIG_PATH', value: 's3://cicd-configuration/' },
      { name: 'CROSS_ACCOUNT_S3_BUCKET_PATH', value: `s3://${id}-preprod` },
    ]));

    const codeBuildDeployProd = createCodeBuildProject('BuildProd', 'Deploy to Prod', config.buildSpecs.prod, envVariables([
      { name: 'STAGE', value: 'prod' },
      { name: 'CROSS_ACCOUNT_S3_BUCKET', value: `${id}-prod` },
      { name: 'CICD_CONFIG_PATH', value: 's3://cicd-configuration/' },
      { name: 'CROSS_ACCOUNT_S3_BUCKET_PATH', value: `s3://${id}-prod` },
    ]));
     
    
    const matsonCodePipelineRole = new iam.Role(this, 'MatsonCodePipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
      path: '/',
      inlinePolicies: {
        CodePipelinePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'codebuild:BatchGetBuilds',
                'codebuild:StartBuild',
              ],
              resources: [
                codeBuildSAST.projectArn,
                codeBuildDeployDev.projectArn,
                codeBuildDeployLab.projectArn,
                codeBuildDeployPp.projectArn,
                codeBuildDeployProd.projectArn,
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                'codestar-connections:UseConnection',
              ],
              resources: [
                config.codeStarConnectionArn,
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                's3:PutObject',
                's3:GetObject',
              ],
              resources: [
                `arn:aws:s3:::${id}-bucket/*`,
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                'sns:Publish',
              ],
              resources: [
                notificationPpsnsTopic.topicArn,
                notificationProdSnsTopic.topicArn,
              ],
            }),
          ],
        }),
      },
    });
    // CodePipeline
    const sourceOutput = new codepipeline.Artifact('SourceArtifacts');
    const sastOutput = new codepipeline.Artifact('StaticArtifacts');
    const buildOutput = new codepipeline.Artifact('BuildArtifacts');
    const deployOutputLab = new codepipeline.Artifact('LabDeploymentArtifacts');
    const deployOutputDev = new codepipeline.Artifact('DevDeploymentArtifacts');
    const deployOutputPreProd = new codepipeline.Artifact('PreprodDeploymentArtifacts');
    const dastOutput = new codepipeline.Artifact('DynamicArtifacts');
    const deployOutputProd = new codepipeline.Artifact('ProdDeploymentArtifacts');



    new codepipeline.Pipeline(this, 'CICDPipeline', {
      pipelineName: `${id}-Pipeline`,
      role: matsonCodePipelineRole,
      artifactBucket: codePipelineBucket,
      stages: [
        {
          stageName: config.sourcestage,
          actions: [
            new codepipelineActions.CodeStarConnectionsSourceAction({
              actionName: 'Github',
              owner: config.gitHubUser,
              repo: config.gitHubRepo,
              branch: config.gitHubBranch,
              connectionArn: config.codeStarConnectionArn,
              output: sourceOutput,
            }),
          ],
        },
        {
          stageName: config.saststage,
          actions: [
            new codepipelineActions.CodeBuildAction({
              actionName: 'Static-Scan',
              project: codeBuildSAST,
              input: sourceOutput,
              outputs: [sastOutput],
            }),
          ],
        },
        {
          stageName: config.buildstage,
          actions: [
            new codepipelineActions.CodeBuildAction({
              actionName: 'Building-Application',
              project: codeBuild,
              input: sourceOutput,
              outputs: [buildOutput],
            }),
          ],
        },
        {
          stageName: config.labstage,
          actions: [
            new codepipelineActions.CodeBuildAction({
              actionName: 'Deploy-to-MatsonLabs',
              project: codeBuildDeployLab,
              input: buildOutput,
              outputs: [deployOutputLab],
            }),
          ],
        },
        {
          stageName: config.devstage,
          actions: [
            new codepipelineActions.CodeBuildAction({
              actionName: 'Deploy-to-Dev',
              project: codeBuildDeployDev,
              input: buildOutput,
              outputs: [deployOutputDev],
            }),
          ],
        },
        {
          stageName: config.approvalstagepp,
          actions: [
            new codepipelineActions.ManualApprovalAction({
              actionName: 'Approval-to-pp',
              runOrder: 1,
              notificationTopic: notificationPpsnsTopic,
            }),
          ],
        },
        {
          stageName: config.preprodstage,
          actions: [
            new codepipelineActions.CodeBuildAction({
              actionName: 'Deploy-to-preprod',
              project: codeBuildDeployPp,
              input: buildOutput,
              outputs: [deployOutputPreProd],
            }),
          ],
        },
        {
          stageName: config.approvalstageprod,
          actions: [
            new codepipelineActions.ManualApprovalAction({
              actionName: 'Approval-to-prod',
              runOrder: 1,
              notificationTopic: notificationProdSnsTopic,
            }),
          ],
        },
        {
          stageName: config.daststage,
          actions: [
            new codepipelineActions.CodeBuildAction({
              actionName: 'Dynamic-Scan',
              project: codeBuildDAST,
              input: buildOutput,
              outputs: [dastOutput],
            }),
          ],
        },
        {
          stageName: config.prodstage,
          actions: [
            new codepipelineActions.CodeBuildAction({
              actionName: 'Deploy-to-prod',
              project: codeBuildDeployProd,
              input: buildOutput,
              outputs: [deployOutputProd],
            }),
          ],
        },
      ],
    });
  }
}
