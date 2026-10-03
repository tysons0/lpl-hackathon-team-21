"""Seed ~40 synthetic (fictional) advisors with Titan embeddings into the data bucket.

Usage: python3 seed.py <data-bucket> [region]
All names are invented demo data, not real advisors.
"""
import json
import pathlib
import random
import sys


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
# Fee transparency fields shown on every match card (SKILL-04). Demo values only.
FEE_MODELS = ["Fee-based (annual % of assets)", "Fee-only (flat planning fee)", "Commission and fee (hybrid)"]
PLATFORMS = ["Advisor-managed (SAM)", "Model portfolios (MWP)"]
CITIES = [("Charlotte, NC", "28202"), ("San Diego, CA", "92101"), ("Austin, TX", "78701"),
          ("Boston, MA", "02110"), ("Fort Mill, SC", "29715"), ("Miami, FL", "33130")]



def build_advisors():
    """The full demo advisor list (no embeddings). Deterministic: same names and IDs on every run."""
    rng = random.Random(7)
    fee_rng = random.Random(11)  # separate stream so the generated advisor names stay the same
    advisors = [
        # Pinned demo advisors so the golden-path demo always has a great match.
        {"advisor_id": "adv-901", "name": "Sofia Ramirez", "city": "Miami, FL", "zip": "33130",
         "languages": ["English", "Spanish"], "meeting_types": ["virtual", "in-person"],
         "focus": ["young professionals and first-time investors", "first-time home buyers"], "open_slots": 5,
         "fee_model": "Fee-based (annual % of assets)", "platform": "Advisor-managed (SAM)",
         "bio": "Bilingual (English/Spanish). Specializes in first-time investors and saving for a first home. "
                "Patient, jargon-free, offers evening virtual meetings."},
        {"advisor_id": "adv-902", "name": "Jordan Ellis", "city": "Charlotte, NC", "zip": "28202",
         "languages": ["English"], "meeting_types": ["virtual"],
         "focus": ["student loan payoff and early retirement saving", "young professionals and first-time investors"],
         "open_slots": 4, "fee_model": "Fee-only (flat planning fee)", "platform": "Model portfolios (MWP)",
         "bio": "Works with recent grads balancing student loans, a first 401(k) and building savings. "
                "Education-first and plain-language."},
        {"advisor_id": "adv-903", "name": "Mei Lin", "city": "San Diego, CA", "zip": "92101",
         "languages": ["English", "Mandarin"], "meeting_types": ["virtual", "in-person"],
         "focus": ["young professionals and first-time investors", "first-time home buyers"],
         "open_slots": 5, "fee_model": "Fee-only (flat planning fee)", "platform": "Model portfolios (MWP)",
         "bio": "Bilingual (English/Mandarin). Helps first-time investors and families new to the US financial system. Patient and jargon-free."},
    ]
    used = {a["name"] for a in advisors}
    i = 0
    while len(advisors) < 42:
        name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        if name in used:
            continue
        used.add(name)
        focus = rng.sample(FOCUS, 2)
        city, zipc = rng.choice(CITIES)
        langs = ["English"] + (["Spanish"] if rng.random() < 0.35 else []) + (["Mandarin"] if rng.random() < 0.1 else [])
        advisors.append({
            "advisor_id": f"adv-{i:03d}", "name": name, "city": city, "zip": zipc, "languages": langs,
            "meeting_types": rng.choice([["virtual"], ["in-person"], ["virtual", "in-person"]]),
            "focus": focus, "open_slots": rng.randint(0, 6),
            "fee_model": fee_rng.choice(FEE_MODELS), "platform": fee_rng.choice(PLATFORMS),
            "bio": f"Works mostly with {focus[0]} and {focus[1]}. Plain-language, patient, education-first.",
        })
        i += 1
    return advisors


def main():
    import boto3

    bucket = sys.argv[1]
    region = sys.argv[2] if len(sys.argv) > 2 else "us-east-1"
    br = boto3.client("bedrock-runtime", region_name=region)
    s3 = boto3.client("s3", region_name=region)

    def embed(text):
        r = br.invoke_model(modelId="amazon.titan-embed-text-v2:0",
                            body=json.dumps({"inputText": text, "normalize": True}))
        return json.loads(r["body"].read())["embedding"]

    advisors = build_advisors()
    # Optional headshots: drop licensed photos at web/public/advisors/<advisor_id>.jpg (or .png/.webp).
    # Advisors without one get a generated initials avatar in the web app. Do not use photos of real
    # people for these fictional advisors unless the license allows it.
    PHOTO_DIR = pathlib.Path(__file__).resolve().parent.parent / "web" / "public" / "advisors"
    for a in advisors:
        photo = next((p for ext in ("jpg", "png", "webp") if (p := PHOTO_DIR / f"{a['advisor_id']}.{ext}").exists()), None)
        if photo:
            a["photo_url"] = f"/advisors/{photo.name}"

    for n, a in enumerate(advisors, 1):
        a["embedding"] = embed(f"{a['bio']} Focus: {', '.join(a['focus'])}. Languages: {', '.join(a['languages'])}.")
        print(f"\rembedded {n}/{len(advisors)}", end="", flush=True)

    s3.put_object(Bucket=bucket, Key="advisors.json", Body=json.dumps(advisors).encode())
    print(f"\nseeded {len(advisors)} advisors to s3://{bucket}/advisors.json")


if __name__ == "__main__":
    main()
