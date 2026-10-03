"""Advisor Match agent Lambda.

Routes (Lambda Function URL, JSON in / JSON out):
  POST /chat      {message, session_id?, lang?, simple?} -> {session_id, reply, progress, matches?, booking?, briefing?}
  POST /speak     {text, lang?}                           -> {audio_b64}
    POST /metrics   {range?, start_date?, end_date?}         -> {start_date, end_date, funnel}
    POST /insights  {funnel, start_date?, end_date?}         -> {recommendations}
  POST /bookings  {}                                      -> {bookings}
  POST /advisors  {language?, meeting_type?, text?}       -> {advisors, total}
  POST /availability {advisor_id, date}                   -> {date, times: [{time, label, available}]}
  POST /bookings/update {booking_id, session_id, date?, time?, purpose?} -> {booking}
  POST /bookings/cancel {booking_id, session_id}          -> {booking}  (status "cancelled", time freed)
  POST /bookings/get    {booking_id, session_id}          -> {booking}  (404 if gone or not this session's)
/chat also accepts booking: {advisor_id, first_name, date, time, purpose} from the booking form.
  GET  /health                                            -> {ok}

Matching logic lives in matching.py, metrics/logging in observability.py, CRM sync in crm_sync.py.
See docs/skills-applied.md for which skill each piece implements.
"""
import base64
import datetime
import json
import os
import time
import uuid
from decimal import Decimal
from typing import Optional
from urllib.parse import urlencode

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError
from pydantic import BaseModel, Field, ValidationError
from strands import Agent, tool
from strands.models import BedrockModel
from strands.session.s3_session_manager import S3SessionManager

import matching
import scheduling
from observability import emit_metric, log

S3 = boto3.client("s3")
DDB = boto3.resource("dynamodb")
BR = boto3.client("bedrock-runtime")
POLLY = boto3.client("polly")
EVENTS = boto3.client("events")
BOOKINGS = DDB.Table(os.environ["BOOKINGS_TABLE"])
FUNNEL = DDB.Table(os.environ["FUNNEL_TABLE"])
INTAKE = DDB.Table(os.environ["INTAKE_TABLE"])
DATA_BUCKET = os.environ["DATA_BUCKET"]
EVENT_BUS = os.environ.get("EVENT_BUS", "")
SESSION_TTL_SECONDS = 24 * 3600  # SKILL-01: anonymous intake state expires after 24h

_ADVISORS = None  # cached across warm invocations
UI = {}  # structured results for the frontend; reset on every /chat request

SYSTEM_PROMPT = """You are Advisor Match, a warm, patient guide that helps first-time investors
find the right financial advisor and feel ready for their first meeting.

How to talk:
- Ask ONE short question at a time. Keep replies under 80 words unless explaining a term.
- Use plain words a 6th grader understands. If you must use a financial term, explain it in one sentence.
- Always reply in the same language the user writes in (English, Spanish or Mandarin).

Decoding what they mean:
- People often describe money moves in their own words ("move my old job's retirement thing into
  checking"). Work out the standard financial term for what they are asking about (e.g. "401(k)
  rollover to an IRA", "401(k) early withdrawal", "Roth conversion") and save it with record_preferences
  as financial_intent. That term is for matching and the advisor's brief: do not ask them to confirm it,
  since they may not know it. Only check the outcome in their own words (e.g. "So you'd like the $6,000
  from your old job's retirement account to end up in your checking account, right?"). If there is a
  tax side they should know about (e.g. cashing out a 401(k) early can mean taxes and a penalty), say so
  in one plain sentence and say their advisor can walk them through the options. Do not advise.
- Include the financial_intent in the needs you pass to search_advisors.

What to learn before matching (ask naturally, skip what they already told you):
1. Their main goal (e.g., buy a home, pay off loans, start saving for retirement)
2. Their life stage / situation in a sentence
3. What worries them about money or meeting an advisor
4. Preferred language
5. Virtual or in-person meeting
Nice to know (only if it comes up naturally): whether they want an advisor to guide them or to help
them decide themselves, and how often they want to hear from their advisor.

Tools:
- Whenever you learn any of the above, call record_preferences with just the new facts.
- As soon as you know the goal, language and meeting type, call search_advisors with a short
  plain-language summary of their needs. If they said what matters most to them (expertise,
  language, meeting type or availability), pass it as most_important. Then briefly say why each
  advisor fits (one line each, using the reasons the tool returned) and ask which one they'd like
  to meet and what day/time works.
- The app has a booking form where they pick a date, a time and what the meeting is for. When they
  choose an advisor, tell them to use it. If they only chat, ask for their first name and a time,
  then call book_meeting with the advisor_id from search_advisors or find_advisor. When you can
  determine a specific date and time from their words, also turn them into a date (YYYY-MM-DD) and
  a 24-hour time (HH:MM) using today's date (given in each message), and pass them as date and time.
- If a message says the meeting is already booked, never call book_meeting again.
- To change or cancel a meeting, call my_bookings first to get the booking_id.
  To move it, turn their words into a date (YYYY-MM-DD) and a 24-hour time (HH:MM) using today's date
  (given in each message), then call reschedule_meeting. Meetings are on weekdays, 9:00 to 18:00, on the
  hour or half hour. If the tool says a time is taken or not allowed, offer the open times it returns.
  They can also change what the meeting is about the same way.
- Only call cancel_meeting when they clearly ask to cancel. If you're not sure, ask first.
  After cancelling, tell them the time is free again and offer to help book a new one.
- Right after booking, call create_advisor_briefing, then give the user a short
  "First Meeting Ready" kit: 3 terms explained simply, 4 questions to ask (always include
  "How are you paid?" and "What will this cost me?"), and a what-to-bring checklist.
  Mention they will receive a Form CRS (a short summary of how the advisor works and is paid).
  If the booking result has a calendar_link, include it in the reply as a Markdown link.

Rules:
- Never recommend specific investments, funds, allocations, or tell anyone what to buy, sell or hold.
  Educate, then say it's a great question for their advisor.
- Only mention advisors that a tool returned (search_advisors, find_advisor, my_bookings) or that the app
  tells you the person picked or booked from the advisor list. Those are all real. Never invent names,
  credentials or IDs.
- If the person names an advisor you haven't seen in this chat, call find_advisor with that name before
  saying anything about them. Never say an advisor doesn't exist without checking find_advisor first.
- Never ask for Social Security numbers, account numbers, emails, phone numbers, addresses or passwords.
- Advisors shown are from a demo dataset."""


# ---------- request schemas (SKILL-09: validate every request) ----------
class BookingForm(BaseModel):
    advisor_id: str = Field(pattern=r"^adv-[0-9]{1,6}$")
    first_name: str = Field(min_length=1, max_length=40)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    time: str = Field(pattern=r"^\d{2}:\d{2}$")
    purpose: str = Field(default="", max_length=scheduling.MAX_PURPOSE_CHARS)


class AvailabilityRequest(BaseModel):
    advisor_id: str = Field(pattern=r"^adv-[0-9]{1,6}$")
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class BookingUpdate(BaseModel):
    booking_id: str = Field(pattern=r"^[a-f0-9]{10}$")
    session_id: str = Field(pattern=r"^[A-Za-z0-9-]{8,64}$")
    date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    time: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    purpose: Optional[str] = Field(default=None, max_length=scheduling.MAX_PURPOSE_CHARS)
    lang: str = "English"


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: Optional[str] = Field(default=None, pattern=r"^[A-Za-z0-9-]{8,64}$")
    lang: str = "English"
    simple: bool = False
    selected_advisor_id: Optional[str] = Field(default=None, pattern=r"^adv-[0-9]{1,6}$")
    booking: Optional[BookingForm] = None


class BookingCancel(BaseModel):
    booking_id: str = Field(pattern=r"^[a-f0-9]{10}$")
    session_id: str = Field(pattern=r"^[A-Za-z0-9-]{8,64}$")


class DirectoryRequest(BaseModel):
    language: str = Field(default="", max_length=30)
    meeting_type: str = Field(default="", max_length=30)
    text: str = Field(default="", max_length=100)


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1)
    lang: str = "en"


# ---------- helpers ----------
def advisors():
    global _ADVISORS
    if _ADVISORS is None:
        obj = S3.get_object(Bucket=DATA_BUCKET, Key="advisors.json")
        _ADVISORS = json.loads(obj["Body"].read())
    return _ADVISORS


def embed(text):
    r = BR.invoke_model(
        modelId="amazon.titan-embed-text-v2:0",
        body=json.dumps({"inputText": text[:8000], "normalize": True}),
    )
    return json.loads(r["body"].read())["embedding"]


def today():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")


def metric_dates(kind, year=None, month=None, quarter=None, start_date=None, end_date=None):
    current = datetime.datetime.now(datetime.timezone.utc).date()
    if kind == "daily":
        return current, current
    if kind == "month":
        selected_year = int(year or current.year)
        selected_month = int(month or current.month)
        start = datetime.date(selected_year, selected_month, 1)
        next_month = selected_month % 12 + 1
        next_year = selected_year + (selected_month == 12)
        end = datetime.date(next_year, next_month, 1) - datetime.timedelta(days=1)
        return start, min(end, current)
    if kind == "quarter":
        selected_year = int(year or current.year)
        selected_quarter = int(quarter or ((current.month - 1) // 3) + 1)
        start_month = (selected_quarter - 1) * 3 + 1
        start = datetime.date(selected_year, start_month, 1)
        end_month = start_month + 3
        end = datetime.date(selected_year + (end_month > 12), (end_month - 1) % 12 + 1, 1) - datetime.timedelta(days=1)
        return start, min(end, current)
    if kind == "year":
        selected_year = int(year or current.year)
        return datetime.date(selected_year, 1, 1), min(datetime.date(selected_year, 12, 31), current)
    if kind == "quarterly":
        quarter_start_month = ((current.month - 1) // 3) * 3 + 1
        return current.replace(month=quarter_start_month, day=1), current
    if kind == "custom":
        try:
            start = datetime.date.fromisoformat(start_date or "")
            end = datetime.date.fromisoformat(end_date or "")
        except ValueError as exc:
            raise ValueError("custom metrics require valid start_date and end_date") from exc
        if start > end:
            raise ValueError("start_date must be on or before end_date")
        return start, end
    return current.replace(year=2000, month=1, day=1), current


def actionable_insights(funnel):
    matched = int(funnel.get("matched", 0) or 0)
    booked = int(funnel.get("booked", 0) or 0)
    briefed = int(funnel.get("briefing_sent", 0) or 0)
    conversion = round(booked / matched * 100) if matched else 0
    recommendations = []
    if not matched:
        recommendations.append({
            "priority": "high",
            "id": "first_proof",
            "values": {},
            "title": "Create the first proof point",
            "body": "Run 3 to 5 golden-path intakes so the demo can show advisor matches, booking momentum, and a before-and-after story.",
            "metric": "matched = 0",
        })
    elif conversion < 25:
        recommendations.append({
            "priority": "high",
            "id": "conversion",
            "values": {"conversion": conversion},
            "title": "Improve match-to-meeting conversion",
            "body": "Show the best-fit advisor first, explain why they fit, and offer two concrete meeting times immediately after matching.",
            "metric": f"conversion = {conversion}%",
        })
    else:
        recommendations.append({
            "priority": "positive",
            "id": "scale",
            "values": {"conversion": conversion},
            "title": "Scale the matching motion",
            "body": "Conversion is showing momentum. The biggest upside now comes from routing more qualified prospects into the same guided experience.",
            "metric": f"conversion = {conversion}%",
        })
    if matched and briefed / matched < 0.8:
        recommendations.append({
            "priority": "medium",
            "id": "handoff",
            "values": {"rate": round(briefed / matched * 100)},
            "title": "Close the advisor handoff loop",
            "body": "Increase briefing completion so advisors receive goals and concerns before the meeting. This protects the value of the match beyond the first click.",
            "metric": f"briefing rate = {round(briefed / matched * 100)}%",
        })
    if matched >= 3:
        recommendations.append({
            "priority": "medium",
            "id": "prove",
            "values": {"matched": matched},
            "title": "Make the value easy to prove",
            "body": "Lead the pitch with matches delivered, booking rate, and modeled fee opportunity. Pair modeled value with observed counts.",
            "metric": f"{matched} matches observed",
        })
    return recommendations


def log_event(stage, session_id):
    now = datetime.datetime.now(datetime.timezone.utc)
    FUNNEL.put_item(
        Item={
            "day": now.strftime("%Y-%m-%d"),
            "ts_id": f"{now.isoformat()}#{uuid.uuid4().hex[:6]}",
            "stage": stage,
            "session_id": session_id,
        }
    )


def get_state(session_id):
    item = INTAKE.get_item(Key={"session_id": session_id}).get("Item") or {}
    return {"slots": item.get("slots", {}), "matched_ids": item.get("matched_ids", []),
            "compliance_flags": item.get("compliance_flags", [])}


def save_state(session_id, **fields):
    names = {f"#{k}": k for k in fields}
    values = {f":{k}": v for k, v in fields.items()}
    names["#exp"], values[":exp"] = "expires_at", int(time.time()) + SESSION_TTL_SECONDS
    INTAKE.update_item(
        Key={"session_id": session_id},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in [*fields, "exp"]),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


def add_compliance_flag(session_id, flag):
    state = get_state(session_id)
    save_state(session_id, compliance_flags=(state["compliance_flags"] + [flag])[-20:])
    log_event(flag.split(":")[0], session_id)


def public_advisor(scored, ahp, prefs):
    a = scored["advisor"]
    out = {k: a[k] for k in ("advisor_id", "name", "city", "languages", "meeting_types", "focus", "bio")}
    if a.get("photo_url"):
        out["photo_url"] = a["photo_url"]
    out["match_score"] = round(scored["score"] * 100)
    out["fit"] = "Strong fit" if scored["score"] >= 0.75 else "Good fit"
    out["reasons"] = matching.match_reasons(a, scored["criteria"], prefs)
    out["drivers"] = matching.top_drivers(ahp["weights"])
    out["disclosure"] = matching.fee_disclosure(a)
    return out


def _json_default(o):
    if isinstance(o, Decimal):
        return int(o) if o == int(o) else float(o)
    return str(o)


def respond(status, payload):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(payload, default=_json_default),
    }


def publish_booking_event(booking, briefing, slots, detail_type="ClientConsultationBooked"):
    """SKILL-05/10: hand the booking to the CRM pipeline asynchronously (EventBridge -> SQS -> crm_sync)."""
    if not EVENT_BUS:
        return
    detail = {"booking": booking, "briefing": briefing,
              "preferences": {k: v for k, v in slots.items() if k != "worries"}}
    res = EVENTS.put_events(Entries=[{
        "Source": "advisor-match.booking",
        "DetailType": detail_type,
        "Detail": json.dumps(detail, default=_json_default),
        "EventBusName": EVENT_BUS,
    }])
    if res.get("FailedEntryCount"):
        log("booking_event_failed", booking_id=booking["booking_id"], entries=res.get("Entries"), level="ERROR")
        emit_metric("BookingEventFailed")


# ---------- scheduled bookings (booking form: date, time, meeting purpose) ----------
class SlotTaken(Exception):
    pass


def lock_slot(advisor_id, date, time_, booking_id):
    """Claim advisor+date+time so nobody else can book it. Raises SlotTaken if it is already claimed."""
    try:
        BOOKINGS.put_item(
            Item={"booking_id": scheduling.slot_key(advisor_id, date, time_), "kind": "slot_lock",
                  "for_booking": booking_id},
            ConditionExpression="attribute_not_exists(booking_id)",
        )
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            raise SlotTaken() from e
        raise


def taken_times(advisor_id, date):
    keys = [{"booking_id": scheduling.slot_key(advisor_id, date, t)} for t in scheduling.TIMES]
    res = DDB.batch_get_item(RequestItems={BOOKINGS.name: {"Keys": keys, "ProjectionExpression": "booking_id"}})
    found = {i["booking_id"] for i in res.get("Responses", {}).get(BOOKINGS.name, [])}
    return {t for t in scheduling.TIMES if scheduling.slot_key(advisor_id, date, t) in found}


def calendar_link(advisor_name, date, time, purpose):
    """Build a Google Calendar add-event URL for a 30-minute advisor meeting."""
    start = datetime.datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M")
    end = start + datetime.timedelta(minutes=30)
    dates = f"{start:%Y%m%dT%H%M%S}/{end:%Y%m%dT%H%M%S}"
    details = f"Meeting with {advisor_name}"
    if purpose:
        details += f". Purpose: {purpose}"
    query = urlencode({"action": "TEMPLATE", "text": f"Meeting with {advisor_name}",
                       "dates": dates, "details": details})
    return f"https://calendar.google.com/calendar/render?{query}"


def create_scheduled_booking(session_id, form, adv):
    booking_id = uuid.uuid4().hex[:10]
    lock_slot(adv["advisor_id"], form.date, form.time, booking_id)
    booking = {
        "booking_id": booking_id,
        "advisor_id": adv["advisor_id"],
        "advisor_name": adv["name"],
        "prospect_name": form.first_name.strip()[:40],
        "meeting_date": form.date,
        "meeting_time": form.time,
        "time_slot": scheduling.slot_label(form.date, form.time),
        "meeting_purpose": form.purpose.strip(),
        "status": "booked",
        "session_id": session_id,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "crm_status": "pending",
    }
    booking["calendar_link"] = calendar_link(booking["advisor_name"], booking["meeting_date"],
                                              booking["meeting_time"], booking["meeting_purpose"])
    BOOKINGS.put_item(Item=booking)
    if adv.get("open_slots", 0) > 0:
        adv["open_slots"] -= 1
    log_event("booked", session_id)
    emit_metric("BookingsCreated")
    return booking


class BookingError(Exception):
    def __init__(self, status, detail):
        super().__init__(detail)
        self.status, self.detail = status, detail


def own_booking(session_id, booking_id):
    """The booking, if it belongs to this session. Only the session that made a booking may change it."""
    b = BOOKINGS.get_item(Key={"booking_id": booking_id}).get("Item")
    if not b or b.get("session_id") != session_id or b.get("kind") == "slot_lock":
        raise BookingError(404, "We couldn't find that booking.")
    return b


def open_times(advisor_id, date):
    if scheduling.check_slot(date, scheduling.TIMES[0]):
        return []
    taken = taken_times(advisor_id, date)
    return [scheduling.slot_label(date, t).split(" at ")[1] for t in scheduling.TIMES if t not in taken]


def free_slot(b):
    if b.get("meeting_date") and b.get("meeting_time"):
        BOOKINGS.delete_item(Key={"booking_id": scheduling.slot_key(b["advisor_id"], b["meeting_date"], b["meeting_time"])})


def notify_crm(b, session_id, detail_type):
    try:
        publish_booking_event({k: v for k, v in b.items() if k != "briefing"}, b.get("briefing") or {},
                              get_state(session_id)["slots"], detail_type=detail_type)
    except Exception as e:  # the change is saved; the alarm surfaces a failed CRM hand-off
        log("booking_event_failed", booking_id=b["booking_id"], error=repr(e), level="ERROR")
        emit_metric("BookingEventFailed")


def change_booking(b, session_id, date=None, time_=None, purpose=None, lang="English"):
    """Move a booking and/or change what it's about. Raises BookingError with a message the user can act on."""
    if b.get("status") == "cancelled":
        raise BookingError(400, "This meeting was cancelled. Book a new time instead.")
    if purpose is not None and matching.screen_pii(purpose):
        raise BookingError(400, matching.PII_REPLY.get(lang, matching.PII_REPLY["English"]))
    date = date or b.get("meeting_date")
    time_ = time_ or b.get("meeting_time")
    if not date or not time_:
        raise BookingError(400, "Pick a date and a time.")
    if (date, time_) != (b.get("meeting_date"), b.get("meeting_time")):
        problem = scheduling.check_slot(date, time_)
        if problem:
            raise BookingError(400, problem)
        try:
            lock_slot(b["advisor_id"], date, time_, b["booking_id"])
        except SlotTaken:
            raise BookingError(409, "That time was just taken. Pick another time.") from None
        free_slot(b)
    purpose = b.get("meeting_purpose", "") if purpose is None else purpose.strip()
    b = BOOKINGS.update_item(
        Key={"booking_id": b["booking_id"]},
        UpdateExpression="SET meeting_date = :d, meeting_time = :t, time_slot = :l, meeting_purpose = :p, "
                         "updated_at = :u, crm_status = :s",
        ExpressionAttributeValues={":d": date, ":t": time_, ":l": scheduling.slot_label(date, time_), ":p": purpose,
                                   ":u": datetime.datetime.now(datetime.timezone.utc).isoformat(), ":s": "pending"},
        ReturnValues="ALL_NEW",
    )["Attributes"]
    notify_crm(b, session_id, "ClientConsultationUpdated")
    emit_metric("BookingsUpdated")
    return b


def cancel_booking(b, session_id):
    """Cancel a booking: keep the record (status "cancelled"), free the time, tell the CRM."""
    if b.get("status") == "cancelled":
        return b
    free_slot(b)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    b = BOOKINGS.update_item(
        Key={"booking_id": b["booking_id"]},
        UpdateExpression="SET #st = :c, cancelled_at = :u, updated_at = :u, crm_status = :s",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={":c": "cancelled", ":u": now, ":s": "pending"},
        ReturnValues="ALL_NEW",
    )["Attributes"]
    adv = next((a for a in advisors() if a["advisor_id"] == b["advisor_id"]), None)
    if adv is not None:
        adv["open_slots"] = adv.get("open_slots", 0) + 1
    log_event("cancelled", session_id)
    notify_crm(b, session_id, "ClientConsultationCancelled")
    emit_metric("BookingsCancelled")
    return b


def update_booking(req):
    try:
        b = change_booking(own_booking(req.session_id, req.booking_id), req.session_id,
                           req.date, req.time, req.purpose, req.lang)
    except BookingError as e:
        return respond(e.status, {"error": "booking", "detail": e.detail})
    return respond(200, {"booking": b})


def cancel_booking_route(req):
    try:
        b = cancel_booking(own_booking(req.session_id, req.booking_id), req.session_id)
    except BookingError as e:
        return respond(e.status, {"error": "booking", "detail": e.detail})
    return respond(200, {"booking": b})


# ---------- agent tools ----------
@tool
def record_preferences(
    goal: str = "", life_stage: str = "", worries: str = "", language: str = "", meeting_type: str = "",
    decision_style: str = "", communication_cadence: str = "", financial_intent: str = "",
) -> dict:
    """Save what you just learned about the person. Pass only fields you learned; leave others empty.

    Args:
        goal: their main money goal.
        life_stage: their situation in a sentence.
        worries: what makes them nervous about money or advisors.
        language: preferred language, e.g. "English", "Spanish" or "Mandarin".
        meeting_type: "virtual" or "in-person".
        decision_style: e.g. "wants to be guided" or "wants to decide with help".
        communication_cadence: how often they want to hear from an advisor.
        financial_intent: what they are asking for in standard terms, e.g. "401(k) rollover to an IRA".
    """
    sid = UI["session_id"]
    slots = matching.merge_slots(get_state(sid)["slots"], {
        "goal": goal, "life_stage": life_stage, "worries": worries, "language": language,
        "meeting_type": meeting_type, "decision_style": decision_style,
        "communication_cadence": communication_cadence, "financial_intent": financial_intent,
    })
    save_state(sid, slots=slots)
    UI["progress"] = matching.intake_progress(slots)
    return UI["progress"]


@tool
def search_advisors(needs: str, language: str = "English", meeting_type: str = "virtual",
                    most_important: str = "") -> list:
    """Find the 3 best-fit advisors for this person.

    Args:
        needs: plain-language summary of the person's goals, situation and worries.
        language: preferred language, e.g. "English" or "Spanish".
        meeting_type: "virtual" or "in-person".
        most_important: optional; what matters most to them: "expertise", "language", "meeting" or "availability".
    """
    started = time.time()
    picks, ahp, prefs = matching.rank_advisors(embed(needs), advisors(), language, meeting_type, most_important)
    UI["matches"] = [public_advisor(s, ahp, prefs) for s in picks]
    # Auditability (SKILL-03): log the weights and consistency ratio behind every ranking.
    log("advisors_ranked", session_id=UI["session_id"], weights=ahp["weights"], cr=round(ahp["cr"], 4),
        advisor_ids=[m["advisor_id"] for m in UI["matches"]])
    emit_metric("MatchLatency", round((time.time() - started) * 1000, 1), "Milliseconds")
    save_state(UI["session_id"], matched_ids=[m["advisor_id"] for m in UI["matches"]])
    log_event("matched", UI["session_id"])
    return [{k: m[k] for k in ("advisor_id", "name", "city", "languages", "meeting_types", "focus",
                               "match_score", "reasons")} for m in UI["matches"]]


def remember_advisor(adv):
    """Note that this session has seen a real advisor, so later turns can refer to them."""
    state = get_state(UI["session_id"])
    if adv["advisor_id"] not in state["matched_ids"]:
        save_state(UI["session_id"], matched_ids=state["matched_ids"] + [adv["advisor_id"]])


def resolve_advisor(id_or_name):
    """(advisor, None) for a real advisor given by ID or by name, else (None, error for the AI)."""
    key = (id_or_name or "").strip()
    adv = next((a for a in advisors() if a["advisor_id"] == key), None)
    if adv is None:
        found = matching.find_advisors(advisors(), key)
        if len(found) == 1:
            adv = found[0]
        elif len(found) > 1:
            return None, {"error": "More than one advisor has that name. Ask which one they mean.",
                          "advisors": [{"advisor_id": a["advisor_id"], "name": a["name"], "city": a["city"]} for a in found]}
    if adv is None:
        return None, {"error": f"No advisor called {key!r} is in our advisor list.",
                      "did_you_mean": matching.closest_names(advisors(), key)}
    remember_advisor(adv)
    return adv, None


@tool
def find_advisor(name: str) -> dict:
    """Look up an advisor in the full advisor list by name (as the person typed it, e.g. "Sofia" or
    "mei lin"). Use this before saying anything about an advisor you haven't seen in this chat.

    Args:
        name: the advisor's name, full or partial.
    """
    found = matching.find_advisors(advisors(), name)
    for a in found:
        remember_advisor(a)
    return {
        "advisors": [{k: a[k] for k in ("advisor_id", "name", "city", "languages", "meeting_types", "focus")}
                     | {"open_slots": a.get("open_slots", 0)} for a in found],
        "did_you_mean": [] if found else matching.closest_names(advisors(), name),
    }


@tool
def book_meeting(advisor_id: str, prospect_name: str, time_slot: str,
                 date: str = "", time: str = "") -> dict:
    """Book a first meeting with the chosen advisor.

    Args:
        advisor_id: the advisor_id from search_advisors or find_advisor (an advisor's full name also works).
        prospect_name: the person's first name.
        time_slot: the day and time they chose, in plain words.
        date: optional meeting date in YYYY-MM-DD format.
        time: optional meeting time in 24-hour HH:MM format.
    """
    adv, problem = resolve_advisor(advisor_id)
    if adv is None:
        # SKILL-02: only advisors that exist in the inventory can be booked; never invent one.
        log("booking_rejected_unknown_advisor", advisor_id=advisor_id, level="WARN")
        emit_metric("OutOfInventoryBlocked")
        return problem
    if adv and adv["open_slots"] > 0:
        adv["open_slots"] -= 1  # reflect reduced availability for the rest of this warm container's life
    booking = {
        "booking_id": uuid.uuid4().hex[:10],
        "advisor_id": adv["advisor_id"],
        "advisor_name": adv["name"],
        "prospect_name": prospect_name.strip()[:40],
        "time_slot": time_slot,
        "status": "booked",
        "session_id": UI["session_id"],
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "crm_status": "pending",
    }
    if date and time and scheduling.check_slot(date, time) is None:
        booking["meeting_date"] = date
        booking["meeting_time"] = time
        booking["calendar_link"] = calendar_link(booking["advisor_name"], date, time,
                                                  booking.get("meeting_purpose", ""))
    BOOKINGS.put_item(Item=booking)
    UI["booking"] = booking
    log_event("booked", UI["session_id"])
    emit_metric("BookingsCreated")
    return booking


@tool
def my_bookings() -> list:
    """List this person's meetings (booked and cancelled) with booking_id, advisor, date, time and topic.
    Call this before reschedule_meeting or cancel_meeting."""
    items = BOOKINGS.scan(FilterExpression=Attr("session_id").eq(UI["session_id"]) & Attr("kind").not_exists())["Items"]
    items.sort(key=lambda b: b.get("created_at", ""), reverse=True)
    return [{k: b.get(k, "") for k in ("booking_id", "advisor_name", "meeting_date", "meeting_time", "time_slot",
                                        "meeting_purpose", "status")} for b in items]


@tool
def reschedule_meeting(booking_id: str, date: str = "", time: str = "", meeting_purpose: str = "") -> dict:
    """Move a meeting to a new date and/or time, or change what it's about.

    Args:
        booking_id: from my_bookings.
        date: new date as YYYY-MM-DD, or empty to keep the current date.
        time: new start time as 24-hour HH:MM (e.g. "15:30"), or empty to keep the current time.
        meeting_purpose: new topic in their words, or empty to keep the current one.
    """
    sid = UI["session_id"]
    try:
        current = own_booking(sid, booking_id)
    except BookingError as e:
        return {"error": e.detail}
    try:
        b = change_booking(current, sid, date or None, time or None, meeting_purpose or None)
    except BookingError as e:
        day = date or current.get("meeting_date", "")
        return {"error": e.detail, "open_times_that_day": open_times(current["advisor_id"], day) if day else []}
    UI["booking"] = b
    return {k: b.get(k, "") for k in ("booking_id", "advisor_name", "time_slot", "meeting_purpose", "status")}


@tool
def cancel_meeting(booking_id: str) -> dict:
    """Cancel a meeting. Only call this when the person clearly asked to cancel.

    Args:
        booking_id: from my_bookings.
    """
    sid = UI["session_id"]
    try:
        b = cancel_booking(own_booking(sid, booking_id), sid)
    except BookingError as e:
        return {"error": e.detail}
    UI["booking"] = b
    return {k: b.get(k, "") for k in ("booking_id", "advisor_name", "time_slot", "status")}


@tool
def create_advisor_briefing(
    booking_id: str, goals: str, worries: str, topics_to_explain: str, communication_preferences: str
) -> str:
    """Save the one-page briefing the advisor receives before the first meeting. Write it in English.

    Args:
        booking_id: the booking_id returned by book_meeting.
        goals: the person's goals in 1-2 sentences.
        worries: what they are nervous or unsure about.
        topics_to_explain: concepts the advisor should explain simply.
        communication_preferences: language, meeting type, accessibility needs, follow-up preferences.
    """
    briefing = {
        "goals": goals,
        "worries": worries,
        "topics_to_explain": topics_to_explain,
        "communication_preferences": communication_preferences,
    }
    booking = BOOKINGS.update_item(
        Key={"booking_id": booking_id},
        UpdateExpression="SET briefing = :b",
        ExpressionAttributeValues={":b": briefing},
        ReturnValues="ALL_NEW",
    )["Attributes"]
    UI["briefing"] = briefing
    log_event("briefing_sent", UI["session_id"])
    try:
        publish_booking_event({k: v for k, v in booking.items() if k != "briefing"}, briefing,
                              get_state(UI["session_id"])["slots"])
    except Exception as e:  # the user-facing booking already succeeded; the alarm surfaces this
        log("booking_event_failed", booking_id=booking_id, error=repr(e), level="ERROR")
        emit_metric("BookingEventFailed")
    return "Briefing saved and sent to the advisor."


MODEL = BedrockModel(
    model_id=os.environ["MODEL_ID"],
    temperature=0.3,
    max_tokens=1200,
)


# ---------- routes ----------
def chat(body):
    req = ChatRequest(**body)
    UI.clear()
    session_id = req.session_id or uuid.uuid4().hex
    UI["session_id"] = session_id
    if not req.session_id:
        log_event("intake_started", session_id)

    # SKILL-01: zero upfront PII. Blocked text never reaches the model, the session store or the logs.
    pii = matching.screen_pii(req.message)
    if pii:
        add_compliance_flag(session_id, f"pii_blocked:{','.join(pii)}")
        emit_metric("PiiBlocked")
        reply = matching.PII_REPLY.get(req.lang, matching.PII_REPLY["English"])
        return respond(200, {"session_id": session_id, "reply": reply, "pii_blocked": True,
                             "progress": matching.intake_progress(get_state(session_id)["slots"])})

    message = req.message + ("\n\n(Please explain in very simple words.)" if req.simple else "")
    message += f"\n\n(Please reply in {req.lang}.)"
    # Picked from the advisor directory: the ID comes from the real inventory, so it may be booked (SKILL-02).
    if req.selected_advisor_id:
        picked = next((a for a in advisors() if a["advisor_id"] == req.selected_advisor_id), None)
        if picked:
            remember_advisor(picked)
            if not req.booking:
                message += (f"\n\n(They already chose {picked['name']} (advisor_id {picked['advisor_id']}, a real advisor "
                            f"from our list); the app showed them a booking form for a date, time and topic. Don't ask "
                            f"which advisor they want or suggest others unless they ask. If they give a day and time, "
                            f"book {picked['name']} with book_meeting; otherwise ask for whatever is still missing.)")
    # Booking form: create the booking deterministically, then let the agent write the briefing and prep kit.
    if req.booking:
        form = req.booking
        adv = next((a for a in advisors() if a["advisor_id"] == form.advisor_id), None)
        if adv is None:  # SKILL-02: only advisors that exist in the inventory can be booked
            return respond(404, {"error": "unknown advisor", "detail": "We couldn't find that advisor."})
        problem = scheduling.check_slot(form.date, form.time)
        if problem:
            return respond(400, {"error": "invalid slot", "detail": problem})
        if matching.screen_pii(form.purpose) or matching.screen_pii(form.first_name):
            add_compliance_flag(session_id, "pii_blocked:booking_form")
            emit_metric("PiiBlocked")
            return respond(400, {"error": "pii", "detail": matching.PII_REPLY.get(req.lang, matching.PII_REPLY["English"])})
        try:
            booking = create_scheduled_booking(session_id, form, adv)
        except SlotTaken:
            return respond(409, {"error": "slot taken", "detail": "That time was just taken. Pick another time."})
        UI["booking"] = booking
        remember_advisor(adv)
        message += (f"\n\n(The meeting is already booked: booking_id {booking['booking_id']}, {booking['prospect_name']} "
                    f"with {adv['name']} (advisor_id {adv['advisor_id']}, a real advisor from our advisor list) "
                    f"on {booking['time_slot']}. What they want to talk about: "
                    f"{booking['meeting_purpose'] or 'not given'}. Do not call book_meeting. Call create_advisor_briefing "
                    f"for this booking_id now, then give the First Meeting Ready kit.)")
    now = datetime.date.today()
    message += f"\n\n(Today is {now.strftime('%A')}, {now.isoformat()}.)"
    agent = Agent(
        model=MODEL,
        system_prompt=SYSTEM_PROMPT,
        callback_handler=None,
        tools=[record_preferences, search_advisors, find_advisor, book_meeting, create_advisor_briefing,
               my_bookings, reschedule_meeting, cancel_meeting],
        session_manager=S3SessionManager(session_id=session_id, bucket=DATA_BUCKET, prefix="sessions/"),
    )
    started = time.time()
    result = agent(message)
    emit_metric("ChatLatency", round((time.time() - started) * 1000, 1), "Milliseconds")

    if "progress" not in UI:
        UI["progress"] = matching.intake_progress(get_state(session_id)["slots"])
    extras = {k: v for k, v in UI.items() if k != "session_id"}
    return respond(200, {"session_id": session_id, "reply": str(result).strip(), **extras})


def lambda_handler(event, context):
    path = event.get("rawPath", "/")
    raw = event.get("body") or "{}"
    try:
        body = json.loads(base64.b64decode(raw) if event.get("isBase64Encoded") else raw)
    except Exception:
        return respond(400, {"error": "invalid JSON"})

    try:
        if path == "/health":
            return respond(200, {"ok": True, "model": os.environ["MODEL_ID"]})

        if path == "/chat":
            return chat(body)

        if path == "/speak":
            req = SpeakRequest(**body)
            voice = "Zhiyu" if req.lang == "zh" else "Lupe" if req.lang == "es" else "Joanna"
            audio = POLLY.synthesize_speech(Text=req.text[:2900], OutputFormat="mp3", VoiceId=voice, Engine="neural")
            return respond(200, {"audio_b64": base64.b64encode(audio["AudioStream"].read()).decode()})

        if path == "/translate":
            text = (body.get("text") or "").strip()
            target = {"en": "English", "es": "Spanish", "zh": "Simplified Chinese"}.get(body.get("lang"), "English")
            if not text:
                return respond(400, {"error": "text is required"})
            result = BR.converse(
                modelId=os.environ["MODEL_ID"],
                messages=[{"role": "user", "content": [{"text": f"Translate the following text into {target}. Return only the translation, with no explanation. Preserve markdown and line breaks.\n\n{text[:6000]}"}]}],
                inferenceConfig={"temperature": 0.1, "maxTokens": 1800},
            )
            translated = result["output"]["message"]["content"][0]["text"].strip()
            return respond(200, {"text": translated, "lang": body.get("lang", "en")})

        if path == "/metrics":
            kind = body.get("range") or "daily"
            start, end = metric_dates(kind, body.get("year"), body.get("month"), body.get("quarter"), body.get("start_date"), body.get("end_date"))
            counts = {}
            if kind == "all":
                page = FUNNEL.scan()
                items = page.get("Items", [])
                while page.get("LastEvaluatedKey"):
                    page = FUNNEL.scan(ExclusiveStartKey=page["LastEvaluatedKey"])
                    items.extend(page.get("Items", []))
            else:
                items = []
                day = start
                while day <= end:
                    response = FUNNEL.query(KeyConditionExpression=Key("day").eq(day.isoformat()))
                    items.extend(response.get("Items", []))
                    day += datetime.timedelta(days=1)
            counts = {}
            for i in items:
                counts[i["stage"]] = counts.get(i["stage"], 0) + 1
            return respond(200, {"range": kind, "start_date": start.isoformat(), "end_date": end.isoformat(), "funnel": counts})

        if path == "/insights":
            funnel = body.get("funnel") or {}
            return respond(200, {
                "source": "advisor-match-lambda",
                "recommendations": actionable_insights(funnel),
            })

        if path == "/availability":
            req = AvailabilityRequest(**body)
            problem = scheduling.check_slot(req.date, scheduling.TIMES[0])
            if problem:
                return respond(400, {"error": "invalid date", "detail": problem})
            taken = taken_times(req.advisor_id, req.date)
            return respond(200, {"date": req.date, "times": [
                {"time": t, "label": scheduling.slot_label(req.date, t).split(" at ")[1], "available": t not in taken}
                for t in scheduling.TIMES]})

        if path == "/bookings/update":
            return update_booking(BookingUpdate(**body))

        if path == "/bookings/cancel":
            return cancel_booking_route(BookingCancel(**body))

        if path == "/bookings/get":  # lets the web app check a booking it saved in the browser still exists
            req = BookingCancel(**body)
            try:
                return respond(200, {"booking": own_booking(req.session_id, req.booking_id)})
            except BookingError as e:
                return respond(e.status, {"error": "booking", "detail": e.detail})

        if path == "/bookings":
            items = [i for i in BOOKINGS.scan(Limit=200)["Items"] if i.get("kind") != "slot_lock"]
            items.sort(key=lambda b: b.get("created_at", ""), reverse=True)
            return respond(200, {"bookings": items[:25]})

        if path == "/advisors":
            req = DirectoryRequest(**body)
            items = matching.directory(advisors(), req.language, req.meeting_type, req.text)
            return respond(200, {"advisors": items, "total": len(advisors())})

        return respond(404, {"error": f"unknown route {path}"})
    except ValidationError as e:
        detail = "; ".join(f"{'.'.join(map(str, err['loc']))}: {err['msg']}" for err in e.errors())
        return respond(400, {"error": "invalid request", "detail": detail})
    except Exception as e:  # surface errors to the UI during the hackathon
        log("unhandled_error", path=path, error=repr(e), level="ERROR")
        emit_metric("UnhandledErrors")
        return respond(500, {"error": type(e).__name__, "detail": str(e)[:500]})
