from datetime import date


def _auth_header(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_credit_expense_from_today(client, headers, count=3):
    """3 installments purchased today, due this/next/the-following month - the advance
    endpoint's rules are relative to the real current date, so these tests can't use
    the fixed 2026-01-10 dates the rest of the file uses."""
    return client.post(
        "/expenses",
        headers=headers,
        json={
            "date": date.today().isoformat(),
            "amount": "90.00",
            "description": "Compra parcelada",
            "source": "Loja X",
            "type": "EXCEPTIONAL",
            "payment_method": "CREDITO",
            "installments_count": count,
        },
    )


def test_conta_expense_crud(client, make_user):
    make_user(email="a@example.com", password="Sfort3!123")
    headers = _auth_header(client, "a@example.com", "Sfort3!123")

    create_response = client.post(
        "/expenses",
        headers=headers,
        json={
            "date": "2026-01-01",
            "amount": "500.00",
            "description": "Aluguel",
            "source": "Imobiliaria",
            "type": "FIXED",
            "payment_method": "CONTA",
            "start_date": "2026-01-01",
        },
    )
    assert create_response.status_code == 201
    assert create_response.json()["installments"] == []


def test_credit_expense_generates_installments_matching_spec_example(client, make_user):
    make_user(email="b@example.com", password="Sfort3!123")
    headers = _auth_header(client, "b@example.com", "Sfort3!123")

    response = client.post(
        "/expenses",
        headers=headers,
        json={
            "date": "2026-01-10",
            "amount": "90.00",
            "description": "Compra parcelada",
            "source": "Loja X",
            "type": "EXCEPTIONAL",
            "payment_method": "CREDITO",
            "installments_count": 3,
        },
    )
    assert response.status_code == 201
    installments = response.json()["installments"]
    assert len(installments) == 3
    assert [i["base_amount"] for i in installments] == ["30.00", "30.00", "30.00"]
    assert [i["due_date"] for i in installments] == ["2026-01-10", "2026-02-10", "2026-03-10"]


def test_credit_expense_requires_installments_count(client, make_user):
    make_user(email="c@example.com", password="Sfort3!123")
    headers = _auth_header(client, "c@example.com", "Sfort3!123")

    response = client.post(
        "/expenses",
        headers=headers,
        json={
            "date": "2026-01-10",
            "amount": "90.00",
            "description": "x",
            "source": "x",
            "type": "EXCEPTIONAL",
            "payment_method": "CREDITO",
        },
    )
    assert response.status_code == 422


def test_credit_expense_rejects_installments_outside_1_to_24(client, make_user):
    make_user(email="d@example.com", password="Sfort3!123")
    headers = _auth_header(client, "d@example.com", "Sfort3!123")

    for count in (0, 25):
        response = client.post(
            "/expenses",
            headers=headers,
            json={
                "date": "2026-01-10",
                "amount": "90.00",
                "description": "x",
                "source": "x",
                "type": "EXCEPTIONAL",
                "payment_method": "CREDITO",
                "installments_count": count,
            },
        )
        assert response.status_code == 422


def test_fixed_expense_must_be_conta(client, make_user):
    make_user(email="e@example.com", password="Sfort3!123")
    headers = _auth_header(client, "e@example.com", "Sfort3!123")

    response = client.post(
        "/expenses",
        headers=headers,
        json={
            "date": "2026-01-01",
            "amount": "100.00",
            "description": "x",
            "source": "x",
            "type": "FIXED",
            "payment_method": "CREDITO",
            "start_date": "2026-01-01",
        },
    )
    assert response.status_code == 422


def test_credit_expense_amount_is_immutable_after_creation(client, make_user):
    make_user(email="f@example.com", password="Sfort3!123")
    headers = _auth_header(client, "f@example.com", "Sfort3!123")

    create_response = client.post(
        "/expenses",
        headers=headers,
        json={
            "date": "2026-01-10",
            "amount": "90.00",
            "description": "Compra parcelada",
            "source": "Loja X",
            "type": "EXCEPTIONAL",
            "payment_method": "CREDITO",
            "installments_count": 3,
        },
    )
    expense_id = create_response.json()["id"]

    update_response = client.put(
        f"/expenses/{expense_id}",
        headers=headers,
        json={
            "date": "2026-01-10",
            "amount": "999.00",
            "description": "Compra parcelada editada",
            "source": "Loja X",
            "type": "EXCEPTIONAL",
            "payment_method": "CREDITO",
        },
    )
    assert update_response.status_code == 422
    assert update_response.json()["error"]["code"] == "VALIDATION_ERROR"

    # description/source alone are still editable.
    ok_update = client.put(
        f"/expenses/{expense_id}",
        headers=headers,
        json={
            "date": "2026-01-10",
            "amount": "90.00",
            "description": "Compra parcelada editada",
            "source": "Loja X",
            "type": "EXCEPTIONAL",
            "payment_method": "CREDITO",
        },
    )
    assert ok_update.status_code == 200
    assert ok_update.json()["description"] == "Compra parcelada editada"


def test_credit_expense_currency_is_immutable_after_creation(client, make_user):
    make_user(email="g@example.com", password="Sfort3!123")
    headers = _auth_header(client, "g@example.com", "Sfort3!123")

    create_response = client.post(
        "/expenses",
        headers=headers,
        json={
            "date": "2026-01-10",
            "amount": "90.00",
            "description": "Compra parcelada",
            "source": "Loja X",
            "type": "EXCEPTIONAL",
            "payment_method": "CREDITO",
            "installments_count": 3,
        },
    )
    expense_id = create_response.json()["id"]

    update_response = client.put(
        f"/expenses/{expense_id}",
        headers=headers,
        json={
            "date": "2026-01-10",
            "amount": "90.00",
            "currency": "USD",
            "description": "Compra parcelada",
            "source": "Loja X",
            "type": "EXCEPTIONAL",
            "payment_method": "CREDITO",
        },
    )
    assert update_response.status_code == 422


def test_create_expense_in_foreign_currency_converts_to_brl(client, make_user, monkeypatch):
    make_user(email="fx@example.com", password="Sfort3!123")
    headers = _auth_header(client, "fx@example.com", "Sfort3!123")

    from app.services import exchange_rate_service

    # 1 BRL = 0.25 USD  <=>  1 USD = 4 BRL.
    monkeypatch.setattr(
        exchange_rate_service,
        "get_rate_for_date",
        lambda target_date: {"date": target_date.isoformat(), "BRL": 1.0, "USD": 0.25, "EUR": 0.25},
    )

    response = client.post(
        "/expenses",
        headers=headers,
        json={
            "date": "2026-01-10",
            "amount": "20.00",
            "currency": "USD",
            "description": "Assinatura streaming",
            "source": "Netflix",
            "type": "FIXED",
            "payment_method": "CONTA",
            "start_date": "2026-01-10",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["currency"] == "USD"
    assert body["original_amount"] == "20.00"
    assert body["exchange_rate"] == "4.000000"
    # 20 USD at 1 USD = 4 BRL is 80 BRL.
    assert body["amount"] == "80.00"


def test_deleting_expense_cascades_installments(client, make_user):
    make_user(email="g@example.com", password="Sfort3!123")
    headers = _auth_header(client, "g@example.com", "Sfort3!123")

    create_response = client.post(
        "/expenses",
        headers=headers,
        json={
            "date": "2026-01-10",
            "amount": "90.00",
            "description": "Compra parcelada",
            "source": "Loja X",
            "type": "EXCEPTIONAL",
            "payment_method": "CREDITO",
            "installments_count": 3,
        },
    )
    expense_id = create_response.json()["id"]
    installment_id = create_response.json()["installments"][0]["id"]

    assert client.delete(f"/expenses/{expense_id}", headers=headers).status_code == 204
    assert client.get(f"/installments/{installment_id}", headers=headers).status_code == 404


def test_installment_adjustment_only_affects_targeted_installment(client, make_user):
    make_user(email="h@example.com", password="Sfort3!123")
    headers = _auth_header(client, "h@example.com", "Sfort3!123")

    create_response = client.post(
        "/expenses",
        headers=headers,
        json={
            "date": "2026-01-10",
            "amount": "90.00",
            "description": "Compra parcelada",
            "source": "Loja X",
            "type": "EXCEPTIONAL",
            "payment_method": "CREDITO",
            "installments_count": 3,
        },
    )
    installments = create_response.json()["installments"]
    january_installment_id = installments[0]["id"]

    adjustment_response = client.post(
        f"/installments/{january_installment_id}/adjustments",
        headers=headers,
        json={"amount": "5.00", "description": "Taxa"},
    )
    assert adjustment_response.status_code == 201

    updated = client.get(f"/expenses/{create_response.json()['id']}", headers=headers).json()
    updated_installments = {i["installment_number"]: i for i in updated["installments"]}

    assert updated_installments[1]["final_amount"] == "35.00"
    assert updated_installments[1]["base_amount"] == "30.00"
    assert updated_installments[2]["final_amount"] == "30.00"
    assert updated_installments[3]["final_amount"] == "30.00"
    # purchase total / count / base amounts are untouched by the adjustment
    assert updated["amount"] == "90.00"
    assert len(updated["installments"]) == 3


def test_user_cannot_access_another_users_expense_or_installments(client, make_user):
    make_user(email="owner2@example.com", password="Sfort3!123")
    make_user(email="intruder2@example.com", password="Sfort3!123")

    owner_headers = _auth_header(client, "owner2@example.com", "Sfort3!123")
    intruder_headers = _auth_header(client, "intruder2@example.com", "Sfort3!123")

    create_response = client.post(
        "/expenses",
        headers=owner_headers,
        json={
            "date": "2026-01-10",
            "amount": "90.00",
            "description": "Compra parcelada",
            "source": "Loja X",
            "type": "EXCEPTIONAL",
            "payment_method": "CREDITO",
            "installments_count": 3,
        },
    )
    expense_id = create_response.json()["id"]
    installment_id = create_response.json()["installments"][0]["id"]

    assert client.get(f"/expenses/{expense_id}", headers=intruder_headers).status_code == 404
    assert client.get(f"/installments/{installment_id}", headers=intruder_headers).status_code == 404
    assert (
        client.post(
            f"/installments/{installment_id}/adjustments",
            headers=intruder_headers,
            json={"amount": "5.00", "description": "hacked"},
        ).status_code
        == 404
    )


def test_advance_future_installment_and_undo(client, make_user):
    make_user(email="i@example.com", password="Sfort3!123")
    headers = _auth_header(client, "i@example.com", "Sfort3!123")

    create_response = _create_credit_expense_from_today(client, headers)
    installments = create_response.json()["installments"]
    next_month_installment_id = installments[1]["id"]

    advance_response = client.post(f"/installments/{next_month_installment_id}/advance", headers=headers)
    assert advance_response.status_code == 200
    today = date.today()
    assert advance_response.json()["advanced_to_year"] == today.year
    assert advance_response.json()["advanced_to_month"] == today.month

    # Already advanced - advancing again is rejected.
    assert client.post(f"/installments/{next_month_installment_id}/advance", headers=headers).status_code == 422

    undo_response = client.post(f"/installments/{next_month_installment_id}/unadvance", headers=headers)
    assert undo_response.status_code == 200
    assert undo_response.json()["advanced_to_year"] is None
    assert undo_response.json()["advanced_to_month"] is None

    # Not advanced - undoing again is rejected.
    assert client.post(f"/installments/{next_month_installment_id}/unadvance", headers=headers).status_code == 422


def test_installments_must_be_advanced_and_undone_in_order(client, make_user):
    make_user(email="k@example.com", password="Sfort3!123")
    headers = _auth_header(client, "k@example.com", "Sfort3!123")

    create_response = _create_credit_expense_from_today(client, headers)
    installments = create_response.json()["installments"]
    next_month_id = installments[1]["id"]
    month_after_id = installments[2]["id"]

    # Can't skip straight to the month-after-next installment.
    skip_response = client.post(f"/installments/{month_after_id}/advance", headers=headers)
    assert skip_response.status_code == 422

    assert client.post(f"/installments/{next_month_id}/advance", headers=headers).status_code == 200
    # Now that next-month is advanced, the one after it is fair game.
    assert client.post(f"/installments/{month_after_id}/advance", headers=headers).status_code == 200

    # Undoing must also happen newest-first - can't undo next-month while
    # month-after is still advanced.
    undo_skip_response = client.post(f"/installments/{next_month_id}/unadvance", headers=headers)
    assert undo_skip_response.status_code == 422

    assert client.post(f"/installments/{month_after_id}/unadvance", headers=headers).status_code == 200
    assert client.post(f"/installments/{next_month_id}/unadvance", headers=headers).status_code == 200


def test_cannot_advance_installment_due_this_month_or_earlier(client, make_user):
    make_user(email="j@example.com", password="Sfort3!123")
    headers = _auth_header(client, "j@example.com", "Sfort3!123")

    create_response = _create_credit_expense_from_today(client, headers)
    this_month_installment_id = create_response.json()["installments"][0]["id"]

    response = client.post(f"/installments/{this_month_installment_id}/advance", headers=headers)
    assert response.status_code == 422


def test_user_cannot_advance_another_users_installment(client, make_user):
    make_user(email="owner3@example.com", password="Sfort3!123")
    make_user(email="intruder3@example.com", password="Sfort3!123")

    owner_headers = _auth_header(client, "owner3@example.com", "Sfort3!123")
    intruder_headers = _auth_header(client, "intruder3@example.com", "Sfort3!123")

    create_response = _create_credit_expense_from_today(client, owner_headers)
    next_month_installment_id = create_response.json()["installments"][1]["id"]

    assert (
        client.post(f"/installments/{next_month_installment_id}/advance", headers=intruder_headers).status_code
        == 404
    )
