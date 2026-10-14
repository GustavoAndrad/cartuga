"""Search over the Assistente's help knowledge base (the Markdown files here).

Each `## ` heading is one section. Retrieval is plain keyword scoring (accent-folded
tokens, light suffix stripping, idf weighting) - small enough to run in-process with
no embeddings service or extra dependency, and predictable: the same question always
retrieves the same sections, which the model then quotes from.
"""

import math
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).parent
MAX_RESULTS = 3
MAX_SECTION_CHARS = 1800

STOPWORDS = set(
    "a o e de da do das dos em no na nos nas um uma uns umas para por com sem que qual quais como "
    "onde quando porque se ao aos à às ou mais menos meu minha meus minhas seu sua isso esse essa "
    "este esta é ser são foi tem ter há eu voce você sistema cartuga".split()
)


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def _stem(token: str) -> str:
    # Plural/gender endings are enough for this vocabulary ("parcelas" -> "parcel",
    # "entradas" -> "entrad", "projetado" -> "projetad").
    for suffix in ("coes", "oes", "s", "a", "o", "e"):
        if len(token) > 4 and token.endswith(suffix):
            return token[: -len(suffix)]
    return token


def _tokens(text: str) -> list[str]:
    return [_stem(t) for t in re.findall(r"[a-z0-9]+", _normalize(text)) if t not in STOPWORDS and len(t) > 1]


@lru_cache
def _sections() -> list[dict]:
    sections = []
    for path in sorted(KNOWLEDGE_DIR.glob("*.md")):
        for block in path.read_text(encoding="utf-8").split("\n## ")[1:]:
            title, _, body = block.partition("\n")
            sections.append({"title": title.strip(), "text": body.strip(), "tokens": _tokens(title + " " + title + " " + body)})
    return sections


@lru_cache
def _idf() -> dict[str, float]:
    sections = _sections()
    df: dict[str, int] = {}
    for s in sections:
        for t in set(s["tokens"]):
            df[t] = df.get(t, 0) + 1
    return {t: math.log(1 + len(sections) / n) for t, n in df.items()}


def search(query: str) -> list[dict]:
    terms = set(_tokens(query))
    idf = _idf()
    scored = []
    for s in _sections():
        score = sum(s["tokens"].count(t) ** 0.5 * idf.get(t, 0) for t in terms)
        if score > 0:
            scored.append((score, s))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [{"title": s["title"], "text": s["text"][:MAX_SECTION_CHARS]} for _, s in scored[:MAX_RESULTS]]


def section_titles() -> list[str]:
    return [s["title"] for s in _sections()]
