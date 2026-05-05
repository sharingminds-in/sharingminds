# Local PostgreSQL Setup Guide

This guide covers everything an engineer needs to run the app against a local PostgreSQL database — from starting containers to importing a production dump.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Node.js 18+ installed
- Repository cloned and `npm install` completed

---

## 1. Start PostgreSQL + pgAdmin

From the **repository root**, run:

```bash
docker compose -f docker/docker-compose-pg-local.yaml up -d
```

This starts:
| Service | URL | Credentials |
|---|---|---|
| PostgreSQL | `localhost:5432` | `postgres` / `postgres` |
| pgAdmin | http://localhost:5050 | `admin@example.com` / `admin` |

To stop:
```bash
docker compose -f docker/docker-compose-pg-local.yaml down
```

> **Data persistence:** Database data is stored in a named Docker volume (`sharing-minds-postgres-data`) so it survives container restarts.

---

## 2. Create a Database

The default container ships with an empty database called `sharing_minds`. To create a new one (e.g. when importing a fresh dump):

```bash
docker exec sharing-minds-postgres psql -U postgres -c "CREATE DATABASE sharing_minds_20260428;"
```

---

## 3. Run Migrations

Set `DATABASE_URL` to point at your local database and run Drizzle migrations:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sharing_minds_20260428" \
  npx drizzle-kit migrate
```

This applies all pending migrations from `lib/db/migrations/` to the target database.

---

## 4. Import a Production Dump

Supabase dumps are full `pg_dump` exports that include internal Supabase schemas (`auth`, `extensions`, `graphql_public`). Importing them directly into plain Postgres fails. Use the extraction script below to pull out only the public data.

### 4a. Place your dump file

Put the `.sql` dump file inside the `docker/` folder:

```
docker/backup_20260428.sql
```

### 4b. Extract public-schema data

Run this script from the repository root. It reads the raw dump and writes a clean import file with only `public.*` table data, mapping any removed enum values:

```bash
python3 - <<'EOF'
import re, sys

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

### 4c. Truncate existing data (if re-importing)

Skip this if the database is brand-new. Otherwise, clear existing rows first to avoid duplicate key errors:

```bash
docker exec sharing-minds-postgres psql -U postgres -d sharing_minds_20260428 -c "
DO \$\$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END \$\$;"
```

### 4d. Import the extracted data

```bash
docker exec -i sharing-minds-postgres \
  psql -U postgres -d sharing_minds_20260428 \
  < docker/import_public_data.sql
```

---

## 5. Point the App at the Local Database

Edit (or create) `.env.local` in the repository root:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sharing_minds_20260428
```

Then restart your Next.js dev server:

```bash
npm run dev
```

---

## 6. Access pgAdmin

Open http://localhost:5050 and log in with `admin@example.com` / `admin`.

Pre-configured server connections are loaded automatically:
- **sharing_minds (old)** — the original local DB
- **sharing_minds_20260428 (active)** — the current DB seeded from the latest dump

Password for both: `postgres`

---

## Quick Reference

| Task | Command |
|---|---|
| Start containers | `docker compose -f docker/docker-compose-pg-local.yaml up -d` |
| Stop containers | `docker compose -f docker/docker-compose-pg-local.yaml down` |
| View logs | `docker compose -f docker/docker-compose-pg-local.yaml logs -f` |
| Create database | `docker exec sharing-minds-postgres psql -U postgres -c "CREATE DATABASE <name>;"` |
| Run migrations | `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/<name>" npx drizzle-kit migrate` |
| psql into DB | `docker exec -it sharing-minds-postgres psql -U postgres -d <name>` |
| pgAdmin | http://localhost:5050 |

---

## Troubleshooting

**Port 5432 already in use**
Another Postgres instance is running locally. Stop it (`brew services stop postgresql`) or change the port in `docker-compose-pg-local.yaml` (`'5433:5432'`) and update `DATABASE_URL` accordingly.

**pgAdmin shows "Server not found"**
The postgres container may not be healthy yet. Wait 10–15 seconds after `up -d` and refresh.

**Migration fails with "relation already exists"**
The database was partially migrated. All migrations are idempotent — check which migration is failing and look for a pending schema/code mismatch.

**Import fails with "invalid input value for enum"**
The dump contains an enum value that was removed from the schema. Run the Python extraction script (step 4b) which handles known remappings. For new cases, add a `.replace()` line in the `fix_content_status` function for the relevant table and column.
