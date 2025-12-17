// App.jsx – Flight Tracker (Rotating Planes + Route + Filters)
import { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import React from "react";
import "leaflet/dist/leaflet.css";

/* --- Disable default Leaflet pin --- */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "",
  iconUrl: "",
  shadowUrl: "",
});

/* --- Inline SVG Plane Icon --- */
const createPlaneIcon = (heading = 0, selected = false, color = "#38bdf8") =>
  L.divIcon({
    className: "plane-icon",
    html: `
      <div style="
        width: 36px;
        height: 36px;
        transform: rotate(${heading}deg);
        transition: transform 0.5s ease;
        filter: ${selected ? "drop-shadow(0 0 10px " + color + ")" : "none"};
        pointer-events: none;
      ">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="${color}">
          <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9L2 14v2l8-1v4l-2 1.5V22l3-1 3 1v-1.5L13 19v-4l8 1z"/>
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

/* --- Constants --- */
const INDIA_BOUNDS = { latMin: 6, latMax: 38, lonMin: 68, lonMax: 97 };
const MAX_PLANES = 200;

/* --- Minimal Airport Coordinate Map (can expand later) --- */
const AIRPORTS = {
  VABB: [19.0896, 72.8656],
  VIDP: [28.5562, 77.1000],
  VOBL: [13.1986, 77.7066],
  VOHS: [17.2403, 78.4294],
  VOMM: [12.9941, 80.1709],
};

/* --- Helpers --- */
const normalizeVelocity = (v) => {
  const n = Number(v);
  if (!n || isNaN(n)) return null;
  return n > 100 ? n * 0.514444 : n;
};

const movePlane = (lat, lon, heading, velocity_mps) => {
  if (!lat || !lon || !velocity_mps) return [lat, lon];
  const R = 6371000;
  const d = velocity_mps;
  const dLat = (d * Math.cos((heading * Math.PI) / 180)) / R;
  const dLon =
    (d * Math.sin((heading * Math.PI) / 180)) /
    (R * Math.cos((lat * Math.PI) / 180));
  return [lat + (dLat * 180) / Math.PI, lon + (dLon * 180) / Math.PI];
};

const inIndia = (lat, lon) =>
  lat >= INDIA_BOUNDS.latMin &&
  lat <= INDIA_BOUNDS.latMax &&
  lon >= INDIA_BOUNDS.lonMin &&
  lon <= INDIA_BOUNDS.lonMax;

/* --- Component --- */
export default function App() {
  const [planes, setPlanes] = useState([]);
  const [selectedPlane, setSelectedPlane] = useState(null);
  const [dark, setDark] = useState(true);

  /* --- Filters --- */
  const [minAlt, setMinAlt] = useState(0);
  const [airOnly, setAirOnly] = useState(false);
  const [groundOnly, setGroundOnly] = useState(false);
  const [airline, setAirline] = useState("");

  /* --- Fetch planes --- */
  useEffect(() => {
    const fetchPlanes = async () => {
      const res = await fetch("http://localhost:8000/live_planes");
      const data = await res.json();

      if (Array.isArray(data?.planes)) {
        const mapped = data.planes
          .map((p, i) => ({
            id: p.id || i,
            callsign: p.callsign || "Unknown",
            lat: Number(p.lat),
            lon: Number(p.lon),
            altitude: p.altitude ?? 0,
            velocity_mps: normalizeVelocity(p.velocity),
            heading: p.heading ?? 0,
            on_ground: !!p.on_ground,
            origin: p.origin || "—",
            destination: p.destination || "—",
            trail: [[Number(p.lat), Number(p.lon)]],
          }))
          .filter((p) => p.lat && p.lon && inIndia(p.lat, p.lon));

        setPlanes(mapped.slice(0, MAX_PLANES));
      }
    };

    fetchPlanes();
    const iv = setInterval(fetchPlanes, 30000);
    return () => clearInterval(iv);
  }, []);

  /* --- Animate movement --- */
  useEffect(() => {
    const iv = setInterval(() => {
      setPlanes((prev) =>
        prev.map((p) => {
          if (!p.velocity_mps) return p;
          const [lat, lon] = movePlane(p.lat, p.lon, p.heading, p.velocity_mps);
          return {
            ...p,
            lat,
            lon,
            trail: [...p.trail, [lat, lon]].slice(-10),
          };
        })
      );
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  /* --- Apply Filters --- */
  const filteredPlanes = useMemo(() => {
    return planes.filter((p) => {
      if (airOnly && p.on_ground) return false;
      if (groundOnly && !p.on_ground) return false;
      if (p.altitude < minAlt) return false;
      if (airline && !p.callsign.startsWith(airline)) return false;
      return true;
    });
  }, [planes, minAlt, airOnly, groundOnly, airline]);

  const theme = dark
    ? { map: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png" }
    : { map: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png" };

  /* --- Route Line --- */
  const route =
    selectedPlane &&
    AIRPORTS[selectedPlane.origin] &&
    AIRPORTS[selectedPlane.destination]
      ? [
          AIRPORTS[selectedPlane.origin],
          AIRPORTS[selectedPlane.destination],
        ]
      : null;

  return (
    <>
      {/* Filters Panel */}
      <div style={{ position: "absolute", left: 20, top: 90, zIndex: 1200 }}>
        <div style={{ background: "rgba(0,0,0,0.6)", padding: 14, borderRadius: 12 }}>
          <div>
            <label>Min Altitude</label>
            <input type="range" min="0" max="40000" onChange={(e) => setMinAlt(+e.target.value)} />
          </div>
          <div>
            <input type="checkbox" onChange={() => setAirOnly(!airOnly)} /> In Air
          </div>
          <div>
            <input type="checkbox" onChange={() => setGroundOnly(!groundOnly)} /> On Ground
          </div>
          <input placeholder="Airline (IGO)" onChange={(e) => setAirline(e.target.value)} />
        </div>
      </div>

      <MapContainer center={[22.5, 79]} zoom={5} style={{ height: "100vh" }}>
        <TileLayer url={theme.map} />

        {route && (
          <Polyline
            positions={route}
            pathOptions={{ color: "#facc15", dashArray: "6 6", weight: 3 }}
          />
        )}

        {filteredPlanes.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lon]}
            icon={createPlaneIcon(p.heading, selectedPlane?.id === p.id)}
            eventHandlers={{ click: () => setSelectedPlane(p) }}
          >
            <Popup>{p.callsign}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </>
  );
}
