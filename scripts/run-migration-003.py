"""
Migration 003 — Unmanned Runs
Connects directly to Supabase PostgreSQL via the DB URL derived from env vars.
"""
import os
import urllib.request
import urllib.parse
import json

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SERVICE_KEY:
    print("ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    raise SystemExit(1)

# Use Supabase REST /rest/v1/rpc is unavailable for DDL.
# Instead use the Supabase Management API's SQL execution endpoint.
# Extract project ref from URL: https://<ref>.supabase.co
project_ref = SUPABASE_URL.replace("https://", "").split(".")[0]

statements = [
    # 1. Update role check constraint
    "ALTER TABLE shopfloor_users DROP CONSTRAINT IF EXISTS shopfloor_users_role_check",
    "ALTER TABLE shopfloor_users ADD CONSTRAINT shopfloor_users_role_check CHECK (role IN ('OPERATOR', 'SETTER', 'QC', 'ADMIN', 'SUPERVISOR'))",
    # 2. Update session_type check constraint
    "ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_session_type_check",
    "ALTER TABLE sessions ADD CONSTRAINT sessions_session_type_check CHECK (session_type IN ('SETUP', 'RUN', 'UNMANNED'))",
    # 3. Add authorised_by column
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS authorised_by UUID REFERENCES shopfloor_users(id)",
    # 4. Indexes
    "CREATE INDEX IF NOT EXISTS idx_sessions_authorised_by ON sessions(authorised_by)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_session_type ON sessions(session_type)",
]

print(f"Running migration 003 against project: {project_ref}")

for i, stmt in enumerate(statements, 1):
    sql = stmt + ";"
    payload = json.dumps({"query": sql}).encode("utf-8")
    url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {SERVICE_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode()
            print(f"[{i}/{len(statements)}] OK: {stmt[:60]}...")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        # 42710 = already exists, 42P07 = duplicate index — safe to ignore
        if "already exists" in body or "42P07" in body or "42710" in body:
            print(f"[{i}/{len(statements)}] SKIP (already exists): {stmt[:60]}...")
        else:
            print(f"[{i}/{len(statements)}] ERROR: {body}")

print("\nMigration 003 complete.")
