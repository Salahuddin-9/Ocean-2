/**
 * Ocean — Mapbox Snap Map (feature #258)
 * ----------------------------------------
 * Real vector map for the Snap Map feature using Mapbox GL JS:
 *  - story markers with preview popups,
 *  - a heat layer from /api/map/heat,
 *  - an opt-in "my location" marker.
 * Needs a Mapbox access token (VITE_MAPBOX_TOKEN or the in-app field). Without
 * one the SnapMap view keeps its lightweight canvas fallback — nothing breaks.
 */
import { useEffect, useRef, useState } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Loader2, Settings2 } from 'lucide-react';
import { toast } from './FeatureShell';

interface NearStory { id: string; userId: string; userName: string; mediaUrl: string; kind: string; lat: number; lng: number; label: string; distanceKm: number | null; at: number; viewed?: boolean }
interface MapLocation { userId: string; lat: number; lng: number; label: string }
interface HeatPoint { lat: number; lng: number; intensity: number }

interface Props {
  stories: NearStory[];
  heat: HeatPoint[];
  myLoc: MapLocation | null;
}

export default function MapboxSnapMap({ stories, heat, myLoc }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [token, setToken] = useState(() => localStorage.getItem('ocean.mapbox.token') || (import.meta as any).env?.VITE_MAPBOX_TOKEN || '');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const init = async () => {
    const t = token.trim();
    if (!t) return;
    if (!containerRef.current || mapRef.current) return;
    setPhase('loading');
    try {
      const mod: any = await import('mapbox-gl');
      const mapboxgl = mod.default || mod;
      mapboxgl.accessToken = t;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [90.35, 23.8],
        zoom: 6.2,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

      map.on('load', () => {
        // heat layer
        if (heat.length) {
          map.addSource('story-heat', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: heat.map((h) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [h.lng, h.lat] }, properties: { intensity: h.intensity } })) },
          });
          map.addLayer({ id: 'story-heat-layer', type: 'heatmap', source: 'story-heat', paint: { 'heatmap-weight': ['interpolate', ['linear'], ['get', 'intensity'], 0, 0.4, 1, 1], 'heatmap-radius': 26, 'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(236,72,153,0)', 0.35, 'rgba(236,72,153,0.45)', 0.6, 'rgba(244,114,182,0.7)', 1, 'rgba(251,146,60,0.9)'] } });
        }
        // story markers
        stories.forEach((s) => {
          const el = document.createElement('div');
          el.className = 'w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-[10px] bg-gradient-to-tr from-pink-500 via-rose-400 to-amber-400 cursor-pointer';
          el.textContent = s.userName.slice(0, 1).toUpperCase();
          const popup = new mapboxgl.Popup({ offset: 14, closeButton: false, maxWidth: '220px' }).setHTML(
            `<div style="font-family:system-ui;font-size:11px"><b>${s.userName}</b> · ${s.label || 'nearby'}<br/>${s.distanceKm !== null ? `${s.distanceKm} km away` : 'no distance'}</div><img src="${s.mediaUrl}" style="width:100%;border-radius:8px;margin-top:4px"/>`
          );
          new mapboxgl.Marker({ element: el }).setLngLat([s.lng, s.lat]).setPopup(popup).addTo(map);
        });
        // my location
        if (myLoc) {
          const el = document.createElement('div');
          el.className = 'w-5 h-5 rounded-full bg-sky-500 border-[3px] border-white shadow-xl';
          new mapboxgl.Marker({ element: el }).setLngLat([myLoc.lng, myLoc.lat]).addTo(map);
        }
        setPhase('ready');
      });
    } catch (e: any) {
      setPhase('error');
      toast(`⛔ Mapbox failed: ${e?.message || e}`);
    }
  };

  useEffect(() => {
    if (!token.trim()) return;
    init();
    return () => { try { mapRef.current?.remove(); } catch { /* noop */ } mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const save = () => {
    localStorage.setItem('ocean.mapbox.token', token.trim());
    setPhase('idle');
    toast('💾 Mapbox token saved — building the map');
  };

  if (!token.trim()) {
    return (
      <div className="rounded-xl bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 p-3">
        <p className="text-[10px] font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-1.5"><MapPin size={12} className="text-pink-600 dark:text-pink-400" /> Mapbox Snap Map</p>
        <p className="text-[8px] text-[#8a8172] mt-1 leading-relaxed">Paste a Mapbox public access token to swap the canvas map for a real vector map with story markers, heatmap and 3D terrain. Grab one free at mapbox.com → Account → Tokens.</p>
        <div className="flex gap-1.5 mt-2">
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="pk.eyJ1Ijoi…" className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[10px] font-mono outline-none" />
          <button onClick={save} className="rounded-lg bg-pink-600 hover:bg-pink-500 text-white px-2.5 text-[10px] font-bold flex items-center gap-1"><Settings2 size={10} /> Use</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-[#ebdcca] dark:border-zinc-800 relative h-[420px] bg-zinc-200 dark:bg-zinc-900">
      <div ref={containerRef} className="absolute inset-0" />
      {phase !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[10px] text-[#8a8172]">
          {phase === 'loading' ? <><Loader2 size={18} className="animate-spin text-pink-500" /> Building map…</> : <p>Map not ready.</p>}
        </div>
      )}
      <div className="absolute bottom-2 left-2 rounded-lg bg-white/90 dark:bg-zinc-900/90 px-2 py-1 text-[8px] font-mono text-[#8a8172]">
        Mapbox GL JS · {stories.length} story markers · {heat.length} heat points
      </div>
    </div>
  );
}
