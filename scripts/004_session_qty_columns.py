import os
import urllib.request
import json

url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

sql = """
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS qty_to_make integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_made integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_scrapped integer DEFAULT 0;
"""

req = urllib.request.Request(
    f"{url}/rest/v1/rpc/exec_sql",
    data=json.dumps({"query": sql}).encode(),
    headers={
        "Content-Type": "application/json",
        "apikey": key,
        "Authorization": f"Bearer {key}",
    },
    method="POST",
)

try:
    with urllib.request.urlopen(req) as resp:
        print("Done:", resp.read().decode())
except urllib.error.HTTPError as e:
    body = e.read().decode()
    # Supabase doesn't expose exec_sql by default — use the pg REST approach
    print("RPC not available, columns will be added via app startup migration")
    print("Error:", body)

# Verify columns exist by querying sessions
req2 = urllib.request.Request(
    f"{url}/rest/v1/sessions?select=qty_to_make,qty_made,qty_scrapped&limit=1",
    headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
    },
    method="GET",
)
try:
    with urllib.request.urlopen(req2) as resp:
        print("Columns verified - sessions query succeeded:", resp.read().decode()[:100])
except urllib.error.HTTPError as e:
    print("Columns missing - need manual migration:", e.read().decode()[:200])
