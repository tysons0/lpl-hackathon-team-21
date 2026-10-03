"""Seed fictional advisor profiles into DynamoDB and matching embeddings into S3.

Usage: python3 seed.py <data-bucket> <region> <advisors-table> [--sync-existing]
Use --sync-existing to copy the already-seeded S3 profiles into a newly-created table.
"""
import argparse
import json
import pathlib
import random

import boto3
from boto3.dynamodb.conditions import Attr

FIRST = ["Maya", "Luis", "Priya", "James", "Ana", "Kevin", "Grace", "Omar", "Elena", "Marcus",
         "Dana", "Tomas", "Aisha", "Ben", "Carmen", "Derek", "Lena", "Victor", "Nora", "Isaac"]
LAST = ["Rivera", "Chen", "Patel", "Brooks", "Nguyen", "Okafor", "Silva", "Kim", "Hughes", "Diaz",
        "Moreno", "Walsh", "Reyes", "Foster", "Lam", "Castillo", "Grant", "Ortiz", "Bell", "Shah"]
FOCUS = [
    "young professionals and first-time investors",
    "first-time home buyers",
    "student loan payoff and early retirement saving",
    "new parents and college savings",
    "small business owners",
    "pre-retirees and retirement income",
    "inheritance and estate transitions",
    "tech employees with equity compensation",
    "military families",
    "teachers and public-sector pensions",
]
FEE_MODELS = ["Fee-based (annual % of assets)", "Fee-only (flat planning fee)", "Commission and fee (hybrid)"]
PLATFORMS = ["Advisor-managed (SAM)", "Model portfolios (MWP)"]
CITIES = [("Charlotte, NC", "28202"), ("San Diego, CA", "92101"), ("Austin, TX", "78701"),
          ("Boston, MA", "02110"), ("Fort Mill, SC", "29715"), ("Miami, FL", "33130")]
PHOTO_DIR = pathlib.Path(__file__).resolve().parent.parent / "web" / "public" / "advisors"


def embed(client, text):
    response = client.invoke_model(
        modelId="amazon.titan-embed-text-v2:0",
        body=json.dumps({"inputText": text, "normalize": True}),
    )
    return json.loads(response["body"].read())["embedding"]


def build_advisors(client):
    random.seed(7)
    fee_rng = random.Random(11)
    advisors = [
        {"advisor_id": "adv-901", "name": "Sofia Ramirez", "city": "Miami, FL", "zip": "33130",
         "languages": ["English", "Spanish"], "meeting_types": ["virtual", "in-person"],
         "focus": ["young professionals and first-time investors", "first-time home buyers"], "open_slots": 5,
         "fee_model": "Fee-based (annual % of assets)", "platform": "Advisor-managed (SAM)",
         "bio": "Bilingual (English/Spanish). Specializes in first-time investors and saving for a first home. "
                "Patient, jargon-free, offers evening virtual meetings."},
        {"advisor_id": "adv-903", "name": "Mei Lin", "city": "San Diego, CA", "zip": "92101",
         "languages": ["English", "Mandarin"], "meeting_types": ["virtual", "in-person"],
         "focus": ["young professionals and first-time investors", "first-time home buyers"], "open_slots": 5,
         "bio": "Bilingual (English/Mandarin). Helps first-time investors and families new to the US financial system. "
                "Patient and jargon-free."},
        {"advisor_id": "adv-902", "name": "Jordan Ellis", "city": "Charlotte, NC", "zip": "28202",
         "languages": ["English"], "meeting_types": ["virtual"],
         "focus": ["student loan payoff and early retirement saving", "young professionals and first-time investors"],
         "open_slots": 4, "fee_model": "Fee-only (flat planning fee)", "platform": "Model portfolios (MWP)",
         "bio": "Works with recent grads balancing student loans, a first 401(k) and building savings. "
                "Education-first and plain-language."},
    ]
    used = {advisor["name"] for advisor in advisors}
    index = 0
    while len(advisors) < 42:
        name = f"{random.choice(FIRST)} {random.choice(LAST)}"
        if name in used:
            continue
        used.add(name)
        focus = random.sample(FOCUS, 2)
        city, zip_code = random.choice(CITIES)
        languages = ["English"] + (["Spanish"] if random.random() < 0.35 else [])
        if random.random() < 0.1:
            languages.append("Mandarin")
        advisors.append({
            "advisor_id": f"adv-{index:03d}", "name": name, "city": city, "zip": zip_code,
            "languages": languages,
            "meeting_types": random.choice([["virtual"], ["in-person"], ["virtual", "in-person"]]),
            "focus": focus, "open_slots": random.randint(0, 6),
            "fee_model": fee_rng.choice(FEE_MODELS), "platform": fee_rng.choice(PLATFORMS),
            "bio": f"Works mostly with {focus[0]} and {focus[1]}. Plain-language, patient, education-first.",
        })
        index += 1

    for advisor in advisors:
        photo = next((PHOTO_DIR / f"{advisor['advisor_id']}.{extension}"
                      for extension in ("jpg", "png", "webp")
                      if (PHOTO_DIR / f"{advisor['advisor_id']}.{extension}").exists()), None)
        if photo:
            advisor["photo_url"] = f"/advisors/{photo.name}"
        advisor["embedding"] = embed(
            client,
            f"{advisor['bio']} Focus: {', '.join(advisor['focus'])}. Languages: {', '.join(advisor['languages'])}.",
        )
    return advisors


def sync_inventory(table, profiles, overwrite=False):
    inserted = 0
    preserved = 0
    for profile in profiles:
        # Embeddings remain in S3 for ranking; DynamoDB stores the advisor directory record.
        item = {key: value for key, value in profile.items() if key != "embedding"}
        if overwrite:
            table.put_item(Item=item)
            inserted += 1
            continue
        try:
            table.put_item(Item=item, ConditionExpression=Attr("advisor_id").not_exists())
            inserted += 1
        except table.meta.client.exceptions.ConditionalCheckFailedException:
            preserved += 1
    return inserted, preserved


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("data_bucket")
    parser.add_argument("region")
    parser.add_argument("advisors_table")
    parser.add_argument("--sync-existing", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    s3 = boto3.client("s3", region_name=args.region)
    table = boto3.resource("dynamodb", region_name=args.region).Table(args.advisors_table)
    if args.sync_existing:
        response = s3.get_object(Bucket=args.data_bucket, Key="advisors.json")
        profiles = json.loads(response["Body"].read())
    else:
        profiles = build_advisors(boto3.client("bedrock-runtime", region_name=args.region))
        s3.put_object(Bucket=args.data_bucket, Key="advisors.json", Body=json.dumps(profiles).encode())

    inserted, preserved = sync_inventory(table, profiles, overwrite=args.overwrite)
    print(f"synchronized {inserted} advisor profiles and preserved {preserved} existing records "
          f"in DynamoDB table {args.advisors_table}")


if __name__ == "__main__":
    main()
