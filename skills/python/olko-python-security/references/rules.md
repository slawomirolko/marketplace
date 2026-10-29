# Python security rules

Apply these rules to changed lines only. Read code outside the scope only to get evidence. Report each violation with its rule id.

## S - Secrets

- **S1** - Keep credentials in the root `.env` file only (repository root). Do not duplicate secrets into a Python-local `.env`.
- **S2** - A Python-local `.env` is for non-secret dev overrides only (model names, stagger seconds, etc.).
