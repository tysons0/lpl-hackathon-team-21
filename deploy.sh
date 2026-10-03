#!/usr/bin/env bash
# Advisor Match - one-command deploy for AWS CloudShell (us-east-1).
# Usage:  bash deploy.sh
# Optional env vars: MODEL_ID=<inference profile id> EXISTING_ROLE_ARN=<lambda role arn>
# ADMIN_TOKEN=<private dashboard token> RESERVED_CONCURRENCY=0 RESEED=1
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
MODEL_RESOURCE_ARNS=$(MODEL_ID="$MODEL_ID" python3 - <<'PY'
import os, boto3
model_id = os.environ["MODEL_ID"]
profile = boto3.client("bedrock").get_inference_profile(inferenceProfileIdentifier=model_id)
arns = {profile["inferenceProfileArn"]}
arns.update(model["modelArn"] for model in profile.get("models", []))
print(",".join(sorted(arns)))
PY
) || die "Could not resolve the selected inference profile and foundation model ARNs. Set MODEL_ID to an inference profile available in this region."
say "3/8 Packaging the agent Lambda"
say "Building the static web app"
(cd web && npm ci && npm run build) || die "Frontend build failed. Check Node.js/npm availability and web dependencies."
ART_BUCKET="${PREFIX}-artifacts-${ACCOUNT}-${REGION}"
aws s3api head-bucket --bucket "$ART_BUCKET" 2>/dev/null || aws s3 mb "s3://$ART_BUCKET" >/dev/null
python3 -c "import zipfile; z=zipfile.ZipFile('/tmp/agent.zip','w',zipfile.ZIP_DEFLATED); z.write('backend/lambda_function.py','lambda_function.py'); z.close()"
CODE_KEY="lambda/agent-$(md5sum /tmp/agent.zip | cut -c1-12).zip"
aws s3 cp /tmp/agent.zip "s3://$ART_BUCKET/$CODE_KEY" --only-show-errors
echo "Uploaded Lambda code"

say "4/8 Deploying CloudFormation stack '$STACK' (first run ~5-8 min, CloudFront is the slow part)"
if ! aws cloudformation deploy --stack-name "$STACK" --template-file template.yaml \
    --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
    --parameter-overrides Prefix="$PREFIX" ArtifactBucket="$ART_BUCKET" LambdaCodeKey="$CODE_KEY" \
      ModelId="$MODEL_ID" ModelResourceArns="$MODEL_RESOURCE_ARNS" \
      AdminToken="${ADMIN_TOKEN:-}" ReservedConcurrency="${RESERVED_CONCURRENCY:-0}" \
      ExistingLambdaRoleArn="${EXISTING_ROLE_ARN:-}"; then
  echo; echo "Stack failed. First errors:"
  aws cloudformation describe-stack-events --stack-name "$STACK" \
    --query "StackEvents[?contains(ResourceStatus,'FAILED')].[LogicalResourceId,ResourceStatusReason]" \
    --output text | head -10
  die "Deployment failed (see reasons above). Copy them to your teammate/Claude. If the stack is in ROLLBACK_COMPLETE, run: bash teardown.sh, then deploy again."
fi

out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
WEB_URL=$(out WebUrl); API_URL=$(out ApiUrl); WEB_BUCKET=$(out WebBucketName)
DIST_ID=$(out DistributionId); FN=$(out FunctionName)
PROFILES_TABLE=$(out AdvisorProfilesTableName); GLOSSARY_TABLE=$(out GlossaryTableName)
API_URL="${API_URL%/}"

say "5/8 Seeding fictional advisor profiles and glossary terms"
PROFILE_COUNT=$(aws dynamodb scan --table-name "$PROFILES_TABLE" --select COUNT --limit 1 --query Count --output text)
GLOSSARY_COUNT=$(aws dynamodb scan --table-name "$GLOSSARY_TABLE" --select COUNT --limit 1 --query Count --output text)
if [ "${RESEED:-0}" = "1" ] || [ "$PROFILE_COUNT" = "0" ] || [ "$GLOSSARY_COUNT" = "0" ]; then
  python3 seed/seed.py "$PROFILES_TABLE" "$GLOSSARY_TABLE" "$REGION"
else
  echo "Profiles and glossary already have records (set RESEED=1 to refresh them)"
fi

say "6/8 Publishing the web app"
printf '{"apiUrl":"%s","region":"%s"}\n' "$API_URL" "$REGION" > web/dist/config.json
aws s3 sync web/dist/ "s3://$WEB_BUCKET/" --delete --only-show-errors
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" --query Invalidation.Id --output text >/dev/null
echo "Uploaded and cache invalidated"

say "7/8 Smoke-testing the agent"
curl -fsS --max-time 10 "$API_URL/health" ; echo
SESSION=$(curl -fsS --max-time 15 -X POST "$API_URL/session" -H 'content-type: application/json' \
  -d '{"preferredLanguage":"en-US"}') || die "Session init failed. Check API Gateway/Lambda logs: aws logs tail /aws/lambda/$FN --since 10m"
SESSION_ID=$(printf '%s' "$SESSION" | python3 -c 'import json,sys; print(json.load(sys.stdin)["sessionId"])') \
  || die "Session init did not return a sessionId: $SESSION"
REPLY=$(curl -fsS --max-time 35 -X POST "$API_URL/session/$SESSION_ID/message" -H 'content-type: application/json' \
  -d '{"message":"I am exploring financial advisors. Please ask me one intake question.","preferredLanguage":"en-US","version":0}') \
  || die "Session message failed. Check API Gateway/Lambda logs: aws logs tail /aws/lambda/$FN --since 10m"
echo "$REPLY" | head -c 600; echo
echo "$REPLY" | grep -Eq '"(text|reply)"' || die "Session message returned no response text: $REPLY"

say "8/8 Done"
cat <<EOF

  Web app:        $WEB_URL      (may take a few minutes to load the first time)
  Agent API:      $API_URL
  Lambda logs:    aws logs tail /aws/lambda/$FN --follow
  Redeploy:       bash deploy.sh        (safe to re-run any time)
  Fresh advisors: RESEED=1 bash deploy.sh
  Tear down:      bash teardown.sh

EOF
