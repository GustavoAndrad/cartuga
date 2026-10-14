"""Small cross-cutting constants shared by services that would otherwise need to
import each other (e.g. entry_service/expense_service checking a label that
vault_service owns) - kept here, importing nothing, to avoid circular imports."""

# Exact source label vault_service stamps on every entry/expense it generates. Reserved:
# entry_service/expense_service reject it on manually created records so the vault icon
# on the Entries/Expenses screens (driven by this same string) can't be spoofed.
VAULT_SOURCE_LABEL = "Investimento"
