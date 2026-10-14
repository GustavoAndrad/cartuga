"""Brute-force protection for POST /auth/login.

Failed attempts are counted in memory, per (client IP, e-mail) and per client IP, in
a sliding window. Over the limit, login answers 429 until the oldest failure leaves
the window - even with the right password, so guessing can't continue in parallel.
A successful login clears that (IP, e-mail) pair.

In memory is enough for this app's single backend process; several processes or
servers would need a shared store (Redis) for the counts to add up.
"""

import math
import threading
import time
from collections import defaultdict, deque

from app.utils.errors import AppError

WINDOW_SECONDS = 15 * 60
MAX_FAILURES_PER_ACCOUNT = 5  # per IP + e-mail: guessing one account's password
MAX_FAILURES_PER_IP = 20  # per IP across e-mails: spraying many accounts


class TooManyAttemptsError(AppError):
    status_code = 429
    code = "TOO_MANY_ATTEMPTS"


class LoginRateLimiter:
    def __init__(self) -> None:
        self._failures: dict[tuple, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _recent(self, key: tuple, now: float) -> deque[float]:
        times = self._failures[key]
        while times and times[0] <= now - WINDOW_SECONDS:
            times.popleft()
        return times

    def check(self, ip: str, email: str) -> None:
        now = time.monotonic()
        with self._lock:
            for key, limit in (((ip, email.lower()), MAX_FAILURES_PER_ACCOUNT), ((ip,), MAX_FAILURES_PER_IP)):
                times = self._recent(key, now)
                if len(times) >= limit:
                    minutes = max(1, math.ceil((times[0] + WINDOW_SECONDS - now) / 60))
                    raise TooManyAttemptsError(
                        f"Muitas tentativas de login sem sucesso. Tente de novo em {minutes} minuto"
                        f"{'s' if minutes > 1 else ''}."
                    )

    def failed(self, ip: str, email: str) -> None:
        now = time.monotonic()
        with self._lock:
            self._failures[(ip, email.lower())].append(now)
            self._failures[(ip,)].append(now)

    def succeeded(self, ip: str, email: str) -> None:
        with self._lock:
            self._failures.pop((ip, email.lower()), None)

    def reset(self) -> None:
        with self._lock:
            self._failures.clear()


login_limiter = LoginRateLimiter()
