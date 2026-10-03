"""Seed fictional advisor profiles and localized glossary rows in DynamoDB.

Usage: python3 seed.py <advisor-profiles-table> <glossary-table> [region]
Names, profiles, and availability are synthetic demo data.
"""
import random
import sys

import boto3

FIRST = ["Maya", "Luis", "Priya", "James", "Ana", "Kevin", "Grace", "Omar", "Elena", "Marcus",
         "Dana", "Tomas", "Aisha", "Ben", "Carmen", "Derek", "Lena", "Victor", "Nora", "Isaac"]
LAST = ["Rivera", "Chen", "Patel", "Brooks", "Nguyen", "Okafor", "Silva", "Kim", "Hughes", "Diaz",
        "Moreno", "Walsh", "Reyes", "Foster", "Lam", "Castillo", "Grant", "Ortiz", "Bell", "Shah"]
SPECIALTIES = [
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
CITIES = [("Charlotte", "NC"), ("San Diego", "CA"), ("Austin", "TX"),
          ("Boston", "MA"), ("Fort Mill", "SC"), ("Miami", "FL")]


def advisor_profiles():
    rng = random.Random(7)
    used = set()
    profiles = []
    for index in range(42):
        if index == 0:
            name = "Sofia Ramirez"
        elif index == 1:
            name = "Jordan Ellis"
        else:
            while True:
                name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
                if name not in used:
                    break
        used.add(name)
        specialties = rng.sample(SPECIALTIES, 2)
        city, state = CITIES[index % len(CITIES)]
        languages = ["English"]
        if rng.random() < 0.35:
            languages.append("Spanish")
        if rng.random() < 0.10:
            languages.append("Mandarin")
        if index == 0:
            languages = ["English", "Spanish"]
            specialties = ["young professionals and first-time investors", "first-time home buyers"]
            city, state = "Miami", "FL"
        elif index == 1:
            languages = ["English"]
            specialties = ["student loan payoff and early retirement saving", "young professionals and first-time investors"]
            city, state = "Charlotte", "NC"
        modes = rng.choice([["virtual"], ["in-person"], ["virtual", "in-person"]])
        if index == 0:
            modes = ["virtual", "in-person"]
        elif index == 1:
            modes = ["virtual"]
        advisor_id = f"adv-{901 if index == 0 else 902 if index == 1 else index - 2:03d}"
        availability = "ACCEPTING" if index < 38 else "WAITLIST"
        if index == 0:
            advisor_id = "adv-901"
            availability = "ACCEPTING"
        elif index == 1:
            advisor_id = "adv-902"
            availability = "ACCEPTING"
        min_assets = [0, 0, 25000, 100000, 500000][index % 5]
        profiles.append({
            "PK": "ADVISOR#" + advisor_id,
            "SK": "PROFILE",
            "advisorId": advisor_id,
            "name": name,
            "city": city + ", " + state,
            "specialties": specialties,
            "languages": languages,
            "communicationModes": modes,
            "credentials": [],
            "minInvestableAssets": min_assets,
            "geography": {"state": state, "servesRemote": "virtual" in modes},
            "geographyState": state,
            "availabilityAdvisor": availability + "#" + advisor_id,
            "availabilityStatus": availability,
            "active": True,
            "bio": f"Works with {specialties[0]} and {specialties[1]}. Patient, education-first, and plain-language.",
        })
    return profiles


GLOSSARY = {
    "fiduciary": {
        "en": ("fiduciary", "A person who must put a client's interests first when giving advice.", "Advice"),
        "es": ("fiduciario", "Persona que debe poner primero los intereses del cliente al dar asesoría.", "Asesoría"),
        "zh": ("受托责任", "提供建议时，必须把客户利益放在首位的责任。", "顾问服务"),
    },
    "form-crs": {
        "en": ("Form CRS", "A short document that explains an advisor's services, fees, and conflicts.", "Disclosure"),
        "es": ("Formulario CRS", "Documento breve que explica los servicios, costos y conflictos de un asesor.", "Divulgación"),
        "zh": ("CRS 表格", "简要说明顾问服务、费用和利益冲突的文件。", "披露"),
    },
    "diversification": {
        "en": ("diversification", "Spreading money across different investments to avoid relying on just one.", "Investing"),
        "es": ("diversificación", "Repartir el dinero entre distintas inversiones para no depender de una sola.", "Inversión"),
        "zh": ("分散投资", "把资金分配到不同投资中，避免只依赖一种投资。", "投资"),
    },
    "assets": {
        "en": ("assets", "Things you own that have financial value, such as savings or investments.", "Planning"),
        "es": ("activos", "Bienes con valor económico, como ahorros o inversiones.", "Planificación"),
        "zh": ("资产", "具有经济价值的所有物，例如储蓄或投资。", "规划"),
    },
    "fee": {
        "en": ("fee", "Money charged for a service.", "Costs"),
        "es": ("honorario", "Dinero que se cobra por un servicio.", "Costos"),
        "zh": ("费用", "为一项服务支付的金额。", "费用"),
    },
    "brokerage": {
        "en": ("brokerage", "A firm that helps people buy or sell investments.", "Investing"),
        "es": ("correduría", "Empresa que ayuda a las personas a comprar o vender inversiones.", "Inversión"),
        "zh": ("经纪公司", "帮助人们买卖投资产品的公司。", "投资"),
    },
    "retirement": {
        "en": ("retirement", "The time when someone stops working full time.", "Planning"),
        "es": ("jubilación", "Etapa en la que una persona deja de trabajar a tiempo completo.", "Planificación"),
        "zh": ("退休", "一个人停止全职工作的阶段。", "规划"),
    },
    "compound-interest": {
        "en": ("compound interest", "Interest earned on your savings and on earlier interest.", "Saving"),
        "es": ("interés compuesto", "Interés que se gana sobre los ahorros y sobre intereses anteriores.", "Ahorro"),
        "zh": ("复利", "储蓄本金和之前赚取的利息继续产生的利息。", "储蓄"),
    },
}


def glossary_items():
    items = []
    for slug, translations in GLOSSARY.items():
        for language, definition in translations.items():
            display_term, text, category = definition
            items.append({
                "PK": "TERM#" + slug,
                "SK": "LANG#" + language,
                "displayTerm": display_term,
                "definition": text,
                "category": category,
                "audioHint": display_term,
                "lastReviewedBy": "demo-seed-unreviewed",
            })
    return items


def seed(profiles_table, glossary_table):
    profiles = advisor_profiles()
    with profiles_table.batch_writer(overwrite_by_pkeys=["PK", "SK"]) as batch:
        for profile in profiles:
            batch.put_item(Item=profile)
    terms = glossary_items()
    with glossary_table.batch_writer(overwrite_by_pkeys=["PK", "SK"]) as batch:
        for term in terms:
            batch.put_item(Item=term)
    print(f"Seeded {len(profiles)} fictional advisor profiles and {len(terms)} glossary rows.")
    return profiles, terms


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if len(argv) not in {2, 3}:
        raise SystemExit(__doc__)
    profiles_table_name, glossary_table_name = argv[:2]
    region = argv[2] if len(argv) == 3 else "us-east-1"
    ddb = boto3.resource("dynamodb", region_name=region)
    seed(ddb.Table(profiles_table_name), ddb.Table(glossary_table_name))


if __name__ == "__main__":
    main()
