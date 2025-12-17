from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import requests
import time
import math

app = FastAPI()

# ---------------- CORS ----------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- OpenSky ----------------
OPENSKY_USER = "YOUR_OPENSKY_USERNAME"
OPENSKY_PASS = "YOUR_OPENSKY_PASSWORD"

# ---------------- Cache ----------------
route_cache = {}
CACHE_TTL = 1800  # 30 minutes

# ---------------- Major Indian Airports ----------------
AIRPORTS = {
    "VABB": ("Mumbai", 19.0896, 72.8656),
    "VIDP": ("Delhi", 28.5562, 77.1000),
    "VOBL": ("Bengaluru", 13.1986, 77.7066),
    "VOMM": ("Chennai", 12.9941, 80.1709),
    "VOHS": ("Hyderabad", 17.2403, 78.4294),
    "VECC": ("Kolkata", 22.6547, 88.4467),
    "VAAH": ("Ahmedabad", 23.0772, 72.6347),
    "VAPO": ("Pune", 18.5793, 73.9089),
}


# ---------------- Utils ----------------
def haversine(lat1, lon1, lat2, lon2):
    try:
        R = 6371
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)

        a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
        return R * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))
    except Exception:
        return None


def nearest_airport(lat, lon):
    best = None
    min_dist = float("inf")

    for code, (_, alat, alon) in AIRPORTS.items():
        d = haversine(lat, lon, alat, alon)
        if d is not None and d < min_dist:
            min_dist = d
            best = code

    return best, min_dist


def safe_altitude(alt):
    try:
        return float(alt)
    except Exception:
        return None


def airport_name(icao):
    return AIRPORTS.get(icao, (icao,))[0] if icao else None


# ---------------- OpenSky Aircraft Route ----------------
def get_route_from_opensky_aircraft(icao24):
    if not icao24:
        return None, None

    now = int(time.time())

    if icao24 in route_cache:
        o, d, ts = route_cache[icao24]
        if now - ts < CACHE_TTL:
            return o, d

    try:
        r = requests.get(
            "https://opensky-network.org/api/flights/aircraft",
            params={
                "icao24": icao24.lower(),
                "begin": now - 6 * 3600,
                "end": now
            },
            auth=(OPENSKY_USER, OPENSKY_PASS),
            timeout=6
        )

        if r.status_code == 200:
            flights = r.json()
            if flights:
                f = flights[-1]
                o = f.get("estDepartureAirport")
                d = f.get("estArrivalAirport")
                route_cache[icao24] = (o, d, now)
                return o, d

    except Exception as e:
        print("OpenSky error:", e)

    route_cache[icao24] = (None, None, now)
    return None, None


# ---------------- Route Estimation (SAFE) ----------------
def estimate_route(lat, lon, altitude, heading):
    origin = dest = None

    alt = safe_altitude(altitude)
    nearest, dist = nearest_airport(lat, lon)

    # Likely origin
    if alt is not None and alt < 3000 and dist is not None and dist < 40:
        origin = nearest

    # Likely destination (simple heading logic)
    if heading is not None:
        best_diff = 360
        for code, (_, alat, alon) in AIRPORTS.items():
            try:
                bearing = math.degrees(math.atan2(
                    math.sin(math.radians(alon - lon)) * math.cos(math.radians(alat)),
                    math.cos(math.radians(lat)) * math.sin(math.radians(alat)) -
                    math.sin(math.radians(lat)) * math.cos(math.radians(alat)) *
                    math.cos(math.radians(alon - lon))
                ))
                bearing = (bearing + 360) % 360
                diff = abs(bearing - heading)

                if diff < best_diff:
                    best_diff = diff
                    dest = code
            except Exception:
                continue

    return origin, dest


# ---------------- API ----------------
@app.get("/")
def root():
    return {"status": "Backend running"}


@app.get("/live_planes")
def live_planes_india():

    try:
        resp = requests.get(
            "https://api.adsb.lol/v2/lat/22.5/lon/78.9/dist/1000",
            timeout=8
        )
        resp.raise_for_status()
        data = resp.json()

    except Exception as e:
        return {"error": str(e), "planes": []}

    planes = []

    for ac in data.get("ac", []):
        if not ac.get("lat") or not ac.get("lon"):
            continue

        lat = ac.get("lat")
        lon = ac.get("lon")
        alt = ac.get("alt_baro")
        hdg = ac.get("track")
        icao24 = ac.get("hex")

        origin, dest = get_route_from_opensky_aircraft(icao24)
        route_type = "confirmed"

        if not origin and not dest:
            origin, dest = estimate_route(lat, lon, alt, hdg)
            route_type = "estimated"

        planes.append({
            "id": icao24,
            "callsign": ac.get("flight"),
            "lat": lat,
            "lon": lon,
            "altitude": alt,
            "velocity": ac.get("gs"),
            "heading": hdg,
            "origin": airport_name(origin),
            "destination": airport_name(dest),
            "route": f"{airport_name(origin)} → {airport_name(dest)}"
                     if origin and dest else None,
            "route_type": route_type
        })

    return {
        "count": len(planes),
        "planes": planes
    }
