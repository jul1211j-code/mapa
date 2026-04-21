import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, CircleMarker, useMap, useMapEvents, Popup } from 'react-leaflet';
import { useGeolocation } from '../../hooks/useGeolocation';
import { supabase } from '../../utils/supabaseClient';
import { 
  MousePointer2, Trash2, Check, X, 
  Navigation, Square, Download, Globe, MapPin, 
  Plus, Sparkles, Crosshair, Info
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const COLOR_PALETTE = [
  { name: 'Rojo', hex: '#ef4444', fillOpacity: 0.35, strokeOpacity: 0.9 },
  { name: 'Azul', hex: '#3b82f6', fillOpacity: 0.35, strokeOpacity: 0.9 },
  { name: 'Verde', hex: '#22c55e', fillOpacity: 0.35, strokeOpacity: 0.9 },
  { name: 'Naranja', hex: '#f59e0b', fillOpacity: 0.35, strokeOpacity: 0.9 },
];

const MARKER_COLORS = [
  '#06b6d4', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444'
];

// ===== POPUP HOLOGRÁFICO CON HOVER =====
const HolographicPopup = ({ marker }) => {
  return (
    <div className="holographic-tooltip min-w-[280px] max-w-[320px]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-cyan-500/30">
        <div 
          className="w-3 h-3 rounded-full animate-pulse"
          style={{ backgroundColor: marker.color, boxShadow: `0 0 10px ${marker.color}` }}
        />
        <h3 className="text-sm font-bold text-cyan-50 font-mono tracking-wider uppercase">
          {marker.name}
        </h3>
      </div>

      {/* Descripción con efecto hover */}
      <div className="group/description relative">
        <div className="flex items-center gap-2 text-cyan-400/60 text-xs font-mono mb-1">
          <Info className="w-3 h-3" />
          <span>DESCRIPCIÓN</span>
        </div>
        
        <p className="text-sm text-cyan-100 leading-relaxed pr-1 hologram-scroll max-h-32 overflow-y-auto">
          {marker.description || 'Sin descripción disponible.'}
        </p>

        {/* Efecto hover: línea de scan que se ilumina */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/0 to-transparent group-hover/description:via-cyan-500/80 transition-all duration-700" />
      </div>

      {/* Footer con coords */}
      <div className="mt-3 pt-2 border-t border-cyan-500/20 grid grid-cols-2 gap-2 text-[10px] font-mono text-cyan-500/60">
        <div>
          <span className="block text-cyan-500/40">LAT</span>
          {marker.lat?.toFixed(6)}
        </div>
        <div>
          <span className="block text-cyan-500/40">LNG</span>
          {marker.lng?.toFixed(6)}
        </div>
      </div>

      {/* Fecha */}
      <div className="mt-2 text-[9px] text-cyan-600/50 font-mono text-right">
        {new Date(marker.created_at).toLocaleString()}
      </div>
    </div>
  );
};

// ===== MARCADOR CUSTOM CON POPUP NATIVO =====
const CustomMarker = ({ marker, onDelete }) => {
  const customIcon = L.divIcon({
    className: 'custom-marker',
    html: `
      <div class="marker-pin-container">
        <div class="marker-pin" style="--marker-color: ${marker.color}"></div>
        <div class="marker-pulse" style="--marker-color: ${marker.color}"></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
  });

  return (
    <Marker position={[marker.lat, marker.lng]} icon={customIcon}>
      <Popup 
        className="holographic-popup"
        closeButton={false}
        autoPan={true}
        autoPanPadding={[50, 50]}
      >
        <HolographicPopup marker={marker} />
      </Popup>
    </Marker>
  );
};

// ===== HANDLER DE DIBUJO =====
const DrawingHandler = ({ mode, onPointAdd, points, onFinish, onCancel, onMapClick }) => {
  const map = useMap();
  
  useMapEvents({
    click(e) {
      if (mode === 'area') {
        onPointAdd([e.latlng.lat, e.latlng.lng]);
      } else if (mode === 'marker') {
        onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
    dblclick(e) {
      if (mode === 'area' && points.length >= 3) {
        e.originalEvent.stopPropagation();
        onFinish();
      }
    }
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    if (mode) {
      window.addEventListener('keydown', handleKeyDown);
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.getContainer().style.cursor = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode, map, onCancel]);

  return null;
};

const DrawingPreview = ({ points, color, map }) => {
  useEffect(() => {
    if (points.length < 2 || !map) return;
    const polyline = L.polyline(points, { color, weight: 3, opacity: 0.7, dashArray: '5, 10' }).addTo(map);
    const markers = points.map((point, i) => 
      L.circleMarker(point, { radius: 6, fillColor: color, color: '#fff', weight: 2, opacity: 1, fillOpacity: 1 })
        .addTo(map).bindPopup(`Punto ${i + 1}`)
    );
    return () => { map.removeLayer(polyline); markers.forEach(m => map.removeLayer(m)); };
  }, [points, color, map]);
  return null;
};

// ===== FORMULARIO NUEVO MARCADOR =====
const MarkerFormModal = ({ position, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(MARKER_COLORS[0]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim(), color, lat: position.lat, lng: position.lng });
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div 
        className="hologram-card relative w-full max-w-sm rounded-2xl p-6 text-cyan-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-400 rounded-tl-lg" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-400 rounded-tr-lg" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-400 rounded-bl-lg" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-400 rounded-br-lg" />

        <h2 className="text-lg font-bold tracking-wider uppercase mb-4 flex items-center gap-2 font-mono">
          <Sparkles className="w-5 h-5 text-cyan-400" />
          NUEVO MARCADOR
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          <div>
            <label className="text-[10px] text-cyan-400 uppercase tracking-widest block mb-1 font-mono">Nombre del lugar</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Plaza Central"
              className="w-full bg-cyan-950/30 border border-cyan-500/30 rounded-lg px-3 py-2 text-sm text-cyan-100 placeholder-cyan-700 focus:outline-none focus:border-cyan-400 font-mono"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[10px] text-cyan-400 uppercase tracking-widest block mb-1 font-mono">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe este lugar..."
              rows={3}
              className="w-full bg-cyan-950/30 border border-cyan-500/30 rounded-lg px-3 py-2 text-sm text-cyan-100 placeholder-cyan-700 focus:outline-none focus:border-cyan-400 resize-none font-mono"
            />
          </div>

          <div>
            <label className="text-[10px] text-cyan-400 uppercase tracking-widest block mb-2 font-mono">Color</label>
            <div className="flex gap-2">
              {MARKER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  style={{ backgroundColor: c, boxShadow: color === c ? `0 0 15px ${c}` : 'none' }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 rounded-lg bg-cyan-950/30 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/30 transition-all text-xs font-mono"
            >
              CANCELAR
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30 transition-all text-xs font-mono flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              GUARDAR
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ===== COMPONENTE PRINCIPAL =====
const MapComponent = () => {
  const { position, error, loading } = useGeolocation();
  const [mapInstance, setMapInstance] = useState(null);
  
  const [mode, setMode] = useState(null);
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[0]);
  
  const [areas, setAreas] = useState([]);
  const [drawingPoints, setDrawingPoints] = useState([]);
  
  const [markers, setMarkers] = useState([]);
  const [showMarkerForm, setShowMarkerForm] = useState(false);
  const [pendingMarkerPos, setPendingMarkerPos] = useState(null);
  
  const [showDataList, setShowDataList] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);

  // REFS para suscripciones (evita recreaciones)
  const areasSubscriptionRef = useRef(null);
  const markersSubscriptionRef = useRef(null);

  // ===== CARGAR DATOS INICIALES =====
  useEffect(() => {
    const loadData = async () => {
      const [{ data: areasData, error: areasError }, { data: markersData, error: markersError }] = await Promise.all([
        supabase.from('areas').select('*').order('created_at', { ascending: false }),
        supabase.from('markers').select('*').order('created_at', { ascending: false }),
      ]);
      
      if (areasError) console.error('Error áreas:', areasError);
      else if (areasData) setAreas(areasData);
      
      if (markersError) console.error('Error marcadores:', markersError);
      else if (markersData) setMarkers(markersData);
      
      setIsSyncing(false);
    };
    
    loadData();
  }, []);

  // ===== SUSCRIPCIONES EN TIEMPO REAL (CORREGIDO) =====
  useEffect(() => {
    // Limpiar suscripciones previas
    if (areasSubscriptionRef.current) {
      supabase.removeChannel(areasSubscriptionRef.current);
    }
    if (markersSubscriptionRef.current) {
      supabase.removeChannel(markersSubscriptionRef.current);
    }

    // Nueva suscripción para áreas
    areasSubscriptionRef.current = supabase
      .channel('areas-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'areas' },
        (payload) => {
          console.log('Área cambio:', payload);
          if (payload.eventType === 'INSERT') {
            setAreas(prev => {
              // Evitar duplicados
              if (prev.find(a => a.id === payload.new.id)) return prev;
              return [payload.new, ...prev];
            });
          } else if (payload.eventType === 'DELETE') {
            setAreas(prev => prev.filter(a => a.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setAreas(prev => prev.map(a => a.id === payload.new.id ? payload.new : a));
          }
        }
      )
      .subscribe((status) => {
        console.log('Suscripción áreas:', status);
      });

    // Nueva suscripción para marcadores
    markersSubscriptionRef.current = supabase
      .channel('markers-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'markers' },
        (payload) => {
          console.log('Marcador cambio:', payload);
          if (payload.eventType === 'INSERT') {
            setMarkers(prev => {
              if (prev.find(m => m.id === payload.new.id)) return prev;
              return [payload.new, ...prev];
            });
          } else if (payload.eventType === 'DELETE') {
            setMarkers(prev => prev.filter(m => m.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setMarkers(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
          }
        }
      )
      .subscribe((status) => {
        console.log('Suscripción marcadores:', status);
      });

    return () => {
      if (areasSubscriptionRef.current) supabase.removeChannel(areasSubscriptionRef.current);
      if (markersSubscriptionRef.current) supabase.removeChannel(markersSubscriptionRef.current);
    };
  }, []); // Solo al montar

  // ===== LÓGICA ÁREAS =====
  const addDrawingPoint = useCallback((point) => setDrawingPoints(prev => [...prev, point]), []);
  
  const finishDrawing = useCallback(async () => {
    if (drawingPoints.length < 3) { alert('Mínimo 3 puntos'); return; }
    const newArea = {
      name: `Área ${areas.length + 1}`,
      coordinates: [...drawingPoints],
      color: selectedColor.hex,
      fill_opacity: selectedColor.fillOpacity,
      stroke_opacity: selectedColor.strokeOpacity,
    };
    
    const { data, error } = await supabase.from('areas').insert([newArea]).select();
    
    if (error) {
      alert('Error guardando área: ' + error.message);
    } else if (data) {
      // Actualización optimista inmediata
      setAreas(prev => {
        if (prev.find(a => a.id === data[0].id)) return prev;
        return [data[0], ...prev];
      });
      setDrawingPoints([]);
      setMode(null);
    }
  }, [drawingPoints, selectedColor, areas.length]);

  const cancelMode = useCallback(() => {
    setMode(null);
    setDrawingPoints([]);
    setShowMarkerForm(false);
    setPendingMarkerPos(null);
  }, []);

  const deleteArea = async (id) => {
    if (!confirm('¿Eliminar esta área permanentemente?')) return;
    const { error } = await supabase.from('areas').delete().eq('id', id);
    if (error) alert('Error: ' + error.message);
    else setAreas(prev => prev.filter(a => a.id !== id));
  };

  // ===== LÓGICA MARCADORES =====
  const handleMapClickForMarker = (latLng) => {
    setPendingMarkerPos(latLng);
    setShowMarkerForm(true);
  };

  const saveMarker = async (data) => {
    const { data: result, error } = await supabase
      .from('markers')
      .insert([{
        name: data.name,
        description: data.description,
        lat: data.lat,
        lng: data.lng,
        color: data.color,
      }])
      .select();
    
    if (error) {
      alert('Error guardando marcador: ' + error.message);
    } else if (result) {
      // Actualización optimista
      setMarkers(prev => {
        if (prev.find(m => m.id === result[0].id)) return prev;
        return [result[0], ...prev];
      });
      setShowMarkerForm(false);
      setPendingMarkerPos(null);
      setMode(null);
    }
  };

  const deleteMarker = async (id) => {
    if (!confirm('¿Eliminar este marcador?')) return;
    const { error } = await supabase.from('markers').delete().eq('id', id);
    if (error) alert('Error: ' + error.message);
    else setMarkers(prev => prev.filter(m => m.id !== id));
  };

  const loadPredefinedArea = async () => {
    const predefined = {
      name: 'Plaza Mayor Madrid',
      coordinates: [[40.4156, -3.7074], [40.4158, -3.7044], [40.4148, -3.7042], [40.4146, -3.7072]],
      color: selectedColor.hex,
      fill_opacity: selectedColor.fillOpacity,
      stroke_opacity: selectedColor.strokeOpacity,
    };
    const { data } = await supabase.from('areas').insert([predefined]).select();
    if (data && mapInstance) {
      mapInstance.fitBounds(L.latLngBounds(predefined.coordinates), { padding: [50, 50] });
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ areas, markers }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mapa-respaldo-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const centerOnCurrentLocation = () => {
    if (mapInstance && position) mapInstance.flyTo([position.lat, position.lng], 18);
  };

  if (loading || isSyncing) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
          <p className="text-cyan-400 font-mono text-sm tracking-widest">
            {isSyncing ? 'SINCRONIZANDO...' : 'OBTENIENDO UBICACIÓN...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-900">
        <div className="hologram-card p-8 rounded-2xl max-w-md text-center text-cyan-100">
          <h2 className="text-xl font-bold mb-2 font-mono">ERROR</h2>
          <p className="text-cyan-300/70 mb-4 text-sm">{error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-cyan-500/20 border border-cyan-400/50 rounded-lg text-cyan-300 hover:bg-cyan-500/30 font-mono text-sm">
            REINTENTAR
          </button>
        </div>
      </div>
    );
  }

  const defaultPosition = position || { lat: 40.4168, lng: -3.7038 };

  return (
    <div className="relative h-screen w-full bg-gray-900">
      
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 z-[1000] glass-panel rounded-2xl p-4 shadow-glass bg-gray-900/80 border-cyan-500/20">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-cyan-500/20 p-2 rounded-xl border border-cyan-400/30">
              <Globe className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-cyan-50 font-mono tracking-wider">MAPA COLABORATIVO</h1>
              <p className="text-xs text-cyan-400/70 font-mono">
                {areas.length} ÁREAS • {markers.length} MARCADORES
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-cyan-950/30 rounded-xl p-2 border border-cyan-500/20">
            <span className="text-[10px] text-cyan-500 uppercase tracking-widest px-2 font-mono">COLOR:</span>
            {COLOR_PALETTE.map((color) => (
              <button
                key={color.hex}
                onClick={() => setSelectedColor(color)}
                className={`w-7 h-7 rounded-md transition-all transform hover:scale-110 border ${selectedColor.hex === color.hex ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-70'}`}
                style={{ backgroundColor: color.hex }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Controles */}
      <div className="absolute top-28 left-4 z-[1000] flex flex-col gap-3">
        <div className="glass-panel rounded-2xl p-3 shadow-glass bg-gray-900/80 border-cyan-500/20 flex flex-col gap-2">
          
          <button
            onClick={() => setMode(mode === 'area' ? null : 'area')}
            className={`p-3 rounded-xl transition-all flex items-center gap-2 border ${mode === 'area' ? 'bg-blue-600/80 border-blue-400 text-white' : 'bg-cyan-950/30 border-cyan-500/20 text-cyan-300 hover:bg-cyan-900/30'}`}
          >
            {mode === 'area' ? <X className="w-5 h-5" /> : <MousePointer2 className="w-5 h-5" />}
            <span className="text-sm font-medium hidden lg:inline font-mono">
              {mode === 'area' ? 'CANCELAR' : 'ÁREA'}
            </span>
          </button>

          {mode === 'area' && drawingPoints.length >= 3 && (
            <button
              onClick={finishDrawing}
              className="p-3 rounded-xl bg-green-600/80 border border-green-400 text-white hover:bg-green-500/80 transition-all flex items-center gap-2 animate-pulse"
            >
              <Check className="w-5 h-5" />
              <span className="text-sm font-medium hidden lg:inline font-mono">PUBLICAR</span>
            </button>
          )}

          <button
            onClick={() => setMode(mode === 'marker' ? null : 'marker')}
            className={`p-3 rounded-xl transition-all flex items-center gap-2 border ${mode === 'marker' ? 'bg-purple-600/80 border-purple-400 text-white' : 'bg-cyan-950/30 border-cyan-500/20 text-cyan-300 hover:bg-cyan-900/30'}`}
          >
            {mode === 'marker' ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            <span className="text-sm font-medium hidden lg:inline font-mono">
              {mode === 'marker' ? 'CANCELAR' : 'MARCADOR'}
            </span>
          </button>

          <button
            onClick={loadPredefinedArea}
            className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-900/30 transition-all flex items-center gap-2"
          >
            <Square className="w-5 h-5" />
            <span className="text-sm font-medium hidden lg:inline font-mono">DEMO</span>
          </button>

          <button
            onClick={centerOnCurrentLocation}
            className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-900/30 transition-all flex items-center gap-2"
          >
            <Navigation className="w-5 h-5" />
            <span className="text-sm font-medium hidden lg:inline font-mono">UBICACIÓN</span>
          </button>

          <button
            onClick={() => setShowDataList(!showDataList)}
            className={`p-3 rounded-xl transition-all flex items-center gap-2 border ${showDataList ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' : 'bg-cyan-950/30 border-cyan-500/20 text-cyan-300 hover:bg-cyan-900/30'}`}
          >
            <Crosshair className="w-5 h-5" />
            <span className="text-sm font-medium hidden lg:inline font-mono">
              DATOS
            </span>
          </button>
        </div>

        <div className="glass-panel rounded-2xl p-3 shadow-glass bg-gray-900/80 border-cyan-500/20 flex flex-col gap-2">
          <button onClick={exportData} className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-900/30 transition-all flex items-center gap-2">
            <Download className="w-5 h-5" />
            <span className="text-sm font-medium hidden lg:inline font-mono">RESPALDO</span>
          </button>
        </div>
      </div>

      {/* Lista de datos */}
      {showDataList && (
        <div className="absolute top-28 right-4 z-[1000] w-80 glass-panel rounded-2xl p-4 shadow-glass bg-gray-900/90 border-cyan-500/20 max-h-[70vh] overflow-y-auto">
          <h3 className="font-bold text-cyan-400 mb-3 font-mono text-sm tracking-widest flex items-center gap-2">
            <Crosshair className="w-4 h-4" />
            REGISTROS
          </h3>
          
          {areas.length === 0 && markers.length === 0 ? (
            <p className="text-xs text-cyan-600 font-mono text-center py-4">SIN DATOS</p>
          ) : (
            <div className="space-y-3">
              {markers.map((m) => (
                <div key={m.id} className="bg-cyan-950/20 border border-cyan-500/10 rounded-xl p-3 flex items-center justify-between group hover:border-cyan-500/30 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color, boxShadow: `0 0 8px ${m.color}` }} />
                    <div>
                      <p className="text-sm font-medium text-cyan-200 font-mono">{m.name}</p>
                      <p className="text-[10px] text-cyan-600 font-mono">MARCADOR</p>
                    </div>
                  </div>
                  <button onClick={() => deleteMarker(m.id)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {areas.map((a, i) => (
                <div key={a.id} className="bg-cyan-950/20 border border-cyan-500/10 rounded-xl p-3 flex items-center justify-between group hover:border-cyan-500/30 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: a.color }} />
                    <div>
                      <p className="text-sm font-medium text-cyan-200 font-mono">{a.name || `Área #${i+1}`}</p>
                      <p className="text-[10px] text-cyan-600 font-mono">{a.coordinates?.length} PTS</p>
                    </div>
                  </div>
                  <button onClick={() => deleteArea(a.id)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Instrucciones */}
      {mode === 'area' && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[1000] bg-gray-900/90 border border-blue-500/30 text-blue-200 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur-md">
          <MousePointer2 className="w-5 h-5 text-blue-400 animate-bounce" />
          <span className="font-mono text-sm">
            {drawingPoints.length === 0 ? 'CLIC PARA INICIAR ÁREA' : `PUNTOS: ${drawingPoints.length} • DOBLE CLIC PARA CERRAR`}
          </span>
        </div>
      )}
      
      {mode === 'marker' && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[1000] bg-gray-900/90 border border-purple-500/30 text-purple-200 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur-md">
          <MapPin className="w-5 h-5 text-purple-400 animate-bounce" />
          <span className="font-mono text-sm">CLIC EN EL MAPA PARA COLOCAR MARCADOR</span>
        </div>
      )}

      {/* Formulario nuevo marcador */}
      {showMarkerForm && pendingMarkerPos && (
        <MarkerFormModal
          position={pendingMarkerPos}
          onSave={saveMarker}
          onCancel={() => { setShowMarkerForm(false); setPendingMarkerPos(null); setMode(null); }}
        />
      )}

      {/* MAPA */}
      <MapContainer
        center={[defaultPosition.lat, defaultPosition.lng]}
        zoom={16}
        scrollWheelZoom={true}
        className="h-full w-full"
        whenCreated={setMapInstance}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <DrawingHandler 
          mode={mode}
          onPointAdd={addDrawingPoint}
          points={drawingPoints}
          onFinish={finishDrawing}
          onCancel={cancelMode}
          onMapClick={handleMapClickForMarker}
        />

        {mode === 'area' && mapInstance && (
          <DrawingPreview points={drawingPoints} color={selectedColor.hex} map={mapInstance} />
        )}

        {/* Áreas */}
        {areas.map((area) => (
          <Polygon
            key={area.id}
            positions={area.coordinates}
            pathOptions={{
              color: area.color,
              fillColor: area.color,
              fillOpacity: area.fill_opacity || 0.35,
              weight: 3,
              opacity: area.stroke_opacity || 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        ))}

        {/* Marcadores con Popup nativo de Leaflet (hover al clickear) */}
        {markers.map((marker) => (
          <CustomMarker 
            key={marker.id} 
            marker={marker} 
            onDelete={deleteMarker}
          />
        ))}

        {/* Ubicación actual */}
        {position && (
          <CircleMarker
            center={[position.lat, position.lng]}
            radius={8}
            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.8, weight: 2 }}
          />
        )}
      </MapContainer>
    </div>
  );
};

export default MapComponent;
