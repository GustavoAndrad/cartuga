import enum


class UserRole(str, enum.Enum):
    USER = "USER"
    ADMIN = "ADMIN"


class RecurrenceType(str, enum.Enum):
    FIXED = "FIXED"
    EXCEPTIONAL = "EXCEPTIONAL"


class PaymentMethod(str, enum.Enum):
    CONTA = "CONTA"
    CREDITO = "CREDITO"


class Currency(str, enum.Enum):
    BRL = "BRL"
    USD = "USD"
    EUR = "EUR"


class VaultTransactionType(str, enum.Enum):
    # Fresh money entering the vault from outside the tracked cashflow - registered as
    # an entry but excluded from every dashboard total (Entry.counts_toward_dashboard).
    DEPOSIT_FRESH = "DEPOSIT_FRESH"
    # A slice carved out of an existing entry's amount - registered as a real expense,
    # so it DOES reduce the dashboard's balance like any other spending.
    DEPOSIT_CARVE = "DEPOSIT_CARVE"
    # Money leaving the vault back into normal cashflow - registered as a real entry.
    WITHDRAWAL = "WITHDRAWAL"


class CarveMode(str, enum.Enum):
    PERCENTAGE = "PERCENTAGE"
    FIXED = "FIXED"


class OccurrenceReviewStatus(str, enum.Enum):
    # This month's occurrence happened as expected (or with an override_amount, if it
    # differed) - see EntryOccurrenceReview/ExpenseOccurrenceReview.
    CONFIRMED = "CONFIRMED"
    # This month's occurrence didn't happen - excluded from that month's calculations,
    # every other month of the same Fixed rule is unaffected.
    REJECTED = "REJECTED"


class ChatRole(str, enum.Enum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"
