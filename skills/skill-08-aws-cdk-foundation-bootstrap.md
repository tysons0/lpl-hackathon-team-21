# SKILL-08: AWS CDK Foundation & Zero-Trust Bootstrap (`aws_cdk_foundation_bootstrap`)

## Objective
Provide coding agents with a structured blueprint to bootstrap an enterprise AWS infrastructure environment using AWS CDK v2 (Python). Establishes multi-environment configuration (Dev/Staging/Prod), zero-trust IAM roles, VPC isolation with private subnets & endpoints, KMS customer-managed keys, and secret management.

---

## AWS Architecture Baseline
```
  [ AWS CDK App (app.py) ]
             │
             ├──► [ KMS Stack ] ───────────► Customer Managed Keys (CMK)
             ├──► [ Network Stack ] ───────► VPC + Private Subnets + VPC Endpoints
             ├──► [ Security/IAM Stack ] ──► Zero-Trust Roles + Boundary Policies
             └──► [ Secrets Stack ] ───────► AWS Secrets Manager
```

---

## Technical Stack
- **Framework:** AWS CDK v2 (`aws-cdk-lib>=2.120.0`)
- **Language:** Python 3.12
- **Networking:** Amazon VPC (Dual-AZ, NAT Gateways, Gateway & Interface Endpoints for S3, DynamoDB, Bedrock, Secrets Manager)
- **Security:** AWS KMS, IAM Role Boundaries, AWS Secrets Manager

---

## Project Directory Structure
```
infra/
├── app.py
├── cdk.json
├── requirements.txt
└── stacks/
    ├── __init__.py
    ├── kms_stack.py
    ├── vpc_stack.py
    ├── iam_stack.py
    └── secrets_stack.py
```

---

## CDK Entry Point (`app.py`)

```python
#!/usr,bin/env python3
import os
import aws_cdk as cdk
from stacks.kms_stack import KMSStack
from stacks.vpc_stack import VPCStack
from stacks.iam_stack import IAMStack

app = cdk.App()

env_name = app.node.try_get_context("config") or "dev"
account = os.getenv("CDK_DEFAULT_ACCOUNT")
region = os.getenv("CDK_DEFAULT_REGION", "us-east-1")

aws_env = cdk.Environment(account=account, region=region)

kms_stack = KMSStack(app, f"WealthMatching-KMS-{env_name}", env=aws_env)
vpc_stack = VPCStack(app, f"WealthMatching-VPC-{env_name}", kms_key=kms_stack.main_key, env=aws_env)
iam_stack = IAMStack(app, f"WealthMatching-IAM-{env_name}", env=aws_env)

app.synth()
```

---

## Network Isolation Stack Construct (`stacks/vpc_stack.py`)

```python
from aws_cdk import (
    Stack,
    aws_ec2 as ec2,
    aws_kms as kms,
)
from constructs import Construct

class VPCStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, kms_key: kms.IKey, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        self.vpc = ec2.Vpc(
            self, "AppVPC",
            max_azs=2,
            nat_gateways=1,
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name="Public", subnet_type=ec2.SubnetType.PUBLIC, cidr_mask=24
                ),
                ec2.SubnetConfiguration(
                    name="PrivateWithEgress", subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS, cidr_mask=22
                ),
                ec2.SubnetConfiguration(
                    name="IsolatedData", subnet_type=ec2.SubnetType.PRIVATE_ISOLATED, cidr_mask=24
                ),
            ]
        )

        self.vpc.add_gateway_endpoint("S3Endpoint", service=ec2.GatewayVpcEndpointAwsService.S3)
        self.vpc.add_gateway_endpoint("DynamoDBEndpoint", service=ec2.GatewayVpcEndpointAwsService.DYNAMODB)
        self.vpc.add_interface_endpoint(
            "BedrockRuntimeEndpoint",
            service=ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME
        )
```

---

## Execution Guidelines for Coding Agents
1. Always synthesize with `cdk synth -c config=dev` before applying.
2. Enforce explicit Removal Policies (`RemovalPolicy.DESTROY` for Dev, `RemovalPolicy.RETAIN` for Prod).
3. Do not hardcode CIDR ranges or Account IDs in stack code—read from context variables.
