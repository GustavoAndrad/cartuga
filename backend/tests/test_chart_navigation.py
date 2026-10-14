from datetime import date
from decimal import Decimal

from app.models.entry import Entry
from app.models.enums import PaymentMethod, RecurrenceType
from app.models.expense import Expense
from app.models.installment import Installment
from app.services import finance_engine as fe


def _auth_header(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _current_month() -> tuple[int, int]:
    today = date.today()
    return today.year, today.month


def _entry(user_id: int, **fields) -> Entry:
    defaults = dict(amount=Decimal("100"), description="Entrada", source="Teste", type=RecurrenceType.EXCEPTIONAL)
    return Entry(user_id=user_id, **{**defaults, **fields})


def test_range_of_user_without_data_is_just_the_current_month(db_session, make_user):
    user = make_user()

    nav = fe.get_navigable_range(db_session, user.id)

    assert (nav.first_year, nav.first_month) == _current_month()
    assert (nav.last_year, nav.last_month) == _current_month()
    assert nav.last_reason == "LAST_RECORD"


def test_range_starts_at_first_record_and_ends_at_last_contributing_month(db_session, make_user):
    user = make_user()
    year, month = _current_month()
    first = fe.shift_month(year, month, -8)
    fixed_end = fe.shift_month(year, month, 4)
    db_session.add(_entry(user.id, date=date(*first, 10)))
    db_session.add(
        Expense(
            user_id=user.id, date=date(*first, 1), amount=Decimal("50"), description="Curso", source="Escola",
            type=RecurrenceType.FIXED, payment_method=PaymentMethod.CONTA,
            start_date=date(*first, 1), end_date=date(*fixed_end, 28),
        )
    )
    db_session.commit()

    nav = fe.get_navigable_range(db_session, user.id)

    assert (nav.first_year, nav.first_month) == first
    assert (nav.last_year, nav.last_month) == fixed_end
    assert nav.last_reason == "LAST_RECORD"


def test_range_follows_the_last_installment_not_the_purchase_date(db_session, make_user):
    user = make_user()
    year, month = _current_month()
    purchase = Expense(
        user_id=user.id, date=date(year, month, 1), amount=Decimal("300"), description="TV", source="Loja",
        type=RecurrenceType.EXCEPTIONAL, payment_method=PaymentMethod.CREDITO,
    )
    db_session.add(purchase)
    db_session.flush()
    for n in range(1, 4):
        due = fe.shift_month(year, month, n)
        db_session.add(
            Installment(
                expense_id=purchase.id, installment_number=n, total_installments=3,
                due_date=date(*due, 1), base_amount=Decimal("100"),
            )
        )
    db_session.commit()

    nav = fe.get_navigable_range(db_session, user.id)

    assert (nav.last_year, nav.last_month) == fe.shift_month(year, month, 3)
    assert nav.last_reason == "LAST_RECORD"


def test_indefinite_fixed_rule_extends_range_to_the_projection_horizon(db_session, make_user):
    user = make_user()
    year, month = _current_month()
    db_session.add(_entry(user.id, type=RecurrenceType.FIXED, date=date(year, month, 1), start_date=date(year, month, 1)))
    db_session.commit()

    nav = fe.get_navigable_range(db_session, user.id)

    assert (nav.last_year, nav.last_month) == fe.shift_month(year, month, fe.MAX_HORIZON_MONTHS)
    assert nav.last_reason == "HORIZON"


def test_range_never_ends_before_the_current_month(db_session, make_user):
    user = make_user()
    year, month = _current_month()
    db_session.add(_entry(user.id, date=date(*fe.shift_month(year, month, -5), 1)))
    db_session.commit()

    nav = fe.get_navigable_range(db_session, user.id)

    assert (nav.last_year, nav.last_month) == (year, month)


def test_series_window_matches_the_default_dashboard_series(client, make_user):
    make_user(email="nav@example.com", password="Sfort3!123")
    headers = _auth_header(client, "nav@example.com", "Sfort3!123")
    year, month = _current_month()
    start = fe.shift_month(year, month, -3)
    client.post(
        "/entries",
        headers=headers,
        json={"date": date(*start, 1).isoformat(), "start_date": date(*start, 1).isoformat(),
              "amount": "100.00", "description": "Salário", "source": "Trabalho", "type": "FIXED"},
    )

    dashboard = client.get("/dashboard", headers=headers, params={"history_months": 3, "projection_months": 2}).json()
    window = client.get(
        "/dashboard/series", headers=headers, params={"from_year": start[0], "from_month": start[1], "months": 6}
    ).json()

    assert window == dashboard["time_series"]
    assert dashboard["navigable_range"]["first_year"] == start[0]
    assert dashboard["navigable_range"]["first_month"] == start[1]
    assert dashboard["navigable_range"]["last_reason"] == "HORIZON"


def test_series_window_past_the_projection_horizon_is_rejected(client, make_user):
    make_user(email="nav2@example.com", password="Sfort3!123")
    headers = _auth_header(client, "nav2@example.com", "Sfort3!123")
    year, month = _current_month()
    start = fe.shift_month(year, month, fe.MAX_HORIZON_MONTHS)

    response = client.get(
        "/dashboard/series", headers=headers, params={"from_year": start[0], "from_month": start[1], "months": 2}
    )

    assert response.status_code == 422


def test_planned_comparison_accepts_an_explicit_window(client, make_user):
    make_user(email="nav3@example.com", password="Sfort3!123")
    headers = _auth_header(client, "nav3@example.com", "Sfort3!123")
    year, month = _current_month()
    start = fe.shift_month(year, month, -2)

    response = client.get(
        "/planning/comparison", headers=headers,
        params={"from_year": start[0], "from_month": start[1], "months": 4},
    ).json()

    assert [(p["year"], p["month"]) for p in response["points"]] == [fe.shift_month(*start, n) for n in range(4)]
    assert "navigable_range" in response
