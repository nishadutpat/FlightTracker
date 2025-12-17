from typing import List, Dict


def parse_opensky(raw: Dict) -> List[Dict]:
states = raw.get("states") or []
out = []
for s in states:
try:
parsed = {
"icao24": s[0],
"callsign": (s[1] or "").strip(),
"origin_country": s[2],
"time_position": s[3],
"last_contact": s[4],
"longitude": s[5],
"latitude": s[6],
"baro_altitude": s[7],
"on_ground": s[8],
"velocity": s[9],
"heading": s[10],
"vertical_rate": s[11],
}
out.append(parsed)
except Exception:
continue
return out