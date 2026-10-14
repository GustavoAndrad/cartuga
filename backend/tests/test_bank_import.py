INTER_SAMPLE = (
    "Extrato Conta Corrente \n"
    "Conta ;102800189\n"
    "Período ;01/01/2026 a 31/01/2026\n"
    "Saldo ;1,21\n"
    "\n"
    "Data Lançamento;Histórico;Descrição;Valor;Saldo\n"
    "10/01/2026;Aplicação;Cdb Porq Obj Banco Inter S A;-500,00;0,00\n"
    "12/01/2026;Resgate;Cdb Porq Obj Banco Inter S A;100,00;100,00\n"
    "15/01/2026;Pix recebido;Fulano De Tal;250,50;350,50\n"
    "16/01/2026;Pix enviado ;Maismobi;-30,00;320,50\n"
)

NUBANK_SAMPLE = (
    "Data,Valor,Identificador,Descrição\n"
    "15/01/2026,300.00,abc-1,Transferência recebida pelo Pix - FULANO DE TAL - 111.111.111-11 - BANCO X\n"
    "16/01/2026,-45.00,abc-2,Transferência enviada pelo Pix - LOJA Y - 222.222.222-22 - BANCO Z\n"
)


def _auth_header(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _preview(client, headers, filename, content, bank):
    return client.post(
        "/bank-import/preview",
        headers=headers,
        files={"file": (filename, content, "text/csv")},
        data={"bank": bank},
    )


def test_inter_csv_preview_classifies_pix_and_vault_rows(client, make_user):
    make_user(email="inter1@example.com", password="Sfort3!123")
    headers = _auth_header(client, "inter1@example.com", "Sfort3!123")

    response = _preview(client, headers, "extrato.csv", INTER_SAMPLE.encode("utf-8"), "INTER")
    assert response.status_code == 200
    body = response.json()

    aplicacao = next(r for r in body["rows"] if r["raw"]["historico"] == "Aplicação")
    assert aplicacao["kind"] == "GUARDAR"
    assert aplicacao["amount"] == "500.00"

    resgate = next(r for r in body["rows"] if r["raw"]["historico"] == "Resgate")
    assert resgate["kind"] == "RETIRAR"
    assert resgate["amount"] == "100.00"

    pix_in = next(r for r in body["rows"] if r["raw"]["historico"] == "Pix recebido")
    assert pix_in["kind"] == "ENTRADA"
    assert pix_in["amount"] == "250.50"
    assert pix_in["description"] == "Fulano De Tal"

    pix_out = next(r for r in body["rows"] if r["raw"]["historico"].strip() == "Pix enviado")
    assert pix_out["kind"] == "SAIDA"
    assert pix_out["amount"] == "30.00"
    assert pix_out["payment_method"] == "CONTA"


def test_nubank_csv_preview_classifies_pix_rows(client, make_user):
    make_user(email="nu1@example.com", password="Sfort3!123")
    headers = _auth_header(client, "nu1@example.com", "Sfort3!123")

    response = _preview(client, headers, "extrato.csv", NUBANK_SAMPLE.encode("utf-8"), "NUBANK")
    assert response.status_code == 200
    rows = response.json()["rows"]
    assert len(rows) == 2

    received = next(r for r in rows if r["amount"] == "300.00")
    assert received["kind"] == "ENTRADA"
    assert received["description"] == "FULANO DE TAL"

    sent = next(r for r in rows if r["amount"] == "45.00")
    assert sent["kind"] == "SAIDA"
    assert sent["description"] == "LOJA Y"


def test_preview_flags_probable_duplicate(client, make_user):
    make_user(email="dup1@example.com", password="Sfort3!123")
    headers = _auth_header(client, "dup1@example.com", "Sfort3!123")

    client.post(
        "/entries",
        headers=headers,
        json={
            "date": "2026-01-15",
            "amount": "250.50",
            "description": "Fulano De Tal",
            "source": "Fulano De Tal",
            "type": "EXCEPTIONAL",
        },
    )

    response = _preview(client, headers, "extrato.csv", INTER_SAMPLE.encode("utf-8"), "INTER")
    pix_in = next(r for r in response.json()["rows"] if r["raw"]["historico"] == "Pix recebido")
    assert any("duplicata" in w.lower() for w in pix_in["warnings"])


def test_commit_creates_entries_expenses_and_vault_transactions(client, make_user):
    make_user(email="commit1@example.com", password="Sfort3!123")
    headers = _auth_header(client, "commit1@example.com", "Sfort3!123")

    rows = [
        {"kind": "GUARDAR", "date": "2026-01-10", "amount": "500.00", "description": "Aplicação no Cofre"},
        {"kind": "RETIRAR", "date": "2026-01-12", "amount": "100.00", "description": "Resgate do Cofre"},
        {
            "kind": "ENTRADA",
            "date": "2026-01-15",
            "amount": "250.50",
            "description": "Fulano De Tal",
            "source": "Fulano De Tal",
        },
        {
            "kind": "SAIDA",
            "date": "2026-01-16",
            "amount": "30.00",
            "description": "Maismobi",
            "source": "Maismobi",
            "payment_method": "CONTA",
        },
    ]

    response = client.post("/bank-import/commit", headers=headers, json={"rows": rows})
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 4
    assert body["failed"] == 0

    # GET /entries lists every entry regardless of counts_toward_dashboard - the
    # DEPOSIT_FRESH (Guardar), WITHDRAWAL (Retirar), and the Pix recebido all show up.
    assert len(client.get("/entries", headers=headers).json()) == 3
    assert len(client.get("/expenses", headers=headers).json()) == 1
    vault_summary = client.get("/vault/summary", headers=headers).json()
    assert float(vault_summary["balance"]) == 400.0


def test_commit_reorders_rows_chronologically_for_vault_balance(client, make_user):
    make_user(email="commit2@example.com", password="Sfort3!123")
    headers = _auth_header(client, "commit2@example.com", "Sfort3!123")

    # Submitted out of order (withdrawal listed first) - the earlier deposit must
    # still be applied first since its date comes first.
    rows = [
        {"kind": "RETIRAR", "date": "2026-02-10", "amount": "80.00", "description": "Resgate do Cofre"},
        {"kind": "GUARDAR", "date": "2026-02-01", "amount": "100.00", "description": "Aplicação no Cofre"},
    ]

    response = client.post("/bank-import/commit", headers=headers, json={"rows": rows})
    body = response.json()
    assert body["created"] == 2
    assert body["failed"] == 0


def test_commit_reports_error_when_withdrawal_exceeds_vault_balance(client, make_user):
    make_user(email="commit3@example.com", password="Sfort3!123")
    headers = _auth_header(client, "commit3@example.com", "Sfort3!123")

    rows = [{"kind": "RETIRAR", "date": "2026-01-01", "amount": "999.00", "description": "Resgate do Cofre"}]
    response = client.post("/bank-import/commit", headers=headers, json={"rows": rows})
    body = response.json()
    assert body["created"] == 0
    assert body["failed"] == 1
    assert "cofre" in body["results"][0]["message"].lower() or "saldo" in body["results"][0]["message"].lower()
    assert float(client.get("/vault/summary", headers=headers).json()["balance"]) == 0.0


def test_commit_rejects_reserved_investimento_source(client, make_user):
    make_user(email="commit4@example.com", password="Sfort3!123")
    headers = _auth_header(client, "commit4@example.com", "Sfort3!123")

    rows = [
        {
            "kind": "ENTRADA",
            "date": "2026-01-01",
            "amount": "100.00",
            "description": "x",
            "source": "Investimento",
        }
    ]
    response = client.post("/bank-import/commit", headers=headers, json={"rows": rows})
    body = response.json()
    assert body["created"] == 0
    assert body["failed"] == 1
    assert client.get("/entries", headers=headers).json() == []


def test_commit_reports_error_for_row_missing_required_fields(client, make_user):
    make_user(email="commit5@example.com", password="Sfort3!123")
    headers = _auth_header(client, "commit5@example.com", "Sfort3!123")

    rows = [{"kind": "ENTRADA", "date": None, "amount": None, "description": "sem data"}]
    response = client.post("/bank-import/commit", headers=headers, json={"rows": rows})
    body = response.json()
    assert body["failed"] == 1
    assert "data" in body["results"][0]["message"].lower()


def test_preview_rejects_unrecognized_header(client, make_user):
    make_user(email="badfile1@example.com", password="Sfort3!123")
    headers = _auth_header(client, "badfile1@example.com", "Sfort3!123")

    response = _preview(client, headers, "extrato.csv", b"not,a,bank,statement\n1,2,3,4", "NUBANK")
    assert response.status_code == 422
