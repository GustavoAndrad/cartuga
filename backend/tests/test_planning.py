from datetime import date, timedelta


def _auth_header(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _iso(d: date) -> str:
    return d.isoformat()


def test_planned_entry_counts_normally_toward_dashboard(client, make_user):
    make_user(email="a@example.com", password="Sfort3!123")
    headers = _auth_header(client, "a@example.com", "Sfort3!123")

    future = date.today() + timedelta(days=20)
    entry = client.post(
        "/entries",
        headers=headers,
        json={
            "date": _iso(future),
            "amount": "1000.00",
            "description": "Salário estimado",
            "source": "Trabalho",
            "type": "EXCEPTIONAL",
            "is_planned": True,
        },
    ).json()
    assert entry["is_planned"] is True

    month = client.get(f"/dashboard/month/{future.year}/{future.month}", headers=headers).json()
    assert month["entries_total"] == "1000.00"


def test_fixed_entry_can_be_planned(client, make_user):
    make_user(email="b@example.com", password="Sfort3!123")
    headers = _auth_header(client, "b@example.com", "Sfort3!123")

    response = client.post(
        "/entries",
        headers=headers,
        json={
            "date": "2026-01-01",
            "amount": "100.00",
            "description": "x",
            "source": "x",
            "type": "FIXED",
            "start_date": "2026-01-01",
            "is_planned": True,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["is_planned"] is True
    assert body["is_planned_since"] == date.today().isoformat()


def test_planned_expense_requires_conta_exceptional(client, make_user):
    make_user(email="c@example.com", password="Sfort3!123")
    headers = _auth_header(client, "c@example.com", "Sfort3!123")

    response = client.post(
        "/expenses",
        headers=headers,
        json={
            "date": "2026-06-01",
            "amount": "300.00",
            "description": "Notebook",
            "source": "Loja",
            "type": "EXCEPTIONAL",
            "payment_method": "CREDITO",
            "installments_count": 3,
            "is_planned": True,
        },
    )
    assert response.status_code == 422


def test_pending_review_lists_planned_records_due_soon_or_overdue(client, make_user):
    make_user(email="d@example.com", password="Sfort3!123")
    headers = _auth_header(client, "d@example.com", "Sfort3!123")

    tomorrow = date.today() + timedelta(days=1)
    far_future = date.today() + timedelta(days=30)

    due_soon = client.post(
        "/entries",
        headers=headers,
        json={
            "date": _iso(tomorrow),
            "amount": "500.00",
            "description": "Devido amanhã",
            "source": "x",
            "type": "EXCEPTIONAL",
            "is_planned": True,
        },
    ).json()

    not_due_yet = client.post(
        "/entries",
        headers=headers,
        json={
            "date": _iso(far_future),
            "amount": "200.00",
            "description": "Muito no futuro",
            "source": "x",
            "type": "EXCEPTIONAL",
            "is_planned": True,
        },
    ).json()

    pending = client.get("/planning/pending", headers=headers).json()
    ids = {item["entry"]["id"] for item in pending["entries"]}
    assert due_soon["id"] in ids
    assert not_due_yet["id"] not in ids
    assert len(pending["entries"]) + len(pending["expenses"]) == 1


def test_confirming_a_planned_entry_clears_the_flag(client, make_user):
    make_user(email="e@example.com", password="Sfort3!123")
    headers = _auth_header(client, "e@example.com", "Sfort3!123")

    tomorrow = date.today() + timedelta(days=1)
    entry = client.post(
        "/entries",
        headers=headers,
        json={
            "date": _iso(tomorrow),
            "amount": "500.00",
            "description": "Estimativa",
            "source": "x",
            "type": "EXCEPTIONAL",
            "is_planned": True,
        },
    ).json()

    confirmed = client.put(
        f"/entries/{entry['id']}",
        headers=headers,
        json={
            "date": _iso(tomorrow),
            "amount": "520.00",
            "description": "Valor real",
            "source": "x",
            "type": "EXCEPTIONAL",
            "is_planned": False,
        },
    ).json()
    assert confirmed["is_planned"] is False
    assert confirmed["amount"] == "520.00"

    pending = client.get("/planning/pending", headers=headers).json()
    assert all(item["entry"]["id"] != entry["id"] for item in pending["entries"])


def test_rejecting_a_planned_entry_deletes_it(client, make_user):
    make_user(email="f@example.com", password="Sfort3!123")
    headers = _auth_header(client, "f@example.com", "Sfort3!123")

    tomorrow = date.today() + timedelta(days=1)
    entry = client.post(
        "/entries",
        headers=headers,
        json={
            "date": _iso(tomorrow),
            "amount": "500.00",
            "description": "Não vai acontecer",
            "source": "x",
            "type": "EXCEPTIONAL",
            "is_planned": True,
        },
    ).json()

    assert client.delete(f"/entries/{entry['id']}", headers=headers).status_code == 204
    assert client.get(f"/entries/{entry['id']}", headers=headers).status_code == 404


def _make_fixed_planned_entry(client, headers, amount="1000.00", months_ago=6):
    start = date.today() - timedelta(days=months_ago * 30)
    return client.post(
        "/entries",
        headers=headers,
        json={
            "date": _iso(start),
            "amount": amount,
            "description": "Freela recorrente",
            "source": "Trabalho",
            "type": "FIXED",
            "start_date": _iso(start),
            "is_planned": True,
        },
    ).json()


def test_fixed_planned_entry_shows_current_month_as_pending(client, make_user):
    make_user(email="h@example.com", password="Sfort3!123")
    headers = _auth_header(client, "h@example.com", "Sfort3!123")

    entry = _make_fixed_planned_entry(client, headers)
    today = date.today()

    pending = client.get("/planning/pending", headers=headers).json()
    items = [item for item in pending["entries"] if item["entry"]["id"] == entry["id"]]
    # is_planned_since is stamped "today" at creation, so the backlog starts at the
    # current month - never every month back to start_date (6 "months ago" here). The
    # 1-day lookahead can also surface next month's occurrence a day early (e.g. when
    # today is the last day of the month), so allow 1 or 2 items, never more.
    assert 1 <= len(items) <= 2
    assert any(item["occurrence_year"] == today.year and item["occurrence_month"] == today.month for item in items)
    oldest_month_index = today.year * 12 + today.month
    assert all(item["occurrence_year"] * 12 + item["occurrence_month"] >= oldest_month_index for item in items)


def test_confirming_fixed_occurrence_with_override_affects_only_that_month(client, make_user):
    make_user(email="i@example.com", password="Sfort3!123")
    headers = _auth_header(client, "i@example.com", "Sfort3!123")

    entry = _make_fixed_planned_entry(client, headers, amount="1000.00")
    today = date.today()
    next_month = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)

    confirm = client.post(
        f"/entries/{entry['id']}/occurrences/{today.year}/{today.month}/confirm",
        headers=headers,
        json={"amount": "1200.00"},
    )
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "CONFIRMED"

    this_month = client.get(f"/dashboard/month/{today.year}/{today.month}", headers=headers).json()
    assert this_month["entries_total"] == "1200.00"

    other_month = client.get(f"/dashboard/month/{next_month[0]}/{next_month[1]}", headers=headers).json()
    assert other_month["entries_total"] == "1000.00"

    # The reviewed month drops out of the pending queue (a still-pending next month,
    # if the 1-day lookahead already surfaced it, is untouched by confirming this one).
    pending = client.get("/planning/pending", headers=headers).json()
    assert not any(
        item["entry"]["id"] == entry["id"]
        and item["occurrence_year"] == today.year
        and item["occurrence_month"] == today.month
        for item in pending["entries"]
    )

    # The rule itself is still Planejado - unaffected by a single month's review.
    assert client.get(f"/entries/{entry['id']}", headers=headers).json()["is_planned"] is True


def test_rejecting_fixed_occurrence_excludes_only_that_month(client, make_user):
    make_user(email="j@example.com", password="Sfort3!123")
    headers = _auth_header(client, "j@example.com", "Sfort3!123")

    entry = _make_fixed_planned_entry(client, headers, amount="1000.00")
    today = date.today()
    next_month = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)

    reject = client.post(
        f"/entries/{entry['id']}/occurrences/{today.year}/{today.month}/reject", headers=headers
    )
    assert reject.status_code == 200
    assert reject.json()["status"] == "REJECTED"

    this_month = client.get(f"/dashboard/month/{today.year}/{today.month}", headers=headers).json()
    assert float(this_month["entries_total"]) == 0

    other_month = client.get(f"/dashboard/month/{next_month[0]}/{next_month[1]}", headers=headers).json()
    assert other_month["entries_total"] == "1000.00"


def test_confirm_occurrence_rejects_non_fixed_planned_entry(client, make_user):
    make_user(email="k@example.com", password="Sfort3!123")
    headers = _auth_header(client, "k@example.com", "Sfort3!123")

    tomorrow = date.today() + timedelta(days=1)
    entry = client.post(
        "/entries",
        headers=headers,
        json={
            "date": _iso(tomorrow),
            "amount": "500.00",
            "description": "Excepcional planejada",
            "source": "x",
            "type": "EXCEPTIONAL",
            "is_planned": True,
        },
    ).json()

    response = client.post(
        f"/entries/{entry['id']}/occurrences/{tomorrow.year}/{tomorrow.month}/confirm",
        headers=headers,
        json={},
    )
    assert response.status_code == 422


def test_confirm_occurrence_rejects_month_before_review_start(client, make_user):
    make_user(email="l@example.com", password="Sfort3!123")
    headers = _auth_header(client, "l@example.com", "Sfort3!123")

    entry = _make_fixed_planned_entry(client, headers)
    past = date.today() - timedelta(days=90)

    response = client.post(
        f"/entries/{entry['id']}/occurrences/{past.year}/{past.month}/confirm", headers=headers, json={}
    )
    assert response.status_code == 422


def test_fixed_planned_expense_occurrence_flow(client, make_user):
    make_user(email="m@example.com", password="Sfort3!123")
    headers = _auth_header(client, "m@example.com", "Sfort3!123")

    start = date.today() - timedelta(days=120)
    expense = client.post(
        "/expenses",
        headers=headers,
        json={
            "date": _iso(start),
            "amount": "300.00",
            "description": "Conta de luz",
            "source": "Casa",
            "type": "FIXED",
            "payment_method": "CONTA",
            "start_date": _iso(start),
            "is_planned": True,
        },
    ).json()
    assert expense["is_planned_since"] == date.today().isoformat()

    today = date.today()
    pending = client.get("/planning/pending", headers=headers).json()
    items = [item for item in pending["expenses"] if item["expense"]["id"] == expense["id"]]
    # See test_fixed_planned_entry_shows_current_month_as_pending - 1 or 2 depending on
    # whether the 1-day lookahead already crosses into next month.
    assert 1 <= len(items) <= 2
    assert any(item["occurrence_year"] == today.year and item["occurrence_month"] == today.month for item in items)

    confirm = client.post(
        f"/expenses/{expense['id']}/occurrences/{today.year}/{today.month}/confirm",
        headers=headers,
        json={"amount": "350.00"},
    )
    assert confirm.status_code == 200

    this_month = client.get(f"/dashboard/month/{today.year}/{today.month}", headers=headers).json()
    assert this_month["expenses_total"] == "350.00"


def test_planned_comparison_excludes_all_planned_records(client, make_user):
    make_user(email="g@example.com", password="Sfort3!123")
    headers = _auth_header(client, "g@example.com", "Sfort3!123")

    today = date.today()
    client.post(
        "/entries",
        headers=headers,
        json={
            "date": _iso(today),
            "amount": "1000.00",
            "description": "Salário real",
            "source": "Trabalho",
            "type": "EXCEPTIONAL",
        },
    )
    # Guaranteed to land in the calendar month right after today's, regardless of
    # which day of the month "today" happens to be.
    future = date(today.year + 1, 1, 15) if today.month == 12 else date(today.year, today.month + 1, 15)
    client.post(
        "/entries",
        headers=headers,
        json={
            "date": _iso(future),
            "amount": "300.00",
            "description": "Bônus estimado",
            "source": "Trabalho",
            "type": "EXCEPTIONAL",
            "is_planned": True,
        },
    )

    comparison = client.get("/planning/comparison?history_months=0&projection_months=1", headers=headers).json()
    assert comparison["has_planned"] is True

    this_month = next(p for p in comparison["points"] if p["year"] == today.year and p["month"] == today.month)
    assert this_month["cumulative_with_planned"] == "1000.00"
    assert this_month["cumulative_without_planned"] == "1000.00"
    assert this_month["entries_total"] == "1000.00"
    assert float(this_month["planned_entries_total"]) == 0

    future_month = next(p for p in comparison["points"] if p["year"] == future.year and p["month"] == future.month)
    assert future_month["cumulative_with_planned"] == "1300.00"
    assert future_month["cumulative_without_planned"] == "1000.00"
    assert future_month["entries_total"] == "300.00"
    assert future_month["planned_entries_total"] == "300.00"
    assert float(future_month["expenses_total"]) == 0
    assert float(future_month["planned_expenses_total"]) == 0
