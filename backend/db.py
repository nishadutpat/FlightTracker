class Database:
def __init__(self, dsn=DB_DSN):
self.dsn = dsn
self.pool = None


async def init(self):
self.pool = await asyncpg.create_pool(dsn=self.dsn, min_size=1, max_size=5)
await self._ensure_schema()


async def _ensure_schema(self):
async with self.pool.acquire() as conn:
await conn.execute("""
CREATE TABLE IF NOT EXISTS flights (
icao24 TEXT PRIMARY KEY,
callsign TEXT,
origin_country TEXT
);
CREATE TABLE IF NOT EXISTS positions (
id BIGSERIAL PRIMARY KEY,
icao24 TEXT REFERENCES flights(icao24),
ts TIMESTAMP WITH TIME ZONE,
latitude DOUBLE PRECISION,
longitude DOUBLE PRECISION,
altitude DOUBLE PRECISION,
speed DOUBLE PRECISION,
heading DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_positions_icao_ts ON positions(icao24, ts DESC);
""")


async def upsert_flight(self, flight: dict):
async with self.pool.acquire() as conn:
await conn.execute(
"""
INSERT INTO flights(icao24, callsign, origin_country)
VALUES($1, $2, $3)
ON CONFLICT (icao24) DO UPDATE SET callsign = EXCLUDED.callsign, origin_country = EXCLUDED.origin_country
""",
flight.get("icao24"), flight.get("callsign"), flight.get("origin_country")
)


async def insert_position(self, flight: dict):
async with self.pool.acquire() as conn:
await conn.execute(
"""
INSERT INTO positions(icao24, ts, latitude, longitude, altitude, speed, heading)
VALUES($1, to_timestamp($2), $3, $4, $5, $6, $7)
""",
flight.get("icao24"), flight.get("last_contact") or flight.get("time_position") or 0,
flight.get("latitude"), flight.get("longitude"), flight.get("baro_altitude"), flight.get("velocity"), flight.get("heading")
)


async def close(self):
if self.pool:
await self.pool.close()