import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import PUBLIC_DEMO_PASSWORD, get_settings
from app.routers import (
    assistant,
    assistant_admin,
    auth,
    bank_import,
    config,
    dashboard,
    database_admin,
    entries,
    expenses,
    exports,
    installments,
    planning,
    users,
    vault,
)
from app.utils.errors import AppError

logger = logging.getLogger("cartuga")

settings = get_settings()

app = FastAPI(title="Cartuga API", version="0.1.0")

if not settings.is_local and settings.initial_admin_password == PUBLIC_DEMO_PASSWORD:
    logger.warning(
        "INITIAL_ADMIN_PASSWORD is the public demo password from the README, but CORS_ORIGINS points "
        "beyond localhost - anyone could log in as ADMIN. Set private INITIAL_ADMIN_* values."
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    # A JSON API: never sniffed as another content type, never framed, never leaks
    # the URL (which may carry ids) to other sites.
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Lets the browser read the server-chosen filename of a downloaded export.
    expose_headers=["Content-Disposition"],
)


def _error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message}})


@app.exception_handler(AppError)
async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return _error_response(exc.status_code, exc.code, exc.message)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return _error_response(exc.status_code, "HTTP_ERROR", str(exc.detail))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return _error_response(422, "VALIDATION_ERROR", "Dados inválidos na requisição.")


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error", exc_info=exc)
    return _error_response(500, "INTERNAL_ERROR", "Erro interno do servidor.")


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(config.router)
app.include_router(entries.router)
app.include_router(expenses.router)
app.include_router(installments.router)
app.include_router(dashboard.router)
app.include_router(vault.router)
app.include_router(planning.router)
app.include_router(database_admin.router)
app.include_router(bank_import.router)
app.include_router(exports.router)
app.include_router(assistant.router)
app.include_router(assistant_admin.router)
