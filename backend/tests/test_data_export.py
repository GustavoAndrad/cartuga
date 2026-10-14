import io
import zipfile
from datetime import date

from app.services import finance_engine as fe


def _auth_header(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _month(offset: int) -> tuple[int, int]:
    today = date.today()
    return fe.shift_month(today.year, today.month, offset)


def _config(from_offset: int, to_offset: int, datasets: list[str], fmt: str = "excel_br") -> dict:
    (fy, fm), (ty, tm) = _month(from_offset), _month(to_offset)
    return {"from_year": fy, "from_month": fm, "to_year": ty, "to_month": tm, "datasets": datasets, "format": fmt}


def _setup(client, make_user, email="exp@example.com"):
    make_user(email=email, password="Sfort3!123")
    headers = _auth_header(client, email, "Sfort3!123")
    start = date(*_month(-2), 5)
    client.post("/entries", headers=headers, json={
        "date": start.isoformat(), "start_date": start.isoformat(), "amount": "1000.00",
        "description": "Salário", "source": "Trabalho", "type": "FIXED",
    })
    client.post("/expenses", headers=headers, json={
        "date": date(*_month(0), 1).isoformat(), "amount": "300.00", "description": "Notebook",
        "source": "Loja", "type": "EXCEPTIONAL", "payment_method": "CREDITO", "installments_count": 3,
    })
    return headers


def test_options_list_datasets_and_range(client, make_user):
    headers = _setup(client, make_user)

    options = client.get("/exports/data/options", headers=headers).json()

    assert [d["key"] for d in options["datasets"]] == [
        "monthly_summary", "monthly_items", "records", "installments", "vault",
    ]
    assert (options["navigable_range"]["first_year"], options["navigable_range"]["first_month"]) == _month(-2)


def test_monthly_summary_matches_dashboard_series_including_projection(client, make_user):
    headers = _setup(client, make_user)

    preview = client.post(
        "/exports/data/preview", headers=headers, json=_config(-2, 3, ["monthly_summary"], "standard")
    ).json()["datasets"][0]
    dashboard = client.get(
        "/dashboard/series", headers=headers,
        params={"from_year": _month(-2)[0], "from_month": _month(-2)[1], "months": 6},
    ).json()

    assert preview["total_rows"] == 6
    assert [row[5] for row in preview["rows"]] == [p["cumulative_balance"] for p in dashboard]
    assert [row[6] for row in preview["rows"]] == ["não", "não", "não", "sim", "sim", "sim"]


def test_monthly_items_repeat_fixed_rules_and_place_installments_in_their_month(client, make_user):
    headers = _setup(client, make_user)

    rows = client.post(
        "/exports/data/preview", headers=headers, json=_config(0, 2, ["monthly_items"], "standard")
    ).json()["datasets"][0]

    # Salary once per month x3, plus one installment per month (the first one is due in
    # the purchase month itself).
    assert rows["total_rows"] == 6
    assert [(r[1], r[5]) for r in rows["rows"] if not r[9]] == [(str(m), "Salário") for m in (
        _month(0)[1], _month(1)[1], _month(2)[1])]
    installments = [r for r in rows["rows"] if r[9]]
    assert [(r[9], r[10]) for r in installments] == [("1/3", "100.00"), ("2/3", "100.00"), ("3/3", "100.00")]


def test_export_of_several_datasets_is_a_zip_of_excel_friendly_csvs(client, make_user):
    headers = _setup(client, make_user)

    response = client.post(
        "/exports/data", headers=headers, json=_config(-2, 1, ["monthly_summary", "installments"])
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    assert len(archive.namelist()) == 2
    summary = archive.read(next(n for n in archive.namelist() if n.startswith("resumo"))).decode("utf-8")
    assert summary.startswith("\ufeffano;mes;")
    assert ";1000,00;" in summary


def test_single_dataset_export_is_a_plain_csv(client, make_user):
    headers = _setup(client, make_user)

    response = client.post("/exports/data", headers=headers, json=_config(0, 0, ["records"], "standard"))

    assert response.headers["content-type"].startswith("text/csv")
    assert 'filename="cartuga_cadastro_de_lancamentos_' in response.headers["content-disposition"]
    assert response.content.decode("utf-8-sig").startswith("id,movimento,data,")


def test_export_only_contains_the_callers_own_records(client, make_user):
    _setup(client, make_user, email="owner@example.com")
    make_user(email="other@example.com", password="Sfort3!123")
    other = _auth_header(client, "other@example.com", "Sfort3!123")

    preview = client.post(
        "/exports/data/preview", headers=other, json=_config(-2, 2, ["records", "monthly_items"])
    ).json()

    assert [d["total_rows"] for d in preview["datasets"]] == [0, 0]


def test_invalid_periods_are_rejected(client, make_user):
    headers = _setup(client, make_user)

    reversed_period = client.post("/exports/data/preview", headers=headers, json=_config(2, 0, ["vault"]))
    past_horizon = client.post(
        "/exports/data/preview", headers=headers, json=_config(0, fe.MAX_HORIZON_MONTHS + 1, ["vault"])
    )
    no_dataset = client.post("/exports/data/preview", headers=headers, json=_config(0, 1, []))

    assert reversed_period.status_code == 422
    assert past_horizon.status_code == 422
    assert no_dataset.status_code == 422


def test_export_requires_authentication(client):
    assert client.get("/exports/data/options").status_code == 401
