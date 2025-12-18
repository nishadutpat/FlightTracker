// App.jsx – Flight Tracker (Rotating Planes + Route Display)
import { useState, useEffect } from "react";
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

/* --- Inline SVG Plane Icon (NO EXTERNAL FILES) --- */
const createPlaneIcon = (heading = 0, selected = false) =>
  L.divIcon({
    className: "plane-icon",
    html: `
      <div style="
        width: 36px;
        height: 36px;
        transform: rotate(${heading}deg);
        transition: transform 0.5s ease;
        filter: ${selected ? "drop-shadow(0 0 10px #38bdf8)" : "none"};
        pointer-events: none;
      ">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="#38bdf8">
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

/* --- Helpers --- */
const normalizeVelocity = (v) => {
  if (v == null) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  if (n > 1000) return n;
  if (n > 100) return n * 0.514444;
  return n;
};

const movePlane = (lat, lon, heading, velocity_mps, interval = 1) => {
  if (!lat || !lon || heading == null || velocity_mps == null) return [lat, lon];
  const d = velocity_mps * interval;
  const R = 6371000;
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
  const [lastUpdate, setLastUpdate] = useState(null);
  const [dark, setDark] = useState(true);

  /* --- Fetch planes --- */
  useEffect(() => {
    let mounted = true;

    const fetchPlanes = async () => {
      try {
        const res = await fetch("http://localhost:8000/live_planes");
        const data = await res.json();
        if (!mounted) return;

        if (Array.isArray(data?.planes)) {
          const mapped = data.planes
            .map((p, idx) => {
              const lat = Number(p.lat);
              const lon = Number(p.lon);
              return {
                id: p.id || `plane-${idx}`,
                callsign: p.callsign || "Unknown",
                lat,
                lon,
                altitude: p.altitude ?? null,
                velocity_mps: normalizeVelocity(p.velocity),
                heading: p.heading ?? 0,
                on_ground: !!p.on_ground,
                origin: p.origin || "—",
                destination: p.destination || "—",
                aircraft: p.aircraft || "—",
                trail: [[lat, lon]],
              };
            })
            .filter((p) => p.lat && p.lon && inIndia(p.lat, p.lon));

          setPlanes(mapped.slice(0, MAX_PLANES));
          setLastUpdate(new Date().toLocaleTimeString());
        }
      } catch (e) {
        console.error("Failed to fetch planes", e);
      }
    };

    fetchPlanes();
    const iv = setInterval(fetchPlanes, 30000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);

  /* --- Animate movement --- */
  useEffect(() => {
    const anim = setInterval(() => {
      setPlanes((prev) =>
        prev.map((p) => {
          if (!p.velocity_mps) return p;
          const [lat, lon] = movePlane(
            p.lat,
            p.lon,
            p.heading,
            p.velocity_mps
          );
          if (!inIndia(lat, lon)) return p;
          return {
            ...p,
            lat,
            lon,
            trail: [...p.trail, [lat, lon]].slice(-10),
          };
        })
      );
    }, 1000);
    return () => clearInterval(anim);
  }, []);

  /* --- Theme --- */
  const theme = dark
    ? {
        bg: "#0b1220",
        panel: "rgba(15,23,42,0.85)",
        text: "#e5e7eb",
        muted: "#9ca3af",
        accent: "#38bdf8",
        map:
          "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
      }
    : {
        bg: "#f1f5f9",
        panel: "rgba(255,255,255,0.9)",
        text: "#0f172a",
        muted: "#64748b",
        accent: "#2563eb",
        map:
          "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
      };

  return (
    <div style={{ height: "100vh", width: "100vw", background: theme.bg }}>
      {/* Header */}
      <header
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          right: 20,
          zIndex: 1200,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 22px",
          borderRadius: 18,
          backdropFilter: "blur(16px)",
          background: theme.panel,
          color: theme.text,
        }}
      >
        <strong>✈ India Flight Radar</strong>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <span>Flights: {planes.length}</span>
          <span>Updated: {lastUpdate || "—"}</span>
          <button
            onClick={() => setDark(!dark)}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              border: "none",
              background: theme.accent,
              color: "white",
              cursor: "pointer",
            }}
          >
            {dark ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      {/* Map */}
      <MapContainer center={[22.5, 79]} zoom={5} style={{ height: "100%", width: "100%" }}>
        <TileLayer url={theme.map} />

        {planes.map((p) => (
          <React.Fragment key={p.id}>
            {p.trail.length > 1 && (
              <Polyline
                positions={p.trail}
                pathOptions={{ color: theme.accent, weight: 3, opacity: 0.7 }}
              />
            )}

            <Marker
              position={[p.lat, p.lon]}
              icon={createPlaneIcon(p.heading, selectedPlane?.id === p.id)}
              eventHandlers={{ click: () => setSelectedPlane(p) }}
            >
              <Popup>
                <strong>{p.callsign}</strong>
                <div>
                  Alt: {p.altitude ? Math.round(p.altitude) + " m" : "N/A"}
                </div>
              </Popup>
            </Marker>
          </React.Fragment>
        ))}
      </MapContainer>
    </div>
  );
}
