import os

# The test client talks over plain http://testserver, and (correctly) a Secure-flagged
# cookie is never resent over http by the underlying cookie jar - same behavior a real
# browser has without HTTPS. Force it off here so refresh-cookie flows are testable,
# independent of whatever COOKIE_SECURE is set to for real dev/prod use.
os.environ["COOKIE_SECURE"] = "false"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 - ensures all models are registered on Base.metadata
from app.auth.security import hash_password
from app.database.base import Base
from app.database.session import get_db
from app.main import app as fastapi_app
from app.models.enums import UserRole
from app.models.user import User

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "mysql+pymysql://cartuga:cartuga@mysql:3306/cartuga_test"
)

_engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


@pytest.fixture(scope="session", autouse=True)
def _test_schema():
    Base.metadata.drop_all(bind=_engine)
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture(autouse=True)
def _fresh_login_limiter():
    """Login failure counts are process-wide - never carried from one test to the next."""
    from app.auth.rate_limit import login_limiter

    login_limiter.reset()
    yield
    login_limiter.reset()


@pytest.fixture()
def engine():
    """The raw test-DB engine, for tests that need real cross-connection commits (e.g.
    exercising execute_import's own transaction) rather than the db_session fixture's
    rollback-only savepoint isolation."""
    return _engine


@pytest.fixture()
def db_session():
    """Wraps each test in an outer transaction + SAVEPOINT, so that endpoint code calling
    session.commit() (normal app behavior) still gets fully rolled back afterwards.
    See: SQLAlchemy docs, "Joining a Session into an External Transaction"."""
    connection = _engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    nested = connection.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def _restart_savepoint(sess, trans):
        nonlocal nested
        if not nested.is_active:
            nested = connection.begin_nested()

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def client(db_session):
    def _get_db_override():
        yield db_session

    fastapi_app.dependency_overrides[get_db] = _get_db_override
    with TestClient(fastapi_app) as test_client:
        yield test_client
    fastapi_app.dependency_overrides.clear()


@pytest.fixture()
def make_user(db_session):
    def _make_user(
        email: str = "user@example.com",
        password: str = "S3nhaForte!",
        role: UserRole = UserRole.USER,
        name: str = "Test User",
    ) -> User:
        user = User(
            name=name,
            email=email,
            password_hash=hash_password(password),
            role=role,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    return _make_user
