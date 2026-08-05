# /// script
# dependencies = ["asyncpg"]
# ///
import os
import asyncio
import asyncpg

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
    conn = await asyncpg.connect(dsn, ssl="require")
    print("Connected.")

    for stmt in STATEMENTS:
        try:
            await conn.execute(stmt)
            print(f"[OK]  {stmt[:80]}")
        except Exception as e:
            if "already exists" in str(e) or "already a member" in str(e):
                print(f"[SKIP] {stmt[:80]}")
            else:
                print(f"[ERROR] {stmt[:80]} => {e}")

    roles = await conn.fetch("SELECT unnest(enum_range(NULL::user_role))::text AS v")
    print(f"\nuser_role:    {[r['v'] for r in roles]}")
    types = await conn.fetch("SELECT unnest(enum_range(NULL::session_type))::text AS v")
    print(f"session_type: {[r['v'] for r in types]}")
    col = await conn.fetchval("SELECT column_name FROM information_schema.columns WHERE table_name='sessions' AND column_name='authorised_by'")
    print(f"sessions.authorised_by exists: {col is not None}")

    await conn.close()
    print("\nDone.")

asyncio.run(main())
