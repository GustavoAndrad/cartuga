from app.auth.security import decode_access_token
from app.models.enums import UserRole
from app.models.user import User


def test_login_with_correct_credentials_returns_access_token(client, make_user):
    make_user(email="alice@example.com", password="S3nhaForte!")

    response = client.post(
        "/auth/login", json={"email": "alice@example.com", "password": "S3nhaForte!"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == "alice@example.com"
    assert "password" not in body["user"]
    assert "password_hash" not in body["user"]
    assert "refresh_token" in response.cookies


def test_login_with_wrong_password_is_rejected(client, make_user):
    make_user(email="bob@example.com", password="S3nhaForte!")

    response = client.post(
        "/auth/login", json={"email": "bob@example.com", "password": "wrong-password"}
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_login_with_unknown_email_is_rejected(client):
    response = client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": "whatever"}
    )
    assert response.status_code == 401


def test_password_is_never_stored_or_returned_in_plain_text(client, make_user, db_session):
    make_user(email="carol@example.com", password="S3nhaForte!")

    response = client.post(
        "/auth/login", json={"email": "carol@example.com", "password": "S3nhaForte!"}
    )
    assert response.status_code == 200

    user = db_session.query(User).filter(User.email == "carol@example.com").first()
    assert user.password_hash != "S3nhaForte!"
    assert user.password_hash.startswith("$argon2")


def test_access_token_payload_identifies_user(client, make_user):
    user = make_user(email="dave@example.com", password="S3nhaForte!")

    response = client.post(
        "/auth/login", json={"email": "dave@example.com", "password": "S3nhaForte!"}
    )
    token = response.json()["access_token"]

    payload = decode_access_token(token)
    assert payload["sub"] == str(user.id)
    assert payload["role"] == "USER"
    assert "exp" in payload


def test_protected_endpoint_rejects_missing_token(client):
    response = client.get("/users/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_protected_endpoint_rejects_invalid_token(client):
    response = client.get("/users/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401


def test_protected_endpoint_rejects_expired_token(client, make_user):
    import uuid
    from datetime import datetime, timedelta, timezone

    import jwt

    from app.config import get_settings

    user = make_user(email="hank@example.com", password="S3nhaForte!")
    settings = get_settings()

    now = datetime.now(timezone.utc)
    expired_payload = {
        "sub": str(user.id),
        "role": "USER",
        "jti": str(uuid.uuid4()),
        "iat": now - timedelta(minutes=30),
        "exp": now - timedelta(minutes=15),
    }
    expired_token = jwt.encode(expired_payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    response = client.get("/users/me", headers={"Authorization": f"Bearer {expired_token}"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_protected_endpoint_accepts_valid_token(client, make_user):
    make_user(email="erin@example.com", password="S3nhaForte!")
    login_response = client.post(
        "/auth/login", json={"email": "erin@example.com", "password": "S3nhaForte!"}
    )
    token = login_response.json()["access_token"]

    response = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["email"] == "erin@example.com"


def test_refresh_without_cookie_is_rejected(client):
    response = client.post("/auth/refresh")
    assert response.status_code == 401


def test_refresh_rotates_tokens_and_old_refresh_token_stops_working(client, make_user):
    make_user(email="frank@example.com", password="S3nhaForte!")
    login_response = client.post(
        "/auth/login", json={"email": "frank@example.com", "password": "S3nhaForte!"}
    )
    old_refresh_cookie = login_response.cookies.get("refresh_token")
    assert old_refresh_cookie

    refresh_response = client.post("/auth/refresh")
    assert refresh_response.status_code == 200
    assert refresh_response.json()["access_token"]

    client.cookies.set("refresh_token", old_refresh_cookie)
    replay_response = client.post("/auth/refresh")
    assert replay_response.status_code == 401


def test_logout_revokes_refresh_token(client, make_user):
    make_user(email="grace@example.com", password="S3nhaForte!")
    login_response = client.post(
        "/auth/login", json={"email": "grace@example.com", "password": "S3nhaForte!"}
    )
    token = login_response.json()["access_token"]

    logout_response = client.post(
        "/auth/logout", headers={"Authorization": f"Bearer {token}"}
    )
    assert logout_response.status_code == 204

    refresh_response = client.post("/auth/refresh")
    assert refresh_response.status_code == 401


def test_user_cannot_access_another_users_admin_only_resource(client, make_user):
    make_user(email="regular@example.com", password="S3nhaForte!", role=UserRole.USER)
    login_response = client.post(
        "/auth/login", json={"email": "regular@example.com", "password": "S3nhaForte!"}
    )
    token = login_response.json()["access_token"]

    response = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["role"] == "USER"
