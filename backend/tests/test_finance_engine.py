from datetime import date
from decimal import Decimal

from app.models.entry import Entry
from app.models.enums import PaymentMethod, RecurrenceType
from app.models.expense import Expense
from app.models.installment import Installment
from app.models.installment_adjustment import InstallmentAdjustment
from app.services import finance_engine as fe
from app.services.installment_service import build_installment_plan


def test_exceptional_entry_only_affects_its_own_month(db_session, make_user):
    user = make_user()
    db_session.add(
        Entry(
            user_id=user.id,
            date=date(2027, 2, 20),
            amount=Decimal("20"),
            description="Bico",
            source="Freela",
            type=RecurrenceType.EXCEPTIONAL,
        )
    )
    db_session.commit()

    assert fe.get_month_summary(db_session, user.id, 2027, 1).entries_total == Decimal("0")
    assert fe.get_month_summary(db_session, user.id, 2027, 2).entries_total == Decimal("20")
    assert fe.get_month_summary(db_session, user.id, 2027, 3).entries_total == Decimal("0")


def test_fixed_entry_without_end_date_applies_indefinitely(db_session, make_user):
    user = make_user()
    db_session.add(
        Entry(
            user_id=user.id,
            date=date(2026, 1, 5),
            amount=Decimal("1800"),
            description="Salario",
            source="Trabalho",
            type=RecurrenceType.FIXED,
            start_date=date(2026, 1, 1),
        )
    )
    db_session.commit()

    assert fe.get_month_summary(db_session, user.id, 2025, 12).entries_total == Decimal("0")
    assert fe.get_month_summary(db_session, user.id, 2026, 1).entries_total == Decimal("1800")
    assert fe.get_month_summary(db_session, user.id, 2030, 6).entries_total == Decimal("1800")


def test_fixed_entry_with_end_date_stops_after_it(db_session, make_user):
    user = make_user()
    db_session.add(
        Entry(
            user_id=user.id,
            date=date(2026, 1, 1),
            amount=Decimal("100"),
            description="Bolsa",
            source="Estagio",
            type=RecurrenceType.FIXED,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 1),
        )
    )
    db_session.commit()

    assert fe.get_month_summary(db_session, user.id, 2026, 12).entries_total == Decimal("100")
    assert fe.get_month_summary(db_session, user.id, 2027, 1).entries_total == Decimal("0")


def test_fixed_expense_conta_applies_like_fixed_entry(db_session, make_user):
    user = make_user()
    db_session.add(
        Expense(
            user_id=user.id,
            date=date(2026, 1, 1),
            amount=Decimal("500"),
            description="Aluguel",
            source="Imobiliaria",
            type=RecurrenceType.FIXED,
            payment_method=PaymentMethod.CONTA,
            start_date=date(2026, 1, 1),
        )
    )
    db_session.commit()

    summary = fe.get_month_summary(db_session, user.id, 2026, 6)
    assert summary.direct_expenses_total == Decimal("500")
    assert summary.expenses_total == Decimal("500")


def test_exceptional_expense_conta_only_affects_its_own_month(db_session, make_user):
    user = make_user()
    db_session.add(
        Expense(
            user_id=user.id,
            date=date(2026, 1, 15),
            amount=Decimal("100"),
            description="Conserto",
            source="Oficina",
            type=RecurrenceType.EXCEPTIONAL,
            payment_method=PaymentMethod.CONTA,
        )
    )
    db_session.commit()

    assert fe.get_month_summary(db_session, user.id, 2026, 1).direct_expenses_total == Decimal("100")
    assert fe.get_month_summary(db_session, user.id, 2026, 2).direct_expenses_total == Decimal("0")


def test_installment_plan_90_split_3x_matches_spec_example():
    plan = build_installment_plan(date(2026, 1, 10), Decimal("90"), 3)

    assert [item.base_amount for item in plan] == [Decimal("30.00")] * 3
    assert [item.due_date for item in plan] == [
        date(2026, 1, 10),
        date(2026, 2, 10),
        date(2026, 3, 10),
    ]


def test_installment_plan_remainder_absorbed_by_last_installment():
    plan = build_installment_plan(date(2026, 1, 1), Decimal("100"), 3)

    amounts = [item.base_amount for item in plan]
    assert amounts == [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")]
    assert sum(amounts) == Decimal("100.00")


def test_installment_due_date_clamps_to_valid_day_across_months():
    plan = build_installment_plan(date(2026, 1, 31), Decimal("60"), 3)
    due_dates = [item.due_date for item in plan]

    assert due_dates[0] == date(2026, 1, 31)
    assert due_dates[1] == date(2026, 2, 28)  # 2026 is not a leap year
    assert due_dates[2] == date(2026, 3, 31)


def test_add_months_clamps_leap_year_day():
    assert fe.add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)


def test_month_summary_combines_fixed_exceptional_installments_and_adjustments(db_session, make_user):
    """Spec section 34: exercise fixed entries + exceptional entries + fixed expenses +
    exceptional expenses + installments + adjustments together in the same month."""
    user = make_user()

    db_session.add_all(
        [
            Entry(
                user_id=user.id,
                date=date(2026, 1, 5),
                amount=Decimal("1800"),
                description="Salario",
                source="Trabalho",
                type=RecurrenceType.FIXED,
                start_date=date(2026, 1, 1),
            ),
            Entry(
                user_id=user.id,
                date=date(2026, 2, 20),
                amount=Decimal("20"),
                description="Bico",
                source="Freela",
                type=RecurrenceType.EXCEPTIONAL,
            ),
            Expense(
                user_id=user.id,
                date=date(2026, 1, 1),
                amount=Decimal("500"),
                description="Aluguel",
                source="Imobiliaria",
                type=RecurrenceType.FIXED,
                payment_method=PaymentMethod.CONTA,
                start_date=date(2026, 1, 1),
            ),
            Expense(
                user_id=user.id,
                date=date(2026, 2, 15),
                amount=Decimal("100"),
                description="Conserto",
                source="Oficina",
                type=RecurrenceType.EXCEPTIONAL,
                payment_method=PaymentMethod.CONTA,
            ),
        ]
    )
    db_session.commit()

    credit_expense = Expense(
        user_id=user.id,
        date=date(2026, 1, 10),
        amount=Decimal("90"),
        description="Compra parcelada",
        source="Loja X",
        type=RecurrenceType.EXCEPTIONAL,
        payment_method=PaymentMethod.CREDITO,
    )
    db_session.add(credit_expense)
    db_session.commit()

    plan = build_installment_plan(date(2026, 1, 10), Decimal("90"), 3)
    installments = [
        Installment(
            expense_id=credit_expense.id,
            installment_number=item.installment_number,
            total_installments=item.total_installments,
            due_date=item.due_date,
            base_amount=item.base_amount,
        )
        for item in plan
    ]
    db_session.add_all(installments)
    db_session.commit()

    db_session.add(
        InstallmentAdjustment(installment_id=installments[1].id, amount=Decimal("5"), description="Taxa")
    )
    db_session.commit()

    # February: 1800 (fixed entry) + 20 (exceptional entry)
    #         - 500 (fixed expense) - 100 (exceptional expense) - 35 (installment 2 + R$5 fee)
    february = fe.get_month_summary(db_session, user.id, 2026, 2)
    assert february.entries_total == Decimal("1820")
    assert february.direct_expenses_total == Decimal("600")
    assert february.installments_total == Decimal("35")
    assert february.balance == Decimal("1185")

    # January and March installments are untouched by February's adjustment.
    january = fe.get_month_summary(db_session, user.id, 2026, 1)
    assert january.installments_total == Decimal("30")
    march = fe.get_month_summary(db_session, user.id, 2026, 3)
    assert march.installments_total == Decimal("30")


def test_advancing_a_future_installment_moves_its_total_to_the_current_month(db_session, make_user):
    """Mirrors the exact example from the feature request: 3 installments of R$10 due
    this/next/the-month-after. Advancing the one due next month moves its R$10 into
    the current month's total, leaving next month at R$0 and the following month
    untouched at R$10."""
    user = make_user()
    today = date.today()

    expense = Expense(
        user_id=user.id,
        date=today,
        amount=Decimal("30"),
        description="Compra parcelada",
        source="Loja X",
        type=RecurrenceType.EXCEPTIONAL,
        payment_method=PaymentMethod.CREDITO,
    )
    db_session.add(expense)
    db_session.commit()

    plan = build_installment_plan(today, Decimal("30"), 3)
    installments = [
        Installment(
            expense_id=expense.id,
            installment_number=item.installment_number,
            total_installments=item.total_installments,
            due_date=item.due_date,
            base_amount=item.base_amount,
        )
        for item in plan
    ]
    db_session.add_all(installments)
    db_session.commit()

    current_year, current_month = today.year, today.month
    next_month = fe.add_months(today, 1)
    month_after = fe.add_months(today, 2)

    # Before advancing: a plain 10/10/10 split across the three months.
    assert fe.get_month_summary(db_session, user.id, current_year, current_month).installments_total == Decimal("10")
    assert fe.get_month_summary(db_session, user.id, next_month.year, next_month.month).installments_total == Decimal("10")
    assert fe.get_month_summary(db_session, user.id, month_after.year, month_after.month).installments_total == Decimal("10")

    installments[1].advanced_to_year = current_year
    installments[1].advanced_to_month = current_month
    db_session.commit()

    assert fe.get_month_summary(db_session, user.id, current_year, current_month).installments_total == Decimal("20")
    assert fe.get_month_summary(db_session, user.id, next_month.year, next_month.month).installments_total == Decimal("0")
    assert fe.get_month_summary(db_session, user.id, month_after.year, month_after.month).installments_total == Decimal("10")


def test_balance_series_accumulates_from_earliest_data_month(db_session, make_user):
    user = make_user()
    db_session.add(
        Entry(
            user_id=user.id,
            date=date(2026, 1, 1),
            amount=Decimal("100"),
            description="Salario",
            source="Trabalho",
            type=RecurrenceType.FIXED,
            start_date=date(2026, 1, 1),
        )
    )
    db_session.commit()

    series = fe.get_balance_series(db_session, user.id, 2026, 3, 2026, 5)
    by_month = {(p.year, p.month): p for p in series}

    # Even though the series was requested starting in March, the cumulative balance
    # must include January and February (spec section 9: "saldo acumulado... considera
    # os meses anteriores").
    assert by_month[(2026, 3)].cumulative_balance == Decimal("300")
    assert by_month[(2026, 4)].cumulative_balance == Decimal("400")
    assert by_month[(2026, 5)].cumulative_balance == Decimal("500")
    assert (2026, 1) not in by_month  # excluded from output, but still counted


def test_projection_extends_fixed_entries_into_future_months(db_session, make_user):
    user = make_user()
    db_session.add(
        Entry(
            user_id=user.id,
            date=date(2026, 1, 1),
            amount=Decimal("1000"),
            description="Salario",
            source="Trabalho",
            type=RecurrenceType.FIXED,
            start_date=date(2026, 1, 1),
        )
    )
    db_session.commit()

    from_y, from_m, to_y, to_m = fe.default_projection_range(months_ahead=6)
    assert fe.month_index(to_y, to_m) - fe.month_index(from_y, from_m) == 6

    far_future_summary = fe.get_month_summary(db_session, user.id, to_y, to_m)
    assert far_future_summary.entries_total == Decimal("1000")
