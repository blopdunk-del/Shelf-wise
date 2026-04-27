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
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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

app = FastAPI(title="MedStore API")
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
def require_premium(user: dict, current_count: int):
    if user.get("is_admin"):
        return
    if is_premium_active(user):
        return
    # Free users limited to 10 entries
    if current_count >= 10:
        raise HTTPException(status_code=402, detail="Free plan limit reached (10 medicines). Please upgrade to premium.")

@api_router.post("/medicines", response_model=MedicineOut)
async def add_medicine(body: MedicineCreate, user: dict = Depends(get_current_user)):
    count = await db.medicines.count_documents({"user_id": user["id"]})
    require_premium(user, count)
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
        "free_limit": 10 if not is_premium_active(user) else None,
    }


# =================== OCR ROUTE ===================
@api_router.post("/ocr/extract")
async def ocr_extract(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not is_premium_active(user):
        # Allow OCR on free plan but limited
        count = await db.medicines.count_documents({"user_id": user["id"]})
        if count >= 10:
            raise HTTPException(status_code=402, detail="Free plan limit reached. Upgrade to premium.")
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
    return {
        "bank_name": os.environ.get("BANK_NAME", ""),
        "account_name": os.environ.get("BANK_ACCOUNT_NAME", ""),
        "account_number": os.environ.get("BANK_ACCOUNT_NUMBER", ""),
        "ifsc": os.environ.get("BANK_IFSC", ""),
        "upi_id": os.environ.get("BANK_UPI", ""),
        "amount": 600,
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


# =================== EMAIL / ALERTS BACKGROUND ===================
def send_email_sync(to: str, subject: str, body: str) -> bool:
    host = os.environ.get("SMTP_HOST", "")
    if not host:
        logger.info(f"[EMAIL MOCK] To={to} | {subject}")
        return False
    try:
        msg = MIMEMultipart()
        msg["From"] = os.environ.get("SMTP_FROM", "noreply@medstore.com")
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))
        with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", "587"))) as s:
            s.starttls()
            s.login(os.environ.get("SMTP_USER", ""), os.environ.get("SMTP_PASSWORD", ""))
            s.sendmail(msg["From"], [to], msg.as_string())
        return True
    except Exception as e:
        logger.warning(f"Email send failed: {e}")
        return False

async def expiry_alert_loop():
    """Background task that runs once a day to alert users about expiring meds."""
    await asyncio.sleep(5)
    while True:
        try:
            today = datetime.now(timezone.utc).date()
            end = (today + timedelta(days=10)).isoformat()
            # Group expiring meds per user
            users = await db.users.find({}, {"_id": 0}).to_list(5000)
            for u in users:
                meds = await db.medicines.find({
                    "user_id": u["id"],
                    "expiry_date": {"$gte": today.isoformat(), "$lte": end},
                }, {"_id": 0}).to_list(500)
                if not meds:
                    continue
                lines = [f"- {m['name']} (Batch {m['batch_number']}) expires on {m['expiry_date']} - Qty: {m['quantity']}" for m in meds]
                body = (
                    f"Hi {u.get('name', '')},\n\n"
                    f"You have {len(meds)} medicine(s) expiring in the next 10 days:\n\n"
                    + "\n".join(lines) +
                    "\n\nLog in to MedStore to manage your inventory.\n\n— MedStore"
                )
                send_email_sync(u["email"], f"[MedStore] {len(meds)} item(s) expiring soon", body)
                # Save alert log
                await db.alerts.insert_one({
                    "id": str(uuid.uuid4()),
                    "user_id": u["id"],
                    "count": len(meds),
                    "sent_at": datetime.now(timezone.utc).isoformat(),
                })
        except Exception as e:
            logger.exception(f"Alert loop error: {e}")
        # Sleep 24h
        await asyncio.sleep(60 * 60 * 24)

@api_router.get("/alerts/recent")
async def recent_alerts(user: dict = Depends(get_current_user)):
    alerts = await db.alerts.find({"user_id": user["id"]}, {"_id": 0}).sort("sent_at", -1).to_list(20)
    return alerts


# =================== STARTUP ===================
@api_router.get("/")
async def root():
    return {"message": "MedStore API", "status": "ok"}

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
            "name": "MedStore Admin",
            "shop_name": "Admin",
            "is_admin": True,
            "premium_expires_at": (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin: {admin_email}")
    else:
        # Ensure is_admin flag is true (idempotent)
        await db.users.update_one({"email": admin_email}, {"$set": {"is_admin": True}})

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
