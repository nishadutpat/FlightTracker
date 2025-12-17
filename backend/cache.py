import json
import os
import aioredis


REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")


class RedisCache:
def __init__(self, url=REDIS_URL):
self.url = url
self.redis = None


async def init(self):
self.redis = aioredis.from_url(self.url)


async def set_flight(self, icao24: str, payload: dict, expire: int = 30):
await self.redis.set(f"flight:{icao24}", json.dumps(payload), ex=expire)
# publish update for WS workers
await self.redis.publish("flights.updates", json.dumps({"type": "update", "flight": payload}))


async def get_flight(self, icao24: str):
v = await self.redis.get(f"flight:{icao24}")
return json.loads(v) if v else None


async def close(self):
if self.redis:
await self.redis.close()