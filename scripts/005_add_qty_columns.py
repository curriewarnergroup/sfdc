import os
import requests

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not url or not key:
    print("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    exit(1)

# Use the Supabase SQL endpoint via the REST API (postgres functions)
# We'll POST raw SQL via the pg_dump compatible endpoint
sql = """
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS qty_to_make integer DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS qty_made integer DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS qty_scrapped integer DEFAULT 0;
"""

# Try via the Supabase SQL API (available in all Supabase projects)
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
}

# POST to the SQL endpoint
resp = requests.post(
    f"{url}/rest/v1/rpc/exec_sql",
    headers=headers,
    json={"query": sql},
)

if resp.status_code == 200:
    print("Columns added successfully via exec_sql")
else:
    # Try via the Supabase pgrest SQL endpoint
    resp2 = requests.post(
        f"{url}/pg",
        headers=headers,
        json={"query": sql},
    )
    print(f"exec_sql failed: {resp.text}")
    print(f"pg endpoint: {resp2.status_code} {resp2.text}")
    print()
    print("Please run this SQL in your Supabase dashboard > SQL Editor:")
    print(sql)
