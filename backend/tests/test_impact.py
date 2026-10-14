def _auth_header(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _point(points, year, month):
    return next(p for p in points if p["year"] == year and p["month"] == month)


def test_exceptional_entry_impact_is_a_permanent_one_time_bump(client, make_user):
    make_user(email="a@example.com", password="Sfort3!123")
    headers = _auth_header(client, "a@example.com", "Sfort3!123")

    entry = client.post(
        "/entries",
        headers=headers,
        json={
            "date": "2026-03-10",
            "amount": "500.00",
            "description": "Bônus",
            "source": "Trabalho",
            "type": "EXCEPTIONAL",
        },
    ).json()

    response = client.get(f"/entries/{entry['id']}/impact", headers=headers)
    assert response.status_code == 200
    body = response.json()

    assert body["active_from_year"] == 2026
    assert body["active_from_month"] == 3
    assert body["active_until_year"] == 2026
    assert body["active_until_month"] == 3
    assert body["is_indefinite"] is False

    march = _point(body["points"], 2026, 3)
    assert march["direct_amount"] == "500.00"
    assert march["cumulative_impact"] == "500.00"

    # One-off entries permanently shift the cumulative trajectory forward - the impact
    # never decays, it just stops growing after its own month.
    later = _point(body["points"], 2026, 12)
    assert float(later["direct_amount"]) == 0
    assert later["cumulative_impact"] == "500.00"

    # Nothing before its own month.
    assert all(float(p["cumulative_impact"]) == 0 for p in body["points"] if (p["year"], p["month"]) < (2026, 3))


def test_fixed_entry_with_end_date_impact_plateaus_after_it_ends(client, make_user):
    make_user(email="b@example.com", password="Sfort3!123")
    headers = _auth_header(client, "b@example.com", "Sfort3!123")

    entry = client.post(
        "/entries",
        headers=headers,
        json={
            "date": "2026-01-01",
            "amount": "200.00",
            "description": "Bico temporário",
            "source": "Freela",
            "type": "FIXED",
            "start_date": "2026-01-01",
            "end_date": "2026-04-30",
        },
    ).json()

    body = client.get(f"/entries/{entry['id']}/impact", headers=headers).json()
    assert body["active_from_year"] == 2026 and body["active_from_month"] == 1
    assert body["active_until_year"] == 2026 and body["active_until_month"] == 4
    assert body["is_indefinite"] is False

    # Grows by 200 every active month...
    assert _point(body["points"], 2026, 1)["cumulative_impact"] == "200.00"
    assert _point(body["points"], 2026, 2)["cumulative_impact"] == "400.00"
    assert _point(body["points"], 2026, 3)["cumulative_impact"] == "600.00"
    assert _point(body["points"], 2026, 4)["cumulative_impact"] == "800.00"

    # ...then stops contributing but the accumulated effect persists (plateau), it
    # doesn't reset to zero once the record stops being active.
    may = _point(body["points"], 2026, 5)
    assert float(may["direct_amount"]) == 0
    assert may["cumulative_impact"] == "800.00"
    later = _point(body["points"], 2026, 12)
    assert later["cumulative_impact"] == "800.00"


def test_indefinite_fixed_entry_impact_is_capped_at_max_horizon(client, make_user):
    make_user(email="c@example.com", password="Sfort3!123")
    headers = _auth_header(client, "c@example.com", "Sfort3!123")

    entry = client.post(
        "/entries",
        headers=headers,
        json={
            "date": "2026-06-01",
            "amount": "100.00",
            "description": "Salário",
            "source": "Trabalho",
            "type": "FIXED",
            "start_date": "2026-06-01",
        },
    ).json()

    body = client.get(f"/entries/{entry['id']}/impact", headers=headers).json()
    assert body["is_indefinite"] is True
    assert body["active_until_year"] is None
    assert body["active_until_month"] is None

    last_point = body["points"][-1]
    assert (last_point["year"], last_point["month"]) == (body["horizon_year"], body["horizon_month"])
    # Still actively contributing at the very last (capped) point - never actually
    # "ends" on its own.
    assert last_point["direct_amount"] == "100.00"


def test_credit_expense_impact_spans_every_installment_month(client, make_user):
    make_user(email="d@example.com", password="Sfort3!123")
    headers = _auth_header(client, "d@example.com", "Sfort3!123")

    expense = client.post(
        "/expenses",
        headers=headers,
        json={
            "date": "2026-02-15",
            "amount": "300.00",
            "description": "Notebook",
            "source": "Loja X",
            "type": "EXCEPTIONAL",
            "payment_method": "CREDITO",
            "installments_count": 3,
        },
    ).json()

    body = client.get(f"/expenses/{expense['id']}/impact", headers=headers).json()
    assert (body["active_from_year"], body["active_from_month"]) == (2026, 2)
    assert (body["active_until_year"], body["active_until_month"]) == (2026, 4)
    assert body["is_indefinite"] is False

    # An expense reduces the balance - direct_amount/cumulative_impact are negative.
    feb = _point(body["points"], 2026, 2)
    assert float(feb["direct_amount"]) < 0
    assert float(feb["cumulative_impact"]) < 0

    apr = _point(body["points"], 2026, 4)
    assert apr["cumulative_impact"] == "-300.00"  # all 3 installments landed by then
    may = _point(body["points"], 2026, 5)
    assert float(may["direct_amount"]) == 0
    # Total impact after the last installment equals -300.00 (the full purchase).
    assert may["cumulative_impact"] == "-300.00"


def test_vault_deposit_fresh_entry_has_no_impact_endpoint(client, make_user):
    make_user(email="e@example.com", password="Sfort3!123")
    headers = _auth_header(client, "e@example.com", "Sfort3!123")

    transaction = client.post(
        "/vault/transactions",
        headers=headers,
        json={"type": "DEPOSIT_FRESH", "date": "2026-01-10", "amount": "500.00", "description": "Aporte"},
    ).json()

    response = client.get(f"/entries/{transaction['entry_id']}/impact", headers=headers)
    assert response.status_code == 422


def test_exchange_rate_for_specific_date_endpoint(client, make_user):
    make_user(email="f@example.com", password="Sfort3!123")
    headers = _auth_header(client, "f@example.com", "Sfort3!123")

    response = client.get("/config/exchange-rates/date/2026-01-15", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["base"] == "BRL"
    assert "date" in body
    assert set(body["rates"].keys()) == {"BRL", "USD", "EUR"}
    assert body["rates"]["BRL"] == 1.0
