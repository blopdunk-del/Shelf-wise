"""ShelfWise backend API tests - covers the new strict premium gate.

Premium gate behavior (post-iteration-1):
- Free users CANNOT access POST /api/medicines or POST /api/ocr/extract → HTTP 402
- Free users CAN still access GET /api/medicines and GET /api/dashboard/stats (read-only)
- Admin always treated as premium (is_admin=True bypasses gate)
"""
import os
import io
import uuid
import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "admin@medstore.com"
ADMIN_PASSWORD = "Admin@12345"


# ============ fixtures ============
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def free_user_creds():
    return {
        "email": f"TEST_free_{uuid.uuid4().hex[:8]}@example.com",
        "password": "Passw0rd!",
        "name": "Free User",
        "shop_name": "FreeShop",
    }


@pytest.fixture(scope="session")
def free_user_token(free_user_creds):
    r = requests.post(f"{BASE_URL}/api/auth/register", json=free_user_creds)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["user"]["is_premium"] is False
    return j["token"]


@pytest.fixture(scope="session")
def fresh_user_for_approval():
    """Separate user used by the admin-approval flow test."""
    creds = {
        "email": f"TEST_approve_{uuid.uuid4().hex[:8]}@example.com",
        "password": "Passw0rd!",
        "name": "Approve User",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=creds)
    assert r.status_code == 200
    return creds, r.json()["token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ============ auth ============
def test_login_admin_is_premium():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    j = r.json()
    assert j["user"]["is_admin"] is True
    assert j["user"]["is_premium"] is True


def test_register_returns_free_user(free_user_token, free_user_creds):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=H(free_user_token))
    assert r.status_code == 200
    me = r.json()
    assert me["email"] == free_user_creds["email"].lower()
    assert me["is_admin"] is False
    assert me["is_premium"] is False


def test_login_invalid():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "none@x.com", "password": "bad"})
    assert r.status_code == 401


# ============ premium gate (NEW behavior) ============
def test_free_user_post_medicine_blocked_402(free_user_token):
    """Free user must NOT be able to add medicine — strict gate."""
    r = requests.post(
        f"{BASE_URL}/api/medicines",
        json={"name": "TEST_Blocked", "batch_number": "B1", "expiry_date": "2027-01-01", "quantity": 1},
        headers=H(free_user_token),
    )
    assert r.status_code == 402, r.text
    assert "premium" in r.text.lower() or "membership" in r.text.lower()


def test_free_user_ocr_blocked_402(free_user_token):
    img = Image.new("RGB", (200, 80), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    files = {"file": ("r.jpg", buf.getvalue(), "image/jpeg")}
    r = requests.post(f"{BASE_URL}/api/ocr/extract", files=files, headers=H(free_user_token), timeout=60)
    assert r.status_code == 402, r.text


def test_free_user_can_read_medicines(free_user_token):
    """Read-only listing must still work for free users (returns their own items, even if 0)."""
    r = requests.get(f"{BASE_URL}/api/medicines", headers=H(free_user_token))
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_free_user_can_read_stats(free_user_token):
    r = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=H(free_user_token))
    assert r.status_code == 200
    j = r.json()
    for k in ("total", "expiring_soon", "expired", "total_quantity", "is_premium"):
        assert k in j
    assert j["is_premium"] is False


# ============ medicine CRUD as ADMIN (admin bypasses gate) ============
def test_admin_medicine_crud(admin_token):
    payload = {"name": "TEST_AdminMed", "batch_number": "BADM1", "expiry_date": "2027-05-30", "quantity": 20}
    r = requests.post(f"{BASE_URL}/api/medicines", json=payload, headers=H(admin_token))
    assert r.status_code == 200, r.text
    mid = r.json()["id"]
    try:
        r = requests.get(f"{BASE_URL}/api/medicines?search=TEST_AdminMed", headers=H(admin_token))
        assert r.status_code == 200 and any(m["id"] == mid for m in r.json())

        r = requests.put(f"{BASE_URL}/api/medicines/{mid}", json={"quantity": 50}, headers=H(admin_token))
        assert r.status_code == 200 and r.json()["quantity"] == 50

        # GET to verify update persisted
        r = requests.get(f"{BASE_URL}/api/medicines?search=TEST_AdminMed", headers=H(admin_token))
        assert r.status_code == 200
        assert any(m["id"] == mid and m["quantity"] == 50 for m in r.json())
    finally:
        r = requests.delete(f"{BASE_URL}/api/medicines/{mid}", headers=H(admin_token))
        assert r.status_code == 200
        r = requests.put(f"{BASE_URL}/api/medicines/{mid}", json={"quantity": 1}, headers=H(admin_token))
        assert r.status_code == 404


def test_admin_ocr_extract(admin_token):
    """Admin should bypass premium gate for OCR (LLM call live)."""
    img = Image.new("RGB", (600, 250), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    d.text((20, 20), "Pharmacy Receipt", fill=(0, 0, 0))
    d.text((20, 60), "Paracetamol 500mg  B#PAR123  EXP 12/27  QTY 10", fill=(0, 0, 0))
    d.text((20, 100), "Amoxicillin 250mg  B#AMX555  EXP 06/28  QTY 5", fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    files = {"file": ("receipt.jpg", buf.getvalue(), "image/jpeg")}
    r = requests.post(f"{BASE_URL}/api/ocr/extract", files=files, headers=H(admin_token), timeout=120)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "medicines" in j and isinstance(j["medicines"], list)


# ============ payments ============
def test_bank_details_has_new_qr(free_user_token):
    """Bank details must reflect new UPI QR + UPI ID."""
    r = requests.get(f"{BASE_URL}/api/payments/bank-details", headers=H(free_user_token))
    assert r.status_code == 200
    j = r.json()
    assert j["amount"] == 600
    assert j["upi_id"] == "8919803257@fam"
    assert j["account_name"] == "Majid Hussain"
    assert "5riryn4o_IMG_20260428_180302.jpg" in (j["upi_qr_url"] or "")
    assert (j["upi_deep_link"] or "").startswith("upi://pay?pa=8919803257@fam")


def test_payment_submit_and_list(free_user_token):
    r = requests.post(
        f"{BASE_URL}/api/payments/submit",
        json={"amount": 600, "reference": "TXN_TEST_123", "method": "UPI"},
        headers=H(free_user_token),
    )
    assert r.status_code == 200
    pid = r.json()["id"]
    r = requests.get(f"{BASE_URL}/api/payments/my", headers=H(free_user_token))
    assert r.status_code == 200 and any(p["id"] == pid for p in r.json())


# ============ admin guards & approval flow ============
def test_admin_guard_non_admin(free_user_token):
    r = requests.get(f"{BASE_URL}/api/admin/users", headers=H(free_user_token))
    assert r.status_code == 403


def test_admin_users_list(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/users", headers=H(admin_token))
    assert r.status_code == 200 and isinstance(r.json(), list)


def test_admin_stats(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/stats", headers=H(admin_token))
    assert r.status_code == 200
    for k in ("total_users", "total_medicines", "pending_payments", "approved_payments"):
        assert k in r.json()


def test_admin_approve_unblocks_user(admin_token, fresh_user_for_approval):
    """Approving payment should make user premium and unblock POST /medicines."""
    creds, user_tok = fresh_user_for_approval

    # Confirm the user is BLOCKED before approval
    r = requests.post(
        f"{BASE_URL}/api/medicines",
        json={"name": "TEST_PreApprove", "batch_number": "BX1", "expiry_date": "2027-01-01", "quantity": 1},
        headers=H(user_tok),
    )
    assert r.status_code == 402

    # Submit + approve payment
    r = requests.post(
        f"{BASE_URL}/api/payments/submit",
        json={"amount": 600, "reference": "TXN_APPROVE_GATE_1", "method": "UPI"},
        headers=H(user_tok),
    )
    pid = r.json()["id"]
    r = requests.post(f"{BASE_URL}/api/admin/payments/{pid}/approve", headers=H(admin_token))
    assert r.status_code == 200 and r.json()["status"] == "approved"

    # /me reflects premium
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=H(user_tok))
    assert r.status_code == 200
    me = r.json()
    assert me["is_premium"] is True
    assert me["premium_expires_at"], "premium_expires_at must be set after approval"

    # Now POST /medicines must succeed
    r = requests.post(
        f"{BASE_URL}/api/medicines",
        json={"name": "TEST_PostApprove", "batch_number": "BX2", "expiry_date": "2027-01-01", "quantity": 1},
        headers=H(user_tok),
    )
    assert r.status_code == 200, r.text
    mid = r.json()["id"]
    requests.delete(f"{BASE_URL}/api/medicines/{mid}", headers=H(user_tok))


def test_admin_reject_payment(admin_token, free_user_token):
    r = requests.post(
        f"{BASE_URL}/api/payments/submit",
        json={"amount": 600, "reference": "TXN_REJ_1", "method": "UPI"},
        headers=H(free_user_token),
    )
    pid = r.json()["id"]
    r = requests.post(f"{BASE_URL}/api/admin/payments/{pid}/reject", headers=H(admin_token))
    assert r.status_code == 200


# ============ membership status (NEW endpoint) ============
def test_membership_status_admin(admin_token):
    """Admin → is_premium=true, is_admin=true, needs_renewal=false (admin never needs renewal)."""
    r = requests.get(f"{BASE_URL}/api/membership/status", headers=H(admin_token))
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["is_premium"] is True
    assert j["is_admin"] is True
    assert j["needs_renewal"] is False
    assert j["activation_sla_minutes"] == 30


def test_membership_status_fresh_free_user(free_user_token):
    """Fresh free user → is_premium=false, expires_at=null, days_left=null, needs_renewal=false, activation_sla_minutes=30."""
    r = requests.get(f"{BASE_URL}/api/membership/status", headers=H(free_user_token))
    assert r.status_code == 200
    j = r.json()
    assert j["is_premium"] is False
    assert j["is_admin"] is False
    assert j["expires_at"] is None
    assert j["days_left"] is None
    assert j["needs_renewal"] is False
    assert j["activation_sla_minutes"] == 30


def test_membership_status_premium_near_expiry(admin_token):
    """Premium user with expiry within 5 days → needs_renewal=true, 0<=days_left<=5."""
    creds = {
        "email": f"TEST_near_{uuid.uuid4().hex[:8]}@example.com",
        "password": "Passw0rd!",
        "name": "Near Expiry",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=creds)
    assert r.status_code == 200
    user_tok = r.json()["token"]
    user_id = r.json()["user"]["id"]
    # Grant premium for 1 month, then directly set expiry to ~3 days from now via two-step:
    # First grant (sets ~30 days), then revoke and grant 0 months won't work — instead use Mongo? No, use API only.
    # Workaround: grant 1 month then call grant with negative? Not supported. Instead, manipulate via approve flow + admin DB?
    # Simpler: use admin grant for 1 month, then use a direct override endpoint? None exists.
    # Use the /admin/users endpoint: we need to set premium_expires_at to ~3 days from now.
    # The grant API only adds 30*months days. Pass a negative? Let's try months=0 won't change. Use direct DB? No db access in test.
    # Strategy: grant 1 month, but then use admin to revoke and re-set via approve flow with creative timing — not possible.
    # Best option: PATCH directly via a test-only path — none. So grant months=1 (~30 days), then manually adjust by calling
    # grant with months=-27 won't work since base is current_exp + 30*months — would go negative.
    # Final workaround: directly update via mongo through python motor — but tests are sync. Use pymongo here.
    from pymongo import MongoClient
    from datetime import datetime, timezone, timedelta
    mc = MongoClient(os.environ.get("MONGO_URL"))
    mdb = mc[os.environ.get("DB_NAME")]
    near = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    mdb.users.update_one({"id": user_id}, {"$set": {"premium_expires_at": near}})
    try:
        r = requests.get(f"{BASE_URL}/api/membership/status", headers=H(user_tok))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["is_premium"] is True
        assert j["is_admin"] is False
        assert j["needs_renewal"] is True
        assert j["days_left"] is not None
        assert 0 <= j["days_left"] <= 5
        assert j["activation_sla_minutes"] == 30
    finally:
        mdb.users.delete_one({"id": user_id})
        mc.close()


def test_membership_status_premium_far_expiry(admin_token):
    """Premium user with expiry 30 days away → needs_renewal=false."""
    creds = {
        "email": f"TEST_far_{uuid.uuid4().hex[:8]}@example.com",
        "password": "Passw0rd!",
        "name": "Far Expiry",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=creds)
    assert r.status_code == 200
    user_tok = r.json()["token"]
    user_id = r.json()["user"]["id"]
    # Use admin grant API to get ~30 day expiry
    r = requests.post(f"{BASE_URL}/api/admin/users/{user_id}/grant?months=1", headers=H(admin_token))
    assert r.status_code == 200
    try:
        r = requests.get(f"{BASE_URL}/api/membership/status", headers=H(user_tok))
        assert r.status_code == 200
        j = r.json()
        assert j["is_premium"] is True
        assert j["needs_renewal"] is False
        assert j["days_left"] is not None
        assert j["days_left"] > 5
    finally:
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL"))
        mdb = mc[os.environ.get("DB_NAME")]
        mdb.users.delete_one({"id": user_id})
        mc.close()


# ============ alerts (NEW endpoints with item details) ============
def test_alerts_recent_returns_items_array(free_user_token):
    r = requests.get(f"{BASE_URL}/api/alerts/recent", headers=H(free_user_token))
    assert r.status_code == 200
    alerts = r.json()
    assert isinstance(alerts, list)
    # Each alert (if any) must have an items list
    for a in alerts:
        assert "items" in a and isinstance(a["items"], list)


def test_alerts_live_shape(admin_token):
    """GET /api/alerts/live must return {count, items[]}."""
    # Seed one expiring item as admin
    from datetime import datetime, timezone, timedelta
    soon = (datetime.now(timezone.utc).date() + timedelta(days=5)).isoformat()
    r = requests.post(
        f"{BASE_URL}/api/medicines",
        json={"name": "TEST_LiveExpiry", "batch_number": "BLIVE1", "expiry_date": soon, "quantity": 7},
        headers=H(admin_token),
    )
    assert r.status_code == 200
    mid = r.json()["id"]
    try:
        r = requests.get(f"{BASE_URL}/api/alerts/live", headers=H(admin_token))
        assert r.status_code == 200
        j = r.json()
        assert "count" in j and "items" in j
        assert isinstance(j["items"], list)
        # The seeded item must be present with the required fields
        match = [m for m in j["items"] if m["id"] == mid]
        assert match, "seeded expiring medicine should appear in /alerts/live"
        m = match[0]
        for k in ("name", "batch_number", "quantity", "expiry_date"):
            assert k in m
    finally:
        requests.delete(f"{BASE_URL}/api/medicines/{mid}", headers=H(admin_token))
