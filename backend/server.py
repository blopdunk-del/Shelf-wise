from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
import json
import re
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta, date
import bcrypt
import jwt as pyjwt

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'fallback-secret')
JWT_ALGO = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_EXPIRE_HOURS = int(os.environ.get('JWT_EXPIRE_HOURS', '720'))
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI(title="ShelfWise API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# =================== MODELS ===================
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    shop_name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    shop_name: Optional[str] = None
    is_admin: bool = False
    is_premium: bool = False
    premium_expires_at: Optional[str] = None
    created_at: str

class MedicineCreate(BaseModel):
    name: str
    batch_number: str
    expiry_date: str  # YYYY-MM-DD
    quantity: int
    purchase_date: Optional[str] = None
    notes: Optional[str] = None

class MedicineUpdate(BaseModel):
    name: Optional[str] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[str] = None
    quantity: Optional[int] = None
    purchase_date: Optional[str] = None
    notes: Optional[str] = None

class MedicineOut(BaseModel):
    id: str
    user_id: str
    name: str
    batch_number: str
    expiry_date: str
    quantity: int
    purchase_date: Optional[str] = None
    notes: Optional[str] = None
    created_at: str

class PaymentSubmit(BaseModel):
    amount: float = 600.0
    reference: str
    method: str = "UPI"  # UPI / Bank Transfer
    note: Optional[str] = None

class PaymentOut(BaseModel):
    id: str
    user_id: str
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    amount: float
    reference: str
    method: str
    note: Optional[str] = None
    status: str
    created_at: str
    approved_at: Optional[str] = None

class OCRResult(BaseModel):
    medicines: List[dict]
    raw_text: Optional[str] = None


# =================== HELPERS ===================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False

def create_token(user_id: str, is_admin: bool) -> str:
    payload = {
        "user_id": user_id,
        "is_admin": is_admin,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = pyjwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_admin(user: dict = Depends(get_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def serialize_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "shop_name": u.get("shop_name"),
        "is_admin": u.get("is_admin", False),
        "is_premium": is_premium_active(u),
        "premium_expires_at": u.get("premium_expires_at"),
        "created_at": u.get("created_at"),
    }

def is_premium_active(u: dict) -> bool:
    if u.get("is_admin"):
        return True
    exp = u.get("premium_expires_at")
    if not exp:
        return False
    try:
        return datetime.fromisoformat(exp) > datetime.now(timezone.utc)
    except Exception:
        return False


# =================== AUTH ROUTES ===================
@api_router.post("/auth/register")
async def register(body: UserCreate):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name,
        "shop_name": body.shop_name,
        "is_admin": False,
        "premium_expires_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_token(user_id, False)
    doc.pop("_id", None)
    return {"token": token, "user": serialize_user(doc)}

@api_router.post("/auth/login")
async def login(body: UserLogin):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"], user.get("is_admin", False))
    return {"token": token, "user": serialize_user(user)}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return serialize_user(user)


# =================== MEDICINE ROUTES ===================
def require_premium(user: dict):
    """Strict gate: only premium users (and admins) can use the app's data features.

    Free users have NO access to inventory/OCR — they may only view the tutorial
    and submit a payment to upgrade.
    """
    if user.get("is_admin"):
        return
    if is_premium_active(user):
        return
    raise HTTPException(
        status_code=402,
        detail="Premium membership required. Please upgrade to use this feature.",
    )

@api_router.post("/medicines", response_model=MedicineOut)
async def add_medicine(body: MedicineCreate, user: dict = Depends(get_current_user)):
    require_premium(user)
    med_id = str(uuid.uuid4())
    doc = {
        "id": med_id,
        "user_id": user["id"],
        "name": body.name.strip(),
        "batch_number": body.batch_number.strip(),
        "expiry_date": body.expiry_date,
        "quantity": int(body.quantity),
        "purchase_date": body.purchase_date or datetime.now(timezone.utc).date().isoformat(),
        "notes": body.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.medicines.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/medicines")
async def list_medicines(filter: str = "all", search: str = "", user: dict = Depends(get_current_user)):
    query = {"user_id": user["id"]}
    today = datetime.now(timezone.utc).date()
    if filter == "expiring":
        # within 10 days
        end = (today + timedelta(days=10)).isoformat()
        query["expiry_date"] = {"$gte": today.isoformat(), "$lte": end}
    elif filter == "expired":
        query["expiry_date"] = {"$lt": today.isoformat()}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"batch_number": {"$regex": search, "$options": "i"}},
        ]
    meds = await db.medicines.find(query, {"_id": 0}).sort("expiry_date", 1).to_list(2000)
    return meds

@api_router.put("/medicines/{med_id}", response_model=MedicineOut)
async def update_medicine(med_id: str, body: MedicineUpdate, user: dict = Depends(get_current_user)):
    med = await db.medicines.find_one({"id": med_id, "user_id": user["id"]}, {"_id": 0})
    if not med:
        raise HTTPException(status_code=404, detail="Medicine not found")
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update:
        await db.medicines.update_one({"id": med_id}, {"$set": update})
    med.update(update)
    return med

@api_router.delete("/medicines/{med_id}")
async def delete_medicine(med_id: str, user: dict = Depends(get_current_user)):
    res = await db.medicines.delete_one({"id": med_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}

@api_router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    end_10 = (today + timedelta(days=10)).isoformat()
    total = await db.medicines.count_documents({"user_id": user["id"]})
    expiring = await db.medicines.count_documents({
        "user_id": user["id"],
        "expiry_date": {"$gte": today.isoformat(), "$lte": end_10},
    })
    expired = await db.medicines.count_documents({
        "user_id": user["id"],
        "expiry_date": {"$lt": today.isoformat()},
    })
    total_qty_doc = await db.medicines.aggregate([
        {"$match": {"user_id": user["id"]}},
        {"$group": {"_id": None, "qty": {"$sum": "$quantity"}}},
    ]).to_list(1)
    total_qty = total_qty_doc[0]["qty"] if total_qty_doc else 0
    return {
        "total": total,
        "expiring_soon": expiring,
        "expired": expired,
        "total_quantity": total_qty,
        "is_premium": is_premium_active(user),
    }


# =================== OCR ROUTE ===================
@api_router.post("/ocr/extract")
async def ocr_extract(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    require_premium(user)
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")
    mime = file.content_type or "image/jpeg"
    if mime == "application/pdf":
        raise HTTPException(status_code=400, detail="Please upload an image (JPG/PNG). PDF OCR not supported in MVP.")
    if mime not in ("image/jpeg", "image/jpg", "image/png", "image/webp"):
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WEBP images are supported.")

    img_b64 = base64.b64encode(contents).decode()

    system_msg = (
        "You are an expert OCR system for Indian pharmacy purchase receipts/invoices. "
        "Extract every medicine line item from the receipt image. "
        "Return STRICT JSON in the format: "
        '{"medicines": [{"name": "string", "batch_number": "string or empty", '
        '"expiry_date": "YYYY-MM-DD or empty", "quantity": number}]}. '
        "Rules: "
        "1) For expiry like '06/27' or '06-2027', use the LAST day of that month e.g. 2027-06-30. "
        "2) For 'EXP 12/25' assume 2025-12-31. "
        "3) If a field is unreadable, use empty string for text fields and 1 for quantity. "
        "4) Do NOT invent medicines. "
        "5) Return ONLY the JSON object, no markdown, no explanations."
    )

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"ocr-{uuid.uuid4()}",
            system_message=system_msg,
        ).with_model("openai", "gpt-5.2")

        msg = UserMessage(
            text="Extract medicine line items from this pharmacy receipt. Return only the JSON.",
            file_contents=[ImageContent(image_base64=img_b64)],
        )
        response = await chat.send_message(msg)
    except Exception as e:
        logger.exception("OCR LLM error")
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")

    text = response.strip() if isinstance(response, str) else str(response).strip()
    # Strip markdown fences
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except Exception:
        # try to find JSON
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return {"medicines": [], "raw_text": text}
        try:
            data = json.loads(m.group(0))
        except Exception:
            return {"medicines": [], "raw_text": text}

    medicines = data.get("medicines", []) if isinstance(data, dict) else []
    cleaned = []
    for m in medicines:
        if not isinstance(m, dict):
            continue
        cleaned.append({
            "name": str(m.get("name", "")).strip(),
            "batch_number": str(m.get("batch_number", "")).strip(),
            "expiry_date": str(m.get("expiry_date", "")).strip(),
            "quantity": int(m.get("quantity", 1) or 1),
        })
    return {"medicines": cleaned, "raw_text": None}


# =================== PAYMENTS ===================
@api_router.get("/payments/bank-details")
async def get_bank_details(user: dict = Depends(get_current_user)):
    upi_id = os.environ.get("BANK_UPI", "")
    payee_name = os.environ.get("BANK_ACCOUNT_NAME", "")
    amount = 600
    note = "ShelfWise Premium"
    # UPI deep-link spec: upi://pay?pa=<upi>&pn=<name>&am=<amt>&cu=INR&tn=<note>
    from urllib.parse import quote
    deep_link = (
        f"upi://pay?pa={upi_id}&pn={quote(payee_name)}"
        f"&am={amount}&cu=INR&tn={quote(note)}"
    ) if upi_id else ""
    return {
        "bank_name": os.environ.get("BANK_NAME", ""),
        "account_name": payee_name,
        "account_number": os.environ.get("BANK_ACCOUNT_NUMBER", ""),
        "ifsc": os.environ.get("BANK_IFSC", ""),
        "upi_id": upi_id,
        "upi_qr_url": os.environ.get("BANK_UPI_QR_URL", ""),
        "upi_deep_link": deep_link,
        "amount": amount,
    }

@api_router.post("/payments/submit", response_model=PaymentOut)
async def submit_payment(body: PaymentSubmit, user: dict = Depends(get_current_user)):
    pay_id = str(uuid.uuid4())
    doc = {
        "id": pay_id,
        "user_id": user["id"],
        "user_email": user["email"],
        "user_name": user.get("name"),
        "amount": float(body.amount),
        "reference": body.reference.strip(),
        "method": body.method,
        "note": body.note,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
    }
    await db.payments.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/payments/my")
async def my_payments(user: dict = Depends(get_current_user)):
    payments = await db.payments.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return payments


# =================== ADMIN ===================
@api_router.get("/admin/payments")
async def admin_list_payments(status: Optional[str] = None, admin: dict = Depends(require_admin)):
    q = {}
    if status:
        q["status"] = status
    payments = await db.payments.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return payments

@api_router.post("/admin/payments/{pay_id}/approve")
async def approve_payment(pay_id: str, months: int = 1, admin: dict = Depends(require_admin)):
    pay = await db.payments.find_one({"id": pay_id}, {"_id": 0})
    if not pay:
        raise HTTPException(status_code=404, detail="Payment not found")
    if pay["status"] == "approved":
        return pay
    user = await db.users.find_one({"id": pay["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)
    current_exp = None
    if user.get("premium_expires_at"):
        try:
            current_exp = datetime.fromisoformat(user["premium_expires_at"])
        except Exception:
            current_exp = None
    base = current_exp if current_exp and current_exp > now else now
    new_exp = base + timedelta(days=30 * months)

    await db.users.update_one(
        {"id": pay["user_id"]},
        {"$set": {"premium_expires_at": new_exp.isoformat()}},
    )
    await db.payments.update_one(
        {"id": pay_id},
        {"$set": {"status": "approved", "approved_at": now.isoformat()}},
    )
    pay["status"] = "approved"
    pay["approved_at"] = now.isoformat()
    return pay

@api_router.post("/admin/payments/{pay_id}/reject")
async def reject_payment(pay_id: str, admin: dict = Depends(require_admin)):
    res = await db.payments.update_one(
        {"id": pay_id},
        {"$set": {"status": "rejected", "approved_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Payment not found")
    return {"ok": True}

@api_router.get("/admin/users")
async def admin_list_users(admin: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    out = []
    for u in users:
        out.append(serialize_user(u))
    return out

@api_router.post("/admin/users/{user_id}/grant")
async def grant_premium(user_id: str, months: int = 1, admin: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    now = datetime.now(timezone.utc)
    current_exp = None
    if user.get("premium_expires_at"):
        try:
            current_exp = datetime.fromisoformat(user["premium_expires_at"])
        except Exception:
            current_exp = None
    base = current_exp if current_exp and current_exp > now else now
    new_exp = base + timedelta(days=30 * months)
    await db.users.update_one({"id": user_id}, {"$set": {"premium_expires_at": new_exp.isoformat()}})
    return {"ok": True, "premium_expires_at": new_exp.isoformat()}

@api_router.post("/admin/users/{user_id}/revoke")
async def revoke_premium(user_id: str, admin: dict = Depends(require_admin)):
    await db.users.update_one({"id": user_id}, {"$set": {"premium_expires_at": None}})
    return {"ok": True}

@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.users.delete_one({"id": user_id})
    await db.medicines.delete_many({"user_id": user_id})
    await db.payments.delete_many({"user_id": user_id})
    return {"ok": True}

@api_router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    total_users = await db.users.count_documents({})
    total_meds = await db.medicines.count_documents({})
    pending_payments = await db.payments.count_documents({"status": "pending"})
    approved_payments = await db.payments.count_documents({"status": "approved"})
    return {
        "total_users": total_users,
        "total_medicines": total_meds,
        "pending_payments": pending_payments,
        "approved_payments": approved_payments,
    }


# =================== ALERTS BACKGROUND (in-app + web push) ===================
from pywebpush import webpush, WebPushException
import json as _json

VAPID_PUBLIC = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_PEM = os.environ.get("VAPID_PRIVATE_KEY_PEM", "").replace("\\n", "\n")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:admin@medstore.com")


async def send_push_to_user(user_id: str, title: str, body: str, url: str = "/"):
    """Send a Web Push notification to every registered subscription for the user.
    Removes subscriptions that return 404/410 (expired)."""
    if not VAPID_PRIVATE_PEM:
        return
    subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    payload = _json.dumps({"title": title, "body": body, "url": url})
    for s in subs:
        try:
            webpush(
                subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]},
                data=payload,
                vapid_private_key=VAPID_PRIVATE_PEM,
                vapid_claims={"sub": VAPID_SUBJECT},
            )
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (404, 410):
                await db.push_subscriptions.delete_one({"endpoint": s["endpoint"]})
            else:
                logger.warning(f"webpush failed: {e}")
        except Exception as e:
            logger.warning(f"webpush error: {e}")


class PushSubscribe(BaseModel):
    endpoint: str
    keys: dict  # {"p256dh": "...", "auth": "..."}


@api_router.get("/push/vapid-public-key")
async def push_vapid_key():
    return {"public_key": VAPID_PUBLIC}


@api_router.post("/push/subscribe")
async def push_subscribe(sub: PushSubscribe, user: dict = Depends(get_current_user)):
    if not sub.endpoint or "p256dh" not in sub.keys or "auth" not in sub.keys:
        raise HTTPException(status_code=400, detail="Invalid subscription")
    # Upsert by endpoint to avoid duplicates per device
    await db.push_subscriptions.update_one(
        {"endpoint": sub.endpoint},
        {"$set": {
            "user_id": user["id"],
            "endpoint": sub.endpoint,
            "keys": sub.keys,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}


@api_router.delete("/push/unsubscribe")
async def push_unsubscribe(endpoint: str, user: dict = Depends(get_current_user)):
    await db.push_subscriptions.delete_one({"user_id": user["id"], "endpoint": endpoint})
    return {"ok": True}


@api_router.post("/push/test")
async def push_test(user: dict = Depends(get_current_user)):
    """Trigger a test push to verify the user's device is subscribed correctly."""
    await send_push_to_user(
        user["id"],
        "ShelfWise notifications enabled",
        "You'll get expiry & renewal alerts here from now on. 🔔",
        "/",
    )
    return {"ok": True}


def _summarize_items(items):
    """Build a brief text summary list (bullet lines) for emails / logs."""
    out = []
    today = datetime.now(timezone.utc).date()
    for m in items:
        try:
            exp = datetime.fromisoformat(m["expiry_date"]).date() if "T" in m["expiry_date"] else datetime.strptime(m["expiry_date"], "%Y-%m-%d").date()
            days = (exp - today).days
        except Exception:
            days = None
        when = f"{days}d left" if days is not None and days >= 0 else (f"expired {-days}d ago" if days is not None else "")
        out.append(
            f"- {m['name']} (Batch {m['batch_number']}) · Qty {m['quantity']} · "
            f"Expires {m['expiry_date']}{(' · ' + when) if when else ''}"
        )
    return out

async def expiry_alert_loop():
    """Background task that runs once a day to alert users about:
    - Expiring inventory items (10 days ahead)
    - Premium membership renewal reminders (5 days before expiry)
    """
    await asyncio.sleep(5)
    while True:
        try:
            today = datetime.now(timezone.utc).date()
            now = datetime.now(timezone.utc)
            end = (today + timedelta(days=10)).isoformat()
            users = await db.users.find({}, {"_id": 0}).to_list(5000)
            for u in users:
                # 1) Item expiry alerts
                items = await db.medicines.find({
                    "user_id": u["id"],
                    "expiry_date": {"$gte": today.isoformat(), "$lte": end},
                }, {"_id": 0}).to_list(500)
                if items:
                    brief = [
                        {
                            "name": m["name"],
                            "batch_number": m["batch_number"],
                            "quantity": m["quantity"],
                            "expiry_date": m["expiry_date"],
                        } for m in items
                    ]
                    await db.alerts.insert_one({
                        "id": str(uuid.uuid4()),
                        "user_id": u["id"],
                        "type": "item_expiry",
                        "count": len(items),
                        "items": brief,
                        "sent_at": now.isoformat(),
                    })
                    # Web push (best-effort, non-blocking)
                    try:
                        first = brief[0]
                        more = f" + {len(brief) - 1} more" if len(brief) > 1 else ""
                        await send_push_to_user(
                            u["id"],
                            f"{len(items)} item(s) expiring soon",
                            f"{first['name']} (Batch {first['batch_number']}) on {first['expiry_date']}{more}",
                            "/",
                        )
                    except Exception as e:
                        logger.warning(f"push send (item) failed: {e}")

                # 2) Membership renewal reminder (5 days before expiry, but not for admins)
                if not u.get("is_admin") and u.get("premium_expires_at"):
                    try:
                        exp_dt = datetime.fromisoformat(u["premium_expires_at"])
                        days_left = (exp_dt - now).days
                    except Exception:
                        days_left = None
                    # Send when 0..5 days remain; dedupe with a 24h cooldown
                    if days_left is not None and 0 <= days_left <= 5:
                        last = await db.alerts.find_one(
                            {"user_id": u["id"], "type": "renewal_reminder"},
                            sort=[("sent_at", -1)],
                            projection={"_id": 0},
                        )
                        last_dt = None
                        if last:
                            try:
                                last_dt = datetime.fromisoformat(last["sent_at"])
                            except Exception:
                                last_dt = None
                        if not last_dt or (now - last_dt) >= timedelta(hours=20):
                            await db.alerts.insert_one({
                                "id": str(uuid.uuid4()),
                                "user_id": u["id"],
                                "type": "renewal_reminder",
                                "days_left": days_left,
                                "expires_at": exp_dt.isoformat(),
                                "sent_at": now.isoformat(),
                            })
                            try:
                                await send_push_to_user(
                                    u["id"],
                                    f"Premium expires in {days_left}d",
                                    "Renew ₹600 in the app to keep tracking your stock.",
                                    "/membership",
                                )
                            except Exception as e:
                                logger.warning(f"push send (renewal) failed: {e}")
        except Exception as e:
            logger.exception(f"Alert loop error: {e}")
        await asyncio.sleep(60 * 60 * 24)

@api_router.get("/membership/status")
async def membership_status(user: dict = Depends(get_current_user)):
    """Return premium status + days_left + needs_renewal flag for in-app banners."""
    now = datetime.now(timezone.utc)
    days_left = None
    expires_at = user.get("premium_expires_at")
    if expires_at:
        try:
            exp = datetime.fromisoformat(expires_at)
            days_left = max(0, (exp - now).days)
        except Exception:
            days_left = None
    is_premium = is_premium_active(user)
    return {
        "is_premium": is_premium,
        "is_admin": bool(user.get("is_admin")),
        "expires_at": expires_at,
        "days_left": days_left,
        # Show renewal banner once premium has 5 or fewer days remaining
        "needs_renewal": bool(is_premium and not user.get("is_admin") and days_left is not None and days_left <= 5),
        "activation_sla_minutes": 30,
    }

@api_router.get("/alerts/recent")
async def recent_alerts(user: dict = Depends(get_current_user)):
    """Return last 20 alerts for the user (each includes the actual items)."""
    alerts = await db.alerts.find({"user_id": user["id"]}, {"_id": 0}).sort("sent_at", -1).to_list(20)
    # backwards compat: ensure 'items' key exists
    for a in alerts:
        a.setdefault("items", [])
    return alerts

@api_router.get("/alerts/live")
async def live_expiring(user: dict = Depends(get_current_user)):
    """Live fetch of items expiring within 10 days — includes brief details for in-app notifications."""
    today = datetime.now(timezone.utc).date()
    end = (today + timedelta(days=10)).isoformat()
    items = await db.medicines.find({
        "user_id": user["id"],
        "expiry_date": {"$gte": today.isoformat(), "$lte": end},
    }, {"_id": 0}).sort("expiry_date", 1).to_list(500)
    return {"count": len(items), "items": items}


# =================== STARTUP ===================
@api_router.get("/")
async def root():
    return {"message": "ShelfWise API", "status": "ok"}

@app.on_event("startup")
async def startup():
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@medstore.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@12345")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "ShelfWise Admin",
            "shop_name": "Admin",
            "is_admin": True,
            "premium_expires_at": (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin: {admin_email}")
    else:
        # Ensure is_admin flag is true (idempotent) and update legacy name
        update = {"is_admin": True}
        if existing.get("name") in ("MedStore Admin", "MedStore admin", None, ""):
            update["name"] = "ShelfWise Admin"
        await db.users.update_one({"email": admin_email}, {"$set": update})

    # Indexes
    try:
        await db.users.create_index("email", unique=True)
        await db.medicines.create_index([("user_id", 1), ("expiry_date", 1)])
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")

    # Start expiry alert loop
    asyncio.create_task(expiry_alert_loop())

@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
