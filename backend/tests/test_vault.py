def _auth_header(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_entry(client, headers, amount="1000.00", date="2026-01-05", description="Salário", source="Trabalho"):
    response = client.post(
        "/entries",
        headers=headers,
        json={
            "date": date,
            "amount": amount,
            "description": description,
            "source": source,
            "type": "EXCEPTIONAL",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_deposit_fresh_creates_entry_excluded_from_dashboard(client, make_user):
    make_user(email="a@example.com", password="Sfort3!123")
    headers = _auth_header(client, "a@example.com", "Sfort3!123")

    response = client.post(
        "/vault/transactions",
        headers=headers,
        json={"type": "DEPOSIT_FRESH", "date": "2026-01-10", "amount": "500.00", "description": "Aporte inicial"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["type"] == "DEPOSIT_FRESH"
    assert body["amount"] == "500.00"
    assert body["entry"]["source"] == "Investimento"
    assert body["entry"]["counts_toward_dashboard"] is False

    summary = client.get("/vault/summary", headers=headers).json()
    assert summary["balance"] == "500.00"
    assert summary["total_deposited"] == "500.00"

    # Excluded from the dashboard entirely - doesn't show up in January's totals.
    month = client.get("/dashboard/month/2026/1", headers=headers).json()
    assert float(month["entries_total"]) == 0
    assert month["entries"] == []


def test_withdrawal_creates_entry_that_impacts_dashboard(client, make_user):
    make_user(email="b@example.com", password="Sfort3!123")
    headers = _auth_header(client, "b@example.com", "Sfort3!123")

    client.post(
        "/vault/transactions",
        headers=headers,
        json={"type": "DEPOSIT_FRESH", "date": "2026-01-01", "amount": "500.00", "description": "Aporte"},
    )

    response = client.post(
        "/vault/transactions",
        headers=headers,
        json={"type": "WITHDRAWAL", "date": "2026-01-10", "amount": "200.00", "description": "Retirada"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["entry"]["source"] == "Investimento"
    assert body["entry"]["counts_toward_dashboard"] is True

    summary = client.get("/vault/summary", headers=headers).json()
    assert summary["balance"] == "300.00"
    assert summary["total_withdrawn"] == "200.00"

    # A normal, dashboard-counted entry - the DEPOSIT_FRESH one stays excluded.
    month = client.get("/dashboard/month/2026/1", headers=headers).json()
    assert month["entries_total"] == "200.00"


def test_withdrawal_cannot_exceed_vault_balance(client, make_user):
    make_user(email="h@example.com", password="Sfort3!123")
    headers = _auth_header(client, "h@example.com", "Sfort3!123")

    client.post(
        "/vault/transactions",
        headers=headers,
        json={"type": "DEPOSIT_FRESH", "date": "2026-01-01", "amount": "100.00", "description": "Aporte"},
    )

    # Nothing was ever deposited beyond the 100.00 above - withdrawing more than that
    # would make money appear in the dashboard that was never actually set aside.
    over = client.post(
        "/vault/transactions",
        headers=headers,
        json={"type": "WITHDRAWAL", "date": "2026-01-10", "amount": "150.00", "description": "Retirada"},
    )
    assert over.status_code == 422

    exact = client.post(
        "/vault/transactions",
        headers=headers,
        json={"type": "WITHDRAWAL", "date": "2026-01-10", "amount": "100.00", "description": "Retirada"},
    )
    assert exact.status_code == 201

    summary = client.get("/vault/summary", headers=headers).json()
    assert summary["balance"] == "0.00"


def test_carve_creates_expense_and_impacts_dashboard_with_traceability(client, make_user):
    make_user(email="c@example.com", password="Sfort3!123")
    headers = _auth_header(client, "c@example.com", "Sfort3!123")

    entry = _create_entry(client, headers, amount="1000.00", date="2026-01-05")

    response = client.post(
        "/vault/transactions",
        headers=headers,
        json={
            "type": "DEPOSIT_CARVE",
            "date": "2026-01-06",
            "description": "Recorte do salário",
            "source_entry_id": entry["id"],
            "carve_mode": "PERCENTAGE",
            "carve_value": "20",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["amount"] == "200.00"
    assert body["source_entry_id"] == entry["id"]
    assert body["source_entry"]["id"] == entry["id"]
    assert body["expense"]["source"] == "Investimento"
    assert body["expense"]["amount"] == "200.00"

    summary = client.get("/vault/summary", headers=headers).json()
    assert summary["balance"] == "200.00"

    # A real expense - reduces January's balance.
    month = client.get("/dashboard/month/2026/1", headers=headers).json()
    assert month["expenses_total"] == "200.00"
    assert month["balance"] == "800.00"


def test_carve_cannot_exceed_100_percent_cumulatively(client, make_user):
    make_user(email="d@example.com", password="Sfort3!123")
    headers = _auth_header(client, "d@example.com", "Sfort3!123")

    entry = _create_entry(client, headers, amount="1000.00")

    first = client.post(
        "/vault/transactions",
        headers=headers,
        json={
            "type": "DEPOSIT_CARVE",
            "date": "2026-01-06",
            "description": "Recorte 1",
            "source_entry_id": entry["id"],
            "carve_mode": "PERCENTAGE",
            "carve_value": "70",
        },
    )
    assert first.status_code == 201

    # 70% already carved - a further 40% (280.00) would exceed the remaining 30%.
    second = client.post(
        "/vault/transactions",
        headers=headers,
        json={
            "type": "DEPOSIT_CARVE",
            "date": "2026-01-07",
            "description": "Recorte 2",
            "source_entry_id": entry["id"],
            "carve_mode": "PERCENTAGE",
            "carve_value": "40",
        },
    )
    assert second.status_code == 422

    # Exactly the remaining 30% is fine.
    third = client.post(
        "/vault/transactions",
        headers=headers,
        json={
            "type": "DEPOSIT_CARVE",
            "date": "2026-01-07",
            "description": "Recorte 2",
            "source_entry_id": entry["id"],
            "carve_mode": "FIXED",
            "carve_value": "300.00",
        },
    )
    assert third.status_code == 201


def test_carve_percentage_over_100_is_rejected(client, make_user):
    make_user(email="e@example.com", password="Sfort3!123")
    headers = _auth_header(client, "e@example.com", "Sfort3!123")

    entry = _create_entry(client, headers)
    response = client.post(
        "/vault/transactions",
        headers=headers,
        json={
            "type": "DEPOSIT_CARVE",
            "date": "2026-01-06",
            "description": "Recorte",
            "source_entry_id": entry["id"],
            "carve_mode": "PERCENTAGE",
            "carve_value": "150",
        },
    )
    assert response.status_code == 422


def test_carveable_entries_excludes_fully_carved_and_non_counted(client, make_user):
    make_user(email="f@example.com", password="Sfort3!123")
    headers = _auth_header(client, "f@example.com", "Sfort3!123")

    fully_carved = _create_entry(client, headers, amount="100.00", description="Totalmente recortada")
    partially_carved = _create_entry(client, headers, amount="500.00", description="Parcialmente recortada")
    untouched = _create_entry(client, headers, amount="300.00", description="Intacta")

    client.post(
        "/vault/transactions",
        headers=headers,
        json={
            "type": "DEPOSIT_CARVE",
            "date": "2026-01-06",
            "description": "x",
            "source_entry_id": fully_carved["id"],
            "carve_mode": "PERCENTAGE",
            "carve_value": "100",
        },
    )
    client.post(
        "/vault/transactions",
        headers=headers,
        json={
            "type": "DEPOSIT_CARVE",
            "date": "2026-01-06",
            "description": "x",
            "source_entry_id": partially_carved["id"],
            "carve_mode": "PERCENTAGE",
            "carve_value": "40",
        },
    )
    # A "guardar do zero" deposit entry - never selectable as a carve source.
    client.post(
        "/vault/transactions",
        headers=headers,
        json={"type": "DEPOSIT_FRESH", "date": "2026-01-08", "amount": "50.00", "description": "Aporte"},
    )

    carveable = client.get("/vault/carveable-entries", headers=headers).json()
    descriptions = {c["entry"]["description"]: c["remaining_amount"] for c in carveable}

    assert "Totalmente recortada" not in descriptions
    assert descriptions["Parcialmente recortada"] == "300.00"
    assert descriptions["Intacta"] == "300.00"
    assert "Aporte" not in descriptions


def test_delete_vault_transaction_removes_generated_entry(client, make_user):
    make_user(email="g@example.com", password="Sfort3!123")
    headers = _auth_header(client, "g@example.com", "Sfort3!123")

    create_response = client.post(
        "/vault/transactions",
        headers=headers,
        json={"type": "DEPOSIT_FRESH", "date": "2026-01-10", "amount": "500.00", "description": "Aporte"},
    )
    transaction = create_response.json()
    entry_id = transaction["entry_id"]

    assert client.delete(f"/vault/transactions/{transaction['id']}", headers=headers).status_code == 204
    assert client.get(f"/entries/{entry_id}", headers=headers).status_code == 404

    summary = client.get("/vault/summary", headers=headers).json()
    assert float(summary["balance"]) == 0


def test_deleting_generated_entry_directly_also_removes_vault_transaction(client, make_user):
    """Deleting the entry a DEPOSIT_FRESH/WITHDRAWAL created from the Entradas screen
    (instead of from the Cofre screen) must be equivalent to deleting the vault
    transaction itself - no orphan vault_transactions row, no stale balance."""
    make_user(email="m@example.com", password="Sfort3!123")
    headers = _auth_header(client, "m@example.com", "Sfort3!123")

    deposit = client.post(
        "/vault/transactions",
        headers=headers,
        json={"type": "DEPOSIT_FRESH", "date": "2026-01-10", "amount": "500.00", "description": "Aporte"},
    ).json()
    withdrawal = client.post(
        "/vault/transactions",
        headers=headers,
        json={"type": "WITHDRAWAL", "date": "2026-01-15", "amount": "100.00", "description": "Retirada"},
    ).json()

    assert client.delete(f"/entries/{deposit['entry_id']}", headers=headers).status_code == 204
    assert client.delete(f"/entries/{withdrawal['entry_id']}", headers=headers).status_code == 204

    remaining = client.get("/vault/transactions", headers=headers).json()
    assert remaining == []

    summary = client.get("/vault/summary", headers=headers).json()
    assert float(summary["balance"]) == 0
    assert float(summary["total_deposited"]) == 0
    assert float(summary["total_withdrawn"]) == 0


def test_deleting_generated_expense_directly_also_removes_vault_transaction(client, make_user):
    """Same as above, but for a DEPOSIT_CARVE's generated expense, deleted from the
    Saídas screen."""
    make_user(email="n@example.com", password="Sfort3!123")
    headers = _auth_header(client, "n@example.com", "Sfort3!123")

    entry = _create_entry(client, headers, amount="1000.00")
    carve = client.post(
        "/vault/transactions",
        headers=headers,
        json={
            "type": "DEPOSIT_CARVE",
            "date": "2026-01-06",
            "description": "Recorte do salário",
            "source_entry_id": entry["id"],
            "carve_mode": "PERCENTAGE",
            "carve_value": "20",
        },
    ).json()

    assert client.delete(f"/expenses/{carve['expense_id']}", headers=headers).status_code == 204

    remaining = client.get("/vault/transactions", headers=headers).json()
    assert remaining == []

    summary = client.get("/vault/summary", headers=headers).json()
    assert float(summary["balance"]) == 0

    # The source entry itself is untouched and fully carveable again.
    carveable = client.get("/vault/carveable-entries", headers=headers).json()
    assert carveable[0]["remaining_amount"] == "1000.00"


def test_user_cannot_access_another_users_vault_transactions(client, make_user):
    make_user(email="owner@example.com", password="Sfort3!123")
    make_user(email="intruder@example.com", password="Sfort3!123")

    owner_headers = _auth_header(client, "owner@example.com", "Sfort3!123")
    intruder_headers = _auth_header(client, "intruder@example.com", "Sfort3!123")

    create_response = client.post(
        "/vault/transactions",
        headers=owner_headers,
        json={"type": "DEPOSIT_FRESH", "date": "2026-01-10", "amount": "500.00", "description": "Aporte"},
    )
    transaction_id = create_response.json()["id"]

    assert client.get("/vault/transactions", headers=intruder_headers).json() == []
    assert client.delete(f"/vault/transactions/{transaction_id}", headers=intruder_headers).status_code == 404


def test_vault_endpoints_reject_unauthenticated_requests(client):
    assert client.get("/vault/summary").status_code == 401
    assert client.get("/vault/transactions").status_code == 401
    assert client.post("/vault/transactions", json={}).status_code == 401


def test_cannot_carve_from_a_fixed_entry(client, make_user):
    make_user(email="i@example.com", password="Sfort3!123")
    headers = _auth_header(client, "i@example.com", "Sfort3!123")

    fixed_entry = client.post(
        "/entries",
        headers=headers,
        json={
            "date": "2026-01-05",
            "amount": "3000.00",
            "description": "Salário",
            "source": "Trabalho",
            "type": "FIXED",
            "start_date": "2026-01-05",
        },
    ).json()

    response = client.post(
        "/vault/transactions",
        headers=headers,
        json={
            "type": "DEPOSIT_CARVE",
            "date": "2026-01-06",
            "description": "Recorte do salário",
            "source_entry_id": fixed_entry["id"],
            "carve_mode": "PERCENTAGE",
            "carve_value": "10",
        },
    )
    assert response.status_code == 422

    # It also never shows up as a pickable source in the first place.
    carveable = client.get("/vault/carveable-entries", headers=headers).json()
    assert all(c["entry"]["id"] != fixed_entry["id"] for c in carveable)


def test_vault_generated_entry_locks_amount_date_currency_type(client, make_user):
    make_user(email="j@example.com", password="Sfort3!123")
    headers = _auth_header(client, "j@example.com", "Sfort3!123")

    transaction = client.post(
        "/vault/transactions",
        headers=headers,
        json={"type": "DEPOSIT_FRESH", "date": "2026-01-10", "amount": "500.00", "description": "Aporte"},
    ).json()
    entry = transaction["entry"]
    assert entry["is_vault_locked"] is True

    base_payload = {
        "date": entry["date"],
        "amount": entry["amount"],
        "currency": entry["currency"],
        "description": entry["description"],
        "source": entry["source"],
        "type": entry["type"],
        "start_date": None,
        "end_date": None,
    }

    # Only the description stays editable.
    ok = client.put(
        f"/entries/{entry['id']}",
        headers=headers,
        json={**base_payload, "description": "Aporte renomeado"},
    )
    assert ok.status_code == 200
    assert ok.json()["description"] == "Aporte renomeado"

    # vault_transactions.description is a separate snapshot column, not a live join -
    # it must be kept in sync, or the Cofre screen would keep showing the old text.
    reloaded_transaction = client.get("/vault/transactions", headers=headers).json()[0]
    assert reloaded_transaction["description"] == "Aporte renomeado"

    # Amount, type, date and source are not - changing type to FIXED would make the
    # dashboard count this every month while the Cofre still treats it as a single
    # event, and changing source away from "Investimento" would make the Cofre badge
    # on the Entradas screen disappear from an entry that's still vault-locked.
    for bad_field, bad_value in [
        ("amount", "999.00"),
        ("type", "FIXED"),
        ("date", "2026-02-01"),
        ("source", "Outra fonte"),
    ]:
        blocked = client.put(
            f"/entries/{entry['id']}",
            headers=headers,
            json={**base_payload, bad_field: bad_value, "start_date": "2026-02-01" if bad_field == "type" else None},
        )
        assert blocked.status_code == 422, f"expected editing {bad_field} to be rejected"


def test_vault_carve_expense_locks_amount_date_currency_type(client, make_user):
    make_user(email="k@example.com", password="Sfort3!123")
    headers = _auth_header(client, "k@example.com", "Sfort3!123")

    entry = _create_entry(client, headers, amount="1000.00")
    transaction = client.post(
        "/vault/transactions",
        headers=headers,
        json={
            "type": "DEPOSIT_CARVE",
            "date": "2026-01-06",
            "description": "Recorte do salário",
            "source_entry_id": entry["id"],
            "carve_mode": "PERCENTAGE",
            "carve_value": "20",
        },
    ).json()
    expense = transaction["expense"]
    assert expense["is_vault_locked"] is True

    base_payload = {
        "date": expense["date"],
        "amount": expense["amount"],
        "currency": expense["currency"],
        "description": expense["description"],
        "source": expense["source"],
        "type": expense["type"],
        "payment_method": expense["payment_method"],
        "start_date": None,
        "end_date": None,
    }

    ok = client.put(
        f"/expenses/{expense['id']}",
        headers=headers,
        json={**base_payload, "description": "Recorte renomeado"},
    )
    assert ok.status_code == 200
    assert ok.json()["description"] == "Recorte renomeado"

    reloaded_transaction = client.get("/vault/transactions", headers=headers).json()[0]
    assert reloaded_transaction["description"] == "Recorte renomeado"

    for bad_field, bad_value in [("amount", "999.00"), ("source", "Outra fonte")]:
        blocked = client.put(
            f"/expenses/{expense['id']}",
            headers=headers,
            json={**base_payload, bad_field: bad_value},
        )
        assert blocked.status_code == 422, f"expected editing {bad_field} to be rejected"


def test_investimento_source_is_reserved_for_vault(client, make_user):
    make_user(email="l@example.com", password="Sfort3!123")
    headers = _auth_header(client, "l@example.com", "Sfort3!123")

    response = client.post(
        "/entries",
        headers=headers,
        json={
            "date": "2026-01-05",
            "amount": "100.00",
            "description": "Tentativa",
            "source": "Investimento",
            "type": "EXCEPTIONAL",
        },
    )
    assert response.status_code == 422
