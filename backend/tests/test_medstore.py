"""MedStore backend API tests - auth, medicines, dashboard, payments, admin, OCR."""
import os
import io
import uuid
import base64
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pharma-track-24.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@medstore.com"
ADMIN_PASSWORD = "Admin@12345"

# ---- fixtures ----
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]

@pytest.fixture(scope="session")
def user_creds():
    email = f"TEST_user_{uuid.uuid4().hex[:8]}@example.com"
    return {"email": email, "password": "Passw0rd!", "name": "Test User", "shop_name": "TestShop"}

@pytest.fixture(scope="session")
def user_token(user_creds):
    r = requests.post(f"{BASE_URL}/api/auth/register", json=user_creds)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and data["user"]["email"] == user_creds["email"].lower()
    return data["token"]

def H(tok): return {"Authorization": f"Bearer {tok}"}

# ---- auth ----
def test_login_admin():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    j = r.json(); assert j["user"]["is_admin"] is True

def test_login_invalid():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "none@x.com", "password": "bad"})
    assert r.status_code == 401

def test_me(user_token, user_creds):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=H(user_token))
    assert r.status_code == 200
    assert r.json()["email"] == user_creds["email"].lower()

def test_me_no_token():
    r = requests.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code in (401, 403)

# ---- medicines ----
def test_medicine_crud(user_token):
    payload = {"name": "TEST_Paracetamol", "batch_number": "B001", "expiry_date": "2026-05-30", "quantity": 20}
    r = requests.post(f"{BASE_URL}/api/medicines", json=payload, headers=H(user_token))
    assert r.status_code == 200, r.text
    mid = r.json()["id"]
    # list
    r = requests.get(f"{BASE_URL}/api/medicines", headers=H(user_token))
    assert r.status_code == 200 and any(m["id"] == mid for m in r.json())
    # update
    r = requests.put(f"{BASE_URL}/api/medicines/{mid}", json={"quantity": 50}, headers=H(user_token))
    assert r.status_code == 200 and r.json()["quantity"] == 50
    # search
    r = requests.get(f"{BASE_URL}/api/medicines?search=TEST_Para", headers=H(user_token))
    assert r.status_code == 200 and len(r.json()) >= 1
    # filter expired (none yet)
    r = requests.get(f"{BASE_URL}/api/medicines?filter=expired", headers=H(user_token))
    assert r.status_code == 200
    # delete
    r = requests.delete(f"{BASE_URL}/api/medicines/{mid}", headers=H(user_token))
    assert r.status_code == 200
    r = requests.put(f"{BASE_URL}/api/medicines/{mid}", json={"quantity": 1}, headers=H(user_token))
    assert r.status_code == 404

def test_dashboard_stats(user_token):
    r = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=H(user_token))
    assert r.status_code == 200
    j = r.json()
    for k in ("total", "expiring_soon", "expired", "total_quantity", "is_premium"):
        assert k in j

def test_free_limit(user_token):
    # create up to 10, then 11th must fail 402
    created = []
    # clear current first
    r = requests.get(f"{BASE_URL}/api/medicines", headers=H(user_token))
    for m in r.json():
        requests.delete(f"{BASE_URL}/api/medicines/{m['id']}", headers=H(user_token))
    for i in range(10):
        r = requests.post(f"{BASE_URL}/api/medicines",
            json={"name": f"TEST_M{i}", "batch_number": f"B{i}", "expiry_date": "2027-01-01", "quantity": 1},
            headers=H(user_token))
        assert r.status_code == 200, r.text
        created.append(r.json()["id"])
    r = requests.post(f"{BASE_URL}/api/medicines",
        json={"name": "TEST_11", "batch_number": "B11", "expiry_date": "2027-01-01", "quantity": 1},
        headers=H(user_token))
    assert r.status_code == 402
    # cleanup
    for mid in created:
        requests.delete(f"{BASE_URL}/api/medicines/{mid}", headers=H(user_token))

# ---- payments ----
def test_bank_details(user_token):
    r = requests.get(f"{BASE_URL}/api/payments/bank-details", headers=H(user_token))
    assert r.status_code == 200 and "amount" in r.json()

def test_payment_submit_and_list(user_token):
    r = requests.post(f"{BASE_URL}/api/payments/submit",
        json={"amount": 600, "reference": "TXN_TEST_123", "method": "UPI"}, headers=H(user_token))
    assert r.status_code == 200
    pid = r.json()["id"]
    r = requests.get(f"{BASE_URL}/api/payments/my", headers=H(user_token))
    assert r.status_code == 200 and any(p["id"] == pid for p in r.json())

# ---- admin guards ----
def test_admin_guard_non_admin(user_token):
    r = requests.get(f"{BASE_URL}/api/admin/users", headers=H(user_token))
    assert r.status_code == 403

def test_admin_users_list(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/users", headers=H(admin_token))
    assert r.status_code == 200 and isinstance(r.json(), list)

def test_admin_stats(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/stats", headers=H(admin_token))
    assert r.status_code == 200
    for k in ("total_users", "total_medicines", "pending_payments", "approved_payments"):
        assert k in r.json()

def test_admin_approve_flow(admin_token, user_token, user_creds):
    # create a pending payment
    r = requests.post(f"{BASE_URL}/api/payments/submit",
        json={"amount": 600, "reference": "TXN_APPROVE_1", "method": "UPI"}, headers=H(user_token))
    pid = r.json()["id"]
    r = requests.post(f"{BASE_URL}/api/admin/payments/{pid}/approve", headers=H(admin_token))
    assert r.status_code == 200 and r.json()["status"] == "approved"
    # user should now be premium
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=H(user_token))
    assert r.json()["is_premium"] is True
    # revoke
    uid = r.json()["id"]
    r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/revoke", headers=H(admin_token))
    assert r.status_code == 200
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=H(user_token))
    assert r.json()["is_premium"] is False
    # grant
    r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/grant", headers=H(admin_token))
    assert r.status_code == 200

def test_admin_reject_payment(admin_token, user_token):
    r = requests.post(f"{BASE_URL}/api/payments/submit",
        json={"amount": 600, "reference": "TXN_REJ_1", "method": "UPI"}, headers=H(user_token))
    pid = r.json()["id"]
    r = requests.post(f"{BASE_URL}/api/admin/payments/{pid}/reject", headers=H(admin_token))
    assert r.status_code == 200

# ---- OCR ----
def _receipt_image():
    img = Image.new("RGB", (600, 400), color=(255, 255, 255))
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    d.text((20, 20), "MediPlus Pharmacy Receipt", fill=(0, 0, 0))
    d.text((20, 60), "Paracetamol 500mg  B#PAR123  EXP 12/27  QTY 10", fill=(0, 0, 0))
    d.text((20, 90), "Amoxicillin 250mg  B#AMX555  EXP 06/28  QTY 5", fill=(0, 0, 0))
    d.rectangle([10, 10, 590, 390], outline=(0, 0, 0), width=2)
    buf = io.BytesIO(); img.save(buf, format="JPEG"); return buf.getvalue()

def test_ocr_extract(user_token):
    img_bytes = _receipt_image()
    files = {"file": ("receipt.jpg", img_bytes, "image/jpeg")}
    r = requests.post(f"{BASE_URL}/api/ocr/extract", files=files, headers=H(user_token), timeout=120)
    assert r.status_code == 200, r.text
    j = r.json(); assert "medicines" in j and isinstance(j["medicines"], list)
