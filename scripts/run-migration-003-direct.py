# /// script
# dependencies = ["asyncpg"]
# ///
import os
import asyncio
import asyncpg

# Build connection from Supabase env vars
db_url = os.environ.get("POSTGRES_URL") or os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")

if not db_url:
    # Build from individual vars
    host = os.environ.get("SUPABASE_DB_HOST") or os.environ.get("PGHOST")
    user = os.environ.get("SUPABASE_DB_USER") or os.environ.get("PGUSER", "postgres")
    password = os.environ.get("SUPABASE_DB_PASSWORD") or os.environ.get("PGPASSWORD") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    dbname = os.environ.get("SUPABASE_DB_NAME") or os.environ.get("PGDATABASE", "postgres")
    port = os.environ.get("SUPABASE_DB_PORT") or os.environ.get("PGPORT", "5432")

    if not host:
        # Derive host from SUPABASE_URL  e.g. https://xxxxx.supabase.co
        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
        project_ref = supabase_url.replace("https://", "").replace(".supabase.co", "").split(".")[0]
        host = f"db.{project_ref}.supabase.co"
        password = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    db_url = f"postgresql://{user}:{password}@{host}:{port}/{dbname}"

STATEMENTS = [
    "ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPERVISOR'",
    "ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'UNMANNED'",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS authorised_by UUID REFERENCES shopfloor_users(id)",
    "ALTER TABLE machines ADD COLUMN IF NOT EXISTS unmanned_threshold_minutes INT NOT NULL DEFAULT 60",
]

async def main():
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    project_ref = supabase_url.replace("https://", "").split(".")[0]
    host = f"db.{project_ref}.supabase.co"
    password = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    dsn = f"postgresql://postgres:{password}@{host}:5432/postgres"

    print(f"Connecting to {host}...")
    try:
        conn = await asyncpg.connect(dsn, ssl="require")
        print("Connected.")

        for stmt in STATEMENTS:
            try:
                await conn.execute(stmt)
                print(f"[OK]  {stmt[:70]}")
            except Exception as e:
                if "already exists" in str(e) or "already a member" in str(e):
                    print(f"[SKIP already done] {stmt[:70]}")
                else:
                    print(f"[ERROR] {stmt[:70]}\n       {e}")

        # Verify
        roles = await conn.fetch("SELECT unnest(enum_range(NULL::user_role))::text AS v")
        print(f"\nuser_role:    {[r['v'] for r in roles]}")

        types = await conn.fetch("SELECT unnest(enum_range(NULL::session_type))::text AS v")
        print(f"session_type: {[r['v'] for r in types]}")

        col = await conn.fetchval("SELECT column_name FROM information_schema.columns WHERE table_name='sessions' AND column_name='authorised_by'")
        print(f"sessions.authorised_by exists: {col is not None}")

        await conn.close()
        print("\nMigration complete.")
    except Exception as e:
        print(f"[FATAL] {e}")
        print("\nAvailable env vars:")
        for k, v in os.environ.items():
            if any(x in k.upper() for x in ["SUPA", "POSTGRES", "PG", "DATABASE"]):
                print(f"  {k} = {v[:40]}...")

asyncio.run(main())
