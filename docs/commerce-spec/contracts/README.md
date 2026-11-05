# Contracts
- `API_CONTRACT.yaml`: OpenAPI **representative subset**, NOT a complete implemented API list; detailed endpoint catalog in `docs/06_API_RBAC.md`.
- `RBAC_MATRIX.csv`: desired permission matrix defaults. Existing repo only has admin/customer and 5 broad permissions; migration needed.
- `ENTITY_DICTIONARY.csv`: existing tables vs new planned tables; precise existing columns in repo `db/schema-contract.md`; planned columns in `docs/04_DATA_MODEL.md`.
- CSV files encoded UTF-8 with BOM for convenient Vietnamese Excel import; do not upload to live DB without validation.
