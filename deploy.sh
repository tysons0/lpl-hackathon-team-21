#!/usr/bin/env bash
# Advisor Match - one-command deploy for AWS CloudShell (us-east-1).
# Usage:  bash deploy.sh
# Optional env vars:  MODEL_ID=<inference profile id>  EXISTING_ROLE_ARN=<lambda role arn>  RESEED=1
#                     ALERT_EMAIL=<you@example.com> (alarms + monthly budget)  BUDGET_USD=50
#                     CRM_WEBHOOK_URL=<https endpoint that receives synced bookings>
set -euo pipefail
cd "$(dirname "$0")"

REGION="${AWS_REGION:-us-east-1}"
PREFIX="advisor-match"
STACK="${PREFIX}"
export AWS_DEFAULT_REGION="$REGION"
say() { printf "\n\033[1;34m==> %s\033[0m\n" "$*"; }
die() { printf "\n\033[1;31mERROR: %s\033[0m\n" "$*"; exit 1; }

say "1/8 Checking identity and tools"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text) || die "AWS credentials not available. Run this in AWS CloudShell."
echo "Account: $ACCOUNT   Region: $REGION"
python3 -c "import boto3" 2>/dev/null || pip3 install --user -q boto3

say "2/8 Choosing and testing a Claude model on Bedrock"
MODEL_ID=$(MODEL_ID="${MODEL_ID:-}" python3 - <<'PY'
import os, re, sys, boto3
want = os.environ.get("MODEL_ID")
bed = boto3.client("bedrock"); rt = boto3.client("bedrock-runtime")
cands = [want] if want else []
if not want:
    ids = []
    try:
        for page in bed.get_paginator("list_inference_profiles").paginate():
            ids += [p["inferenceProfileId"] for p in page["inferenceProfileSummaries"]]
    except Exception as e:
        print(f"(could not list inference profiles: {e})", file=sys.stderr)
    claude = [i for i in ids if re.match(r"^(us|global)\.anthropic\.claude", i)]
    def rank(i):  # prefer fast + capable: haiku 4.x / sonnet 4.x, newest first
        tier = 0 if "haiku-4" in i else 1 if "sonnet-4" in i else 2 if "sonnet" in i else 3 if "haiku" in i else 4
        return (tier, [-int(n) for n in re.findall(r"\d+", i)])
    cands = sorted(claude, key=rank)
for m in cands[:8]:
    try:
        rt.converse(modelId=m, messages=[{"role": "user", "content": [{"text": "Reply with OK"}]}],
                    inferenceConfig={"maxTokens": 5})
        print(m); sys.exit(0)
    except Exception as e:
        print(f"  {m}: {type(e).__name__}: {str(e)[:160]}", file=sys.stderr)
sys.exit(1)
PY
) || die "No Claude model could be invoked. Open Bedrock > Model catalog, try a Claude model in the playground (submit the Anthropic use-case form if asked), then re-run. You can also set MODEL_ID=<id>."
echo "Using model: $MODEL_ID"
aws bedrock-runtime invoke-model --model-id amazon.titan-embed-text-v2:0 \
  --body '{"inputText":"hello"}' --cli-binary-format raw-in-base64-out /tmp/emb.json >/dev/null \
  || die "Titan Text Embeddings V2 is not available in this account/region."
echo "Embeddings model OK"

say "3/8 Packaging the agent Lambda"
ART_BUCKET="${PREFIX}-artifacts-${ACCOUNT}-${REGION}"
aws s3api head-bucket --bucket "$ART_BUCKET" 2>/dev/null || aws s3 mb "s3://$ART_BUCKET" >/dev/null
# One code bundle for both functions: the agent (lambda_function.py) and the CRM consumer (crm_sync.py).
python3 -c "import glob, os, zipfile; z=zipfile.ZipFile('/tmp/agent.zip','w',zipfile.ZIP_DEFLATED); [z.write(f, os.path.basename(f)) for f in sorted(glob.glob('backend/*.py'))]; z.close()"
if [ ! -f build/strands-layer.zip ]; then
  echo "Building the Strands Agents layer for Python 3.12 (one time, ~1-2 min)..."
  rm -rf /tmp/strands-layer && mkdir -p /tmp/strands-layer/python build
  python3 -m pip install --quiet --upgrade pip >/dev/null 2>&1 || true
  python3 -m pip install --quiet strands-agents -t /tmp/strands-layer/python \
    --platform manylinux2014_x86_64 --implementation cp --python-version 3.12 --only-binary=:all: \
    || die "Could not download the Strands Agents SDK from PyPI."
  python3 - <<'PY'
import os, zipfile
root = "/tmp/strands-layer"
with zipfile.ZipFile("build/strands-layer.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for d, _, files in os.walk(root):
        for f in files:
            full = os.path.join(d, f)
            z.write(full, os.path.relpath(full, root))
PY
fi
CODE_KEY="lambda/agent-$(md5sum /tmp/agent.zip | cut -c1-12).zip"
LAYER_KEY="layers/strands-$(md5sum build/strands-layer.zip | cut -c1-12).zip"
aws s3 cp /tmp/agent.zip "s3://$ART_BUCKET/$CODE_KEY" --only-show-errors
aws s3api head-object --bucket "$ART_BUCKET" --key "$LAYER_KEY" >/dev/null 2>&1 \
  || aws s3 cp build/strands-layer.zip "s3://$ART_BUCKET/$LAYER_KEY" --only-show-errors
echo "Uploaded code and Strands layer"

say "4/8 Deploying CloudFormation stack '$STACK' (first run ~5-8 min, CloudFront is the slow part)"
if ! aws cloudformation deploy --stack-name "$STACK" --template-file template.yaml \
    --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
    --parameter-overrides Prefix="$PREFIX" ArtifactBucket="$ART_BUCKET" LambdaCodeKey="$CODE_KEY" \
      LayerKey="$LAYER_KEY" ModelId="$MODEL_ID" ExistingLambdaRoleArn="${EXISTING_ROLE_ARN:-}" \
      AlertEmail="${ALERT_EMAIL:-}" MonthlyBudgetUsd="${BUDGET_USD:-50}" CrmWebhookUrl="${CRM_WEBHOOK_URL:-}"; then
  echo; echo "Stack failed. First errors:"
  aws cloudformation describe-stack-events --stack-name "$STACK" \
    --query "StackEvents[?contains(ResourceStatus,'FAILED')].[LogicalResourceId,ResourceStatusReason]" \
    --output text | head -10
  die "Deployment failed (see reasons above). Copy them to your teammate/Claude. If the stack is in ROLLBACK_COMPLETE, run: bash teardown.sh, then deploy again."
fi

out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
WEB_URL=$(out WebUrl); API_URL=$(out ApiUrl); DATA_BUCKET=$(out DataBucketName); WEB_BUCKET=$(out WebBucketName)
ADVISORS_TABLE=$(out AdvisorsTableName)
DIST_ID=$(out DistributionId); POOL_ID=$(out IdentityPoolId); FN=$(out FunctionName)
LOGS=$(out AgentLogGroupName); CRM_LOGS=$(out CrmLogGroupName)
API_URL="${API_URL%/}"

say "5/8 Seeding fictional demo advisors (with Titan embeddings)"
if [ "${RESEED:-0}" = "1" ]; then
  python3 seed/seed.py "$DATA_BUCKET" "$REGION" "$ADVISORS_TABLE" --overwrite
elif ! aws s3api head-object --bucket "$DATA_BUCKET" --key advisors.json >/dev/null 2>&1; then
  python3 seed/seed.py "$DATA_BUCKET" "$REGION" "$ADVISORS_TABLE"
else
  python3 seed/seed.py "$DATA_BUCKET" "$REGION" "$ADVISORS_TABLE" --sync-existing
  echo "Existing advisor profiles synchronized to DynamoDB (set RESEED=1 to regenerate profiles)"
fi

say "6/8 Publishing the web app"
printf '{"apiUrl":"%s","region":"%s","identityPoolId":"%s"}\n' "$API_URL" "$REGION" "$POOL_ID" > web/dist/config.json
aws s3 sync web/dist/ "s3://$WEB_BUCKET/" --delete --only-show-errors
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" --query Invalidation.Id --output text >/dev/null
echo "Uploaded and cache invalidated"

say "7/8 Smoke-testing the agent"
curl -s -m 30 "$API_URL/health" ; echo
REPLY=$(curl -s -m 95 -X POST "$API_URL/chat" -H 'content-type: application/json' \
  -d '{"message":"Hi, I am 26 and want to buy a house in 5 years. I prefer virtual meetings in English."}')
echo "$REPLY" | head -c 600; echo
echo "$REPLY" | grep -q '"reply"' || echo "(Agent call did not return a reply - check logs: aws logs tail $LOGS --since 10m)"

say "8/8 Done"
cat <<EOF

  Web app:        $WEB_URL      (may take a few minutes to load the first time)
  Agent API:      $API_URL
  Agent logs:     aws logs tail $LOGS --follow
  CRM sync logs:  aws logs tail $CRM_LOGS --follow
  Redeploy:       bash deploy.sh        (safe to re-run any time)
  Fresh advisors: RESEED=1 bash deploy.sh
  Tear down:      bash teardown.sh

EOF
