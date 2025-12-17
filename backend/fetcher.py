import os
import asyncio
import httpx
from .parser import parse_opensky


OPENSKY_URL = os.getenv("OPENSKY_URL", "https://opensky-network.org/api/states/all")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))


async def poll_loop(cache, db):
async with httpx.AsyncClient(timeout=20.0) as client:
while True:
try:
r = await client.get(OPENSKY_URL)
r.raise_for_status()
raw = r.json()
flights = parse_opensky(raw)
for f in flights:
# only update if lat/lon present
if f.get("latitude") is None or f.get("longitude") is None:
continue
# update cache
await cache.set_flight(f["icao24"], f)
# upsert and store sampled positions
await db.upsert_flight(f)
await db.insert_position(f)
except Exception as e:
print("fetcher error:", e)
await asyncio.sleep(POLL_INTERVAL)