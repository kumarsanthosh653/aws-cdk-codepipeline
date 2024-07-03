#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DemoStack1 } from '../lib/demo1-stack';
import { DemoStack2 } from '../lib/demo2-stack';

const app = new cdk.App();

const accountAEnv = { account: '637423476845', region: 'ap-south-1' };
const accountBEnv = { account: '654654515013', region: 'ap-south-1' };

// Instantiate stacks with specific environments
new DemoStack2(app, 'demostack2', { env: accountBEnv });
new DemoStack1(app, 'demostack1', { env: accountAEnv });



// import 'source-map-support/register';
// import * as cdk from 'aws-cdk-lib';
// import { DemoStack1 } from '../lib/demo1-stack';
// import { DemoStack2 } from '../lib/demo2-stack';
// import * as fs from 'fs';
// import * as ini from 'ini';
// import * as path from 'path';

// const app = new cdk.App();

// const environments: { [key: string]: cdk.Environment } = {
//   accountA: { account: '637423476845', region: 'ap-south-1' },
//   accountB: { account: '891377353125', region: 'ap-south-1' },
// };

// const credentialsFilePath = path.resolve(process.env.HOME || process.env.USERPROFILE || '', '.aws', 'credentials');
// const credentials = ini.parse(fs.readFileSync(credentialsFilePath, 'utf-8'));

// const profileA = app.node.tryGetContext('accountAProfile');
// const profileB = app.node.tryGetContext('accountBProfile');

// async function deployStack1() {
//   process.env.AWS_PROFILE = profileA;
//   const sourceProfile1 = credentials[profileA].source_profile;
//   console.log(`Using profile: ${profileA} with source profile: ${sourceProfile1}`);
//   new DemoStack1(app, 'DemoStack1', { env: environments.accountA });
//   await app.synth();
// }

// async function deployStack2() {
//   process.env.AWS_PROFILE = profileB;
//   const sourceProfile2 = credentials[profileB].source_profile;
//   console.log(`Using profile: ${profileB} with source profile: ${sourceProfile2}`);
//   new DemoStack2(app, 'DemoStack2', { env: environments.accountB });
//   await app.synth();
// }

// async function deployStacksSequentially() {
//   try {
//     await deployStack1();
//     await deployStack2();
//   } catch (error) {
//     console.error(error);
//     process.exit(1);
//   }
// }

// deployStacksSequentially();
