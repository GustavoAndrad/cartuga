"""Field types shared by input schemas: lengths match the database columns, so an
oversized value is a clear 422 instead of a database error (HTTP 500)."""

from typing import Annotated
from urllib.parse import urlparse

from pydantic import AfterValidator, Field

Description = Annotated[str, Field(max_length=255)]
Source = Annotated[str, Field(max_length=150)]
PersonName = Annotated[str, Field(min_length=1, max_length=150)]
# Upper bound keeps Argon2 work per request bounded (and nobody types more).
NewPassword = Annotated[str, Field(min_length=8, max_length=128)]
Password = Annotated[str, Field(max_length=128)]


def _http_url(value: str) -> str:
    """A profile photo is an image URL shown in an <img>: only http(s), never
    javascript:, data: or file: - and nothing that isn't a URL at all."""
    if value == "":
        return value
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("A foto precisa ser um endereço que comece com http:// ou https://.")
    return value


PhotoUrl = Annotated[str, Field(max_length=500), AfterValidator(_http_url)]
