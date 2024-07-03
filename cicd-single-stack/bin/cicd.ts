#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { cicdstack } from '../lib/cicd-stack';

const app = new cdk.App();
new cicdstack(app, 'cicdstack', {
  env: { account: '637423476845', region: 'ap-south-1' },
});