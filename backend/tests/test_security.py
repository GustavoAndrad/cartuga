"""Hardening: secrets, login brute force, input bounds."""

import pytest
from pydantic import ValidationError

from app.auth import rate_limit
from app.config import Settings


def _login(client, email, password):
    return client.post("/auth/login", json={"email": email, "password": password})


# ---- secrets -------------------------------------------------------------------------------


@pytest.mark.parametrize("value", ["", "curto-demais", "troque_por_uma_string_aleatoria_longa", "dev-secret-change-me"])
def test_public_or_weak_jwt_secret_refuses_to_start(value):
    with pytest.raises(ValidationError) as raised:
        Settings(jwt_secret=value)
    message = str(raised.value)
    assert "JWT_SECRET" in message and "por exemplo: JWT_SECRET=" in message  # tells how to fix


def test_a_long_private_jwt_secret_is_accepted():
    assert Settings(jwt_secret="x" * 40).jwt_secret == "x" * 40


def test_assistant_encryption_key_is_optional_but_never_weak():
    assert Settings(jwt_secret="x" * 40, assistant_encryption_key="").assistant_encryption_key == ""
    with pytest.raises(ValidationError):
        Settings(jwt_secret="x" * 40, assistant_encryption_key="fraca")


# ---- login brute force ----------------------------------------------------------------------


def test_repeated_wrong_passwords_are_blocked_even_with_the_right_one(client, make_user):
    make_user(email="ana@example.com", password="S3nhaForte!")
    for _ in range(rate_limit.MAX_FAILURES_PER_ACCOUNT):
        assert _login(client, "ana@example.com", "errada").status_code == 401

    blocked = _login(client, "ana@example.com", "S3nhaForte!")

    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "TOO_MANY_ATTEMPTS"
    assert "minuto" in blocked.json()["error"]["message"]


def test_a_successful_login_clears_the_failures(client, make_user):
    make_user(email="ana@example.com", password="S3nhaForte!")
    for _ in range(rate_limit.MAX_FAILURES_PER_ACCOUNT - 1):
        _login(client, "ana@example.com", "errada")
    assert _login(client, "ana@example.com", "S3nhaForte!").status_code == 200

    for _ in range(rate_limit.MAX_FAILURES_PER_ACCOUNT - 1):
        assert _login(client, "ana@example.com", "errada").status_code == 401


def test_spraying_many_accounts_from_one_address_is_blocked(client):
    for i in range(rate_limit.MAX_FAILURES_PER_IP):
        _login(client, f"pessoa{i}@example.com", "errada")

    assert _login(client, "outra@example.com", "errada").status_code == 429


def test_failures_expire_after_the_window(client, make_user, monkeypatch):
    make_user(email="ana@example.com", password="S3nhaForte!")
    now = [1000.0]
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: now[0])
    for _ in range(rate_limit.MAX_FAILURES_PER_ACCOUNT):
        _login(client, "ana@example.com", "errada")
    assert _login(client, "ana@example.com", "S3nhaForte!").status_code == 429

    now[0] += rate_limit.WINDOW_SECONDS + 1

    assert _login(client, "ana@example.com", "S3nhaForte!").status_code == 200


def test_unknown_email_still_spends_a_password_check(client, monkeypatch):
    """Same work as a wrong password - response time doesn't reveal who has an account."""
    from app.auth import security

    checked = []
    original = security.verify_password
    monkeypatch.setattr(security, "verify_password", lambda p, h: checked.append(h) or original(p, h))

    assert _login(client, "ninguem@example.com", "qualquer").status_code == 401
    assert checked == [security._DUMMY_HASH]


# ---- input bounds ---------------------------------------------------------------------------


def _headers(client, make_user):
    make_user(email="ana@example.com", password="S3nhaForte!")
    token = _login(client, "ana@example.com", "S3nhaForte!").json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_oversized_text_is_a_validation_error_not_a_server_error(client, make_user):
    headers = _headers(client, make_user)
    entry = {
        "date": "2026-01-05", "amount": "10.00", "description": "x" * 256, "source": "Empresa", "type": "EXCEPTIONAL",
    }

    assert client.post("/entries", headers=headers, json=entry).status_code == 422
    assert client.post("/entries", headers=headers, json={**entry, "description": "ok", "source": "y" * 151}).status_code == 422
    assert client.post("/entries", headers=headers, json={**entry, "description": "ok"}).status_code == 201


@pytest.mark.parametrize(
    "photo, status",
    [
        ("https://example.com/eu.png", 200),
        ("", 200),
        ("javascript:alert(1)", 422),
        ("data:image/png;base64,AAAA", 422),
        ("foto.png", 422),
        ("https://example.com/" + "a" * 500, 422),
    ],
)
def test_profile_photo_must_be_a_web_address(client, make_user, photo, status):
    headers = _headers(client, make_user)
    assert client.put("/users/me/photo", headers=headers, json={"photo": photo}).status_code == status


def test_passwords_have_an_upper_bound(client, make_user):
    headers = _headers(client, make_user)
    response = client.put(
        "/users/me/password", headers=headers, json={"current_password": "S3nhaForte!", "new_password": "a" * 129}
    )
    assert response.status_code == 422
    assert _login(client, "ana@example.com", "a" * 129).status_code == 422


def test_api_responses_carry_security_headers(client):
    response = client.get("/health")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
