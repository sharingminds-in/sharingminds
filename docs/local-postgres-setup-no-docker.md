# Local PostgreSQL Setup Guide (Without Docker)

This guide covers setting up PostgreSQL natively on your machine — no Docker required.

---

## Prerequisites

- macOS (Homebrew) or Ubuntu/Debian Linux
- Node.js 18+
- Repository cloned and `npm install` completed

---

## 1. Install PostgreSQL

### macOS (Homebrew)

```bash
brew install postgresql@16
```

Add it to your PATH (add this to `~/.zshrc` or `~/.bash_profile`):

```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
```

Reload your shell:

```bash
source ~/.zshrc
```

Start PostgreSQL and enable it on login:

```bash
brew services start postgresql@16
```

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

---

## 2. Create a User and Database

### macOS

Connect as your system user (Homebrew creates a superuser matching your macOS username):

```bash
psql postgres
```

### Ubuntu

Switch to the `postgres` system user first:

```bash
sudo -u postgres psql
```

### Inside psql — create the app user and database

```sql
CREATE USER postgres WITH PASSWORD 'postgres' SUPERUSER;
CREATE DATABASE sharing_minds_20260428 OWNER postgres;
\q
```

> If the `postgres` role already exists, skip the first line.

---

## 3. Verify the Connection

```bash
psql -U postgres -d sharing_minds_20260428 -c "SELECT version();"
```

You should see the PostgreSQL version printed. If prompted for a password, enter `postgres`.

---

## 4. Run Migrations

From the repository root:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sharing_minds_20260428" \
  npx drizzle-kit migrate
```

This applies all pending migrations from `lib/db/migrations/` to the target database.

---

## 5. Import a Production Dump

Supabase dumps include internal Supabase schemas (`auth`, `extensions`, `graphql_public`) that don't exist in plain Postgres. Use the extraction script to pull out only the public data.

### 5a. Place your dump file

Put the `.sql` dump file anywhere accessible, e.g.:

```
docker/backup_20260428.sql
```

### 5b. Extract public-schema data

Run this script from the repository root:

```bash
python3 - <<'EOF'
import re

INPUT  = "docker/backup_20260428.sql"
OUTPUT = "docker/import_public_data.sql"

with open(INPUT, "r", encoding="utf-8", errors="replace") as f:
    content = f.read()

# Find all COPY blocks for public.* tables
pattern = r"(COPY public\.\S+[^\n]*\n(?:(?!\\\.|\nCOPY ).*\n)*\\\.)"
blocks = re.findall(pattern, content, re.MULTILINE)

# Map removed enum values for mentor_content.status
def fix_content_status(block):
    if "public.mentor_content" in block.split("\n")[0]:
        return block.replace("\tPUBLISHED\t", "\tDRAFT\t")
    return block

with open(OUTPUT, "w") as out:
    out.write("SET session_replication_role = replica;\n\n")
    for block in blocks:
        out.write(fix_content_status(block))
        out.write("\n")
    out.write("\nSET session_replication_role = DEFAULT;\n")

print(f"Extracted {len(blocks)} tables → {OUTPUT}")
EOF
```

### 5c. Truncate existing data (if re-importing)

Skip this if the database is brand-new. Otherwise, clear existing rows first:

```bash
psql -U postgres -d sharing_minds_20260428 -c "
DO \$\$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END \$\$;"
```

### 5d. Import the extracted data

```bash
psql -U postgres -d sharing_minds_20260428 < docker/import_public_data.sql
```

---

## 6. Point the App at the Local Database

Edit (or create) `.env.local` in the repository root:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sharing_minds_20260428
```

Then start the dev server:

```bash
npm run dev
```

---

## Quick Reference

| Task | Command |
|---|---|
| Start Postgres (macOS) | `brew services start postgresql@16` |
| Stop Postgres (macOS) | `brew services stop postgresql@16` |
| Start Postgres (Linux) | `sudo systemctl start postgresql` |
| Connect via psql | `psql -U postgres -d sharing_minds_20260428` |
| Create database | `psql -U postgres -c "CREATE DATABASE <name>;"` |
| Run migrations | `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/<name>" npx drizzle-kit migrate` |
| Import extracted data | `psql -U postgres -d <name> < docker/import_public_data.sql` |

---

## Troubleshooting

**`psql: error: connection to server on socket failed`**
Postgres isn't running. Start it with `brew services start postgresql@16` (macOS) or `sudo systemctl start postgresql` (Linux).

**`FATAL: password authentication failed for user "postgres"`**
Your local `pg_hba.conf` may require peer/trust auth instead of password. Either update it to allow `md5`/`scram-sha-256`, or connect without a password: change `DATABASE_URL` to `postgresql://postgres@localhost:5432/<name>` (no password).

**`role "postgres" does not exist`**
Create it: `psql postgres -c "CREATE USER postgres WITH PASSWORD 'postgres' SUPERUSER;"`

**`database "sharing_minds_20260428" does not exist`**
Create it: `psql -U postgres -c "CREATE DATABASE sharing_minds_20260428;"`

**Migration fails with "relation already exists"**
All migrations are idempotent — check which migration is failing and look for a pending schema/code mismatch.

**Import fails with "invalid input value for enum"**
The dump contains an enum value removed from the schema. Add a `.replace()` line in the `fix_content_status` function in the extraction script (step 5b) for the relevant table and column.
