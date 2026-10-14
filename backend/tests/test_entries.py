def _auth_header(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_and_list_entry(client, make_user):
    make_user(email="a@example.com", password="Sfort3!123")
    headers = _auth_header(client, "a@example.com", "Sfort3!123")

    create_response = client.post(
        "/entries",
        headers=headers,
        json={
            "date": "2026-02-20",
            "amount": "20.00",
            "description": "Bico",
            "source": "Freela",
            "type": "EXCEPTIONAL",
        },
    )
    assert create_response.status_code == 201
    entry_id = create_response.json()["id"]

    list_response = client.get("/entries", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert list_response.json()[0]["id"] == entry_id


def test_fixed_entry_requires_start_date(client, make_user):
    make_user(email="b@example.com", password="Sfort3!123")
    headers = _auth_header(client, "b@example.com", "Sfort3!123")

    response = client.post(
        "/entries",
        headers=headers,
        json={
            "date": "2026-01-05",
            "amount": "1800.00",
            "description": "Salario",
            "source": "Trabalho",
            "type": "FIXED",
        },
    )
    assert response.status_code == 422


def test_entry_amount_must_be_positive(client, make_user):
    make_user(email="c@example.com", password="Sfort3!123")
    headers = _auth_header(client, "c@example.com", "Sfort3!123")

    response = client.post(
        "/entries",
        headers=headers,
        json={
            "date": "2026-01-05",
            "amount": "-1",
            "description": "x",
            "source": "x",
            "type": "EXCEPTIONAL",
        },
    )
    assert response.status_code == 422


def test_update_and_delete_entry(client, make_user):
    make_user(email="d@example.com", password="Sfort3!123")
    headers = _auth_header(client, "d@example.com", "Sfort3!123")

    create_response = client.post(
        "/entries",
        headers=headers,
        json={
            "date": "2026-01-05",
            "amount": "100.00",
            "description": "x",
            "source": "x",
            "type": "EXCEPTIONAL",
        },
    )
    entry_id = create_response.json()["id"]

    update_response = client.put(
        f"/entries/{entry_id}",
        headers=headers,
        json={
            "date": "2026-01-06",
            "amount": "150.00",
            "description": "y",
            "source": "y",
            "type": "EXCEPTIONAL",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["amount"] == "150.00"

    delete_response = client.delete(f"/entries/{entry_id}", headers=headers)
    assert delete_response.status_code == 204

    get_response = client.get(f"/entries/{entry_id}", headers=headers)
    assert get_response.status_code == 404


def test_user_cannot_see_or_modify_another_users_entry(client, make_user):
    make_user(email="owner@example.com", password="Sfort3!123")
    make_user(email="intruder@example.com", password="Sfort3!123")

    owner_headers = _auth_header(client, "owner@example.com", "Sfort3!123")
    intruder_headers = _auth_header(client, "intruder@example.com", "Sfort3!123")

    create_response = client.post(
        "/entries",
        headers=owner_headers,
        json={
            "date": "2026-01-05",
            "amount": "100.00",
            "description": "secret",
            "source": "x",
            "type": "EXCEPTIONAL",
        },
    )
    entry_id = create_response.json()["id"]

    # IDOR checks: intruder can't read, update, or delete the owner's entry.
    assert client.get(f"/entries/{entry_id}", headers=intruder_headers).status_code == 404
    assert (
        client.put(
            f"/entries/{entry_id}",
            headers=intruder_headers,
            json={
                "date": "2026-01-05",
                "amount": "1.00",
                "description": "hacked",
                "source": "x",
                "type": "EXCEPTIONAL",
            },
        ).status_code
        == 404
    )
    assert client.delete(f"/entries/{entry_id}", headers=intruder_headers).status_code == 404

    # And doesn't show up in the intruder's own list.
    assert client.get("/entries", headers=intruder_headers).json() == []
    # Owner still sees it, untouched.
    owner_list = client.get("/entries", headers=owner_headers).json()
    assert len(owner_list) == 1
    assert owner_list[0]["description"] == "secret"


def test_entries_endpoint_rejects_unauthenticated_requests(client):
    assert client.get("/entries").status_code == 401
    assert client.post("/entries", json={}).status_code == 401


def test_create_entry_in_foreign_currency_converts_to_brl(client, make_user, monkeypatch):
    make_user(email="fx@example.com", password="Sfort3!123")
    headers = _auth_header(client, "fx@example.com", "Sfort3!123")

    from app.services import exchange_rate_service

    # 1 BRL = 0.2 EUR  <=>  1 EUR = 5 BRL.
    monkeypatch.setattr(
        exchange_rate_service,
        "get_rate_for_date",
        lambda target_date: {"date": target_date.isoformat(), "BRL": 1.0, "USD": 0.2, "EUR": 0.2},
    )

    response = client.post(
        "/entries",
        headers=headers,
        json={
            "date": "2026-01-10",
            "amount": "10.00",
            "currency": "EUR",
            "description": "Freela internacional",
            "source": "Cliente EU",
            "type": "EXCEPTIONAL",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["currency"] == "EUR"
    assert body["original_amount"] == "10.00"
    assert body["exchange_rate"] == "5.000000"
    assert body["exchange_rate_date"] == "2026-01-10"
    # 10 EUR at 1 EUR = 5 BRL is 50 BRL - the BRL-canonical amount every calculation uses.
    assert body["amount"] == "50.00"


def test_create_entry_defaults_to_brl_with_no_conversion(client, make_user):
    make_user(email="brl@example.com", password="Sfort3!123")
    headers = _auth_header(client, "brl@example.com", "Sfort3!123")

    response = client.post(
        "/entries",
        headers=headers,
        json={
            "date": "2026-01-10",
            "amount": "42.00",
            "description": "Venda",
            "source": "Loja",
            "type": "EXCEPTIONAL",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["currency"] == "BRL"
    assert body["amount"] == "42.00"
    assert body["original_amount"] == "42.00"
    assert body["exchange_rate"] == "1.000000"
    assert body["exchange_rate_date"] == "2026-01-10"
