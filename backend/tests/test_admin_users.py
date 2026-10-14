from app.models.enums import UserRole


def _auth_header(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_regular_user_cannot_list_or_create_users(client, make_user):
    make_user(email="regular@example.com", password="Sfort3!123", role=UserRole.USER)
    headers = _auth_header(client, "regular@example.com", "Sfort3!123")

    assert client.get("/users", headers=headers).status_code == 403
    assert (
        client.post(
            "/users",
            headers=headers,
            json={"name": "x", "email": "new@example.com", "password": "Sfort3!123"},
        ).status_code
        == 403
    )


def test_admin_can_create_list_update_delete_users(client, make_user):
    make_user(email="admin@example.com", password="Sfort3!123", role=UserRole.ADMIN)
    admin_headers = _auth_header(client, "admin@example.com", "Sfort3!123")

    create_response = client.post(
        "/users",
        headers=admin_headers,
        json={"name": "Novo Usuario", "email": "novo@example.com", "password": "Sfort3!123"},
    )
    assert create_response.status_code == 201
    body = create_response.json()
    assert "password" not in body
    assert "password_hash" not in body
    new_user_id = body["id"]

    list_response = client.get("/users", headers=admin_headers)
    assert list_response.status_code == 200
    assert any(u["id"] == new_user_id for u in list_response.json())

    update_response = client.put(
        f"/users/{new_user_id}",
        headers=admin_headers,
        json={"name": "Nome Atualizado"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Nome Atualizado"

    delete_response = client.delete(f"/users/{new_user_id}", headers=admin_headers)
    assert delete_response.status_code == 204
    assert client.get(f"/users/{new_user_id}", headers=admin_headers).status_code == 404


def test_admin_cannot_delete_own_account(client, make_user):
    admin = make_user(email="selfadmin@example.com", password="Sfort3!123", role=UserRole.ADMIN)
    admin_headers = _auth_header(client, "selfadmin@example.com", "Sfort3!123")

    response = client.delete(f"/users/{admin.id}", headers=admin_headers)
    assert response.status_code == 422


def test_admin_cannot_create_user_with_weak_short_password(client, make_user):
    make_user(email="admin3@example.com", password="Sfort3!123", role=UserRole.ADMIN)
    admin_headers = _auth_header(client, "admin3@example.com", "Sfort3!123")

    for weak_password in ("", "1234567"):  # empty and 7 chars, both under the 8-char minimum
        response = client.post(
            "/users",
            headers=admin_headers,
            json={"name": "x", "email": f"weak{len(weak_password)}@example.com", "password": weak_password},
        )
        assert response.status_code == 422


def test_new_user_password_is_hashed_not_returned_in_plain_text(client, make_user, db_session):
    make_user(email="admin2@example.com", password="Sfort3!123", role=UserRole.ADMIN)
    admin_headers = _auth_header(client, "admin2@example.com", "Sfort3!123")

    response = client.post(
        "/users",
        headers=admin_headers,
        json={"name": "x", "email": "plain@example.com", "password": "MinhaSenha123!"},
    )
    assert response.status_code == 201

    from app.models.user import User

    user = db_session.query(User).filter(User.email == "plain@example.com").first()
    assert user.password_hash != "MinhaSenha123!"
    assert user.password_hash.startswith("$argon2")
