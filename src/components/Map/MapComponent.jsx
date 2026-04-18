import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import { useGeolocation } from '../../hooks/useGeolocation';
import { supabase } from '../../utils/supabaseClient';
import { 
  Palette, MousePointer2, Trash2, Check, X, 
  Navigation, Square, Download, Globe, Loader2
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

const DrawingHandler = ({ isDrawing, onPointAdd, points, onFinish, onCancel }) => {
  const map = useMap();
  
  useMapEvents({
    click(e) {
      if (isDrawing) onPointAdd([e.latlng.lat, e.latlng.lng]);
    },
    dblclick(e) {
      if (isDrawing && points.length >= 3) {
        e.originalEvent.stopPropagation();
        onFinish();
      }
    }
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isDrawing && e.key === 'Escape') onCancel();
    };
    if (isDrawing) {
      window.addEventListener('keydown', handleKeyDown);
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.getContainer().style.cursor = '';
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawing, map, onCancel]);

  return null;
};

const DrawingPreview = ({ points, color, map }) => {
  useEffect(() => {
    if (points.length < 2 || !map) return;
    
    const polyline = L.polyline(points, {
      color, weight: 3, opacity: 0.7, dashArray: '5, 10'
    }).addTo(map);
    
    const markers = points.map((point, index) => 
      L.circleMarker(point, {
        radius: 6, fillColor: color, color: '#fff', weight: 2, opacity: 1, fillOpacity: 1
      }).addTo(map).bindPopup(`Punto ${index + 1}`)
    );
    
    return () => {
      map.removeLayer(polyline);
      markers.forEach(m => map.removeLayer(m));
    };
  }, [points, color, map]);

  return null;
};

const MapComponent = () => {
  const { position, error, loading } = useGeolocation();
  const [mapInstance, setMapInstance] = useState(null);
  
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[0]);
  const [areas, setAreas] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [showAreasList, setShowAreasList] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);

  // Cargar áreas desde Supabase
  useEffect(() => {
    const loadAreas = async () => {
      const { data, error } = await supabase
        .from('areas')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error cargando áreas:', error);
      } else {
        setAreas(data || []);
      }
      setIsSyncing(false);
    };
    
    loadAreas();

    // Suscripción en tiempo real (opcional pero genial)
    const subscription = supabase
      .channel('areas-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'areas' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setAreas(prev => [payload.new, ...prev]);
        } else if (payload.eventType === 'DELETE') {
          setAreas(prev => prev.filter(a => a.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const addDrawingPoint = useCallback((point) => {
    setDrawingPoints(prev => [...prev, point]);
  }, []);

  const finishDrawing = useCallback(async () => {
    if (drawingPoints.length < 3) {
      alert('Mínimo 3 puntos');
      return;
    }
    
    const newArea = {
      name: `Área ${areas.length + 1}`,
      coordinates: [...drawingPoints],
      color: selectedColor.hex,
      fill_opacity: selectedColor.fillOpacity,
      stroke_opacity: selectedColor.strokeOpacity,
    };

    const { data, error } = await supabase
      .from('areas')
      .insert([newArea])
      .select();

    if (error) {
      alert('Error guardando: ' + error.message);
    } else {
      // No necesitas setAreas porque la suscripción en tiempo real lo hará
      // pero por si acaso:
      if (data) setAreas(prev => [data[0], ...prev]);
    }
    
    setDrawingPoints([]);
    setIsDrawing(false);
  }, [drawingPoints, selectedColor, areas.length]);

  const cancelDrawing = useCallback(() => {
    setDrawingPoints([]);
    setIsDrawing(false);
  }, []);

  const deleteArea = async (id) => {
    if (!confirm('¿Eliminar este dibujo para TODOS los usuarios?')) return;
    
    const { error } = await supabase
      .from('areas')
      .delete()
      .eq('id', id);
    
    if (error) {
      alert('Error eliminando: ' + error.message);
    } else {
      setAreas(prev => prev.filter(a => a.id !== id));
    }
  };

  const loadPredefinedArea = async () => {
    const predefined = {
      name: 'Plaza Mayor Madrid',
      coordinates: [
        [40.4156, -3.7074],
        [40.4158, -3.7044],
        [40.4148, -3.7042],
        [40.4146, -3.7072],
      ],
      color: selectedColor.hex,
      fill_opacity: selectedColor.fillOpacity,
      stroke_opacity: selectedColor.strokeOpacity,
    };

    const { data, error } = await supabase
      .from('areas')
      .insert([predefined])
      .select();

    if (error) {
      alert('Error: ' + error.message);
    } else if (data && mapInstance) {
      const bounds = L.latLngBounds(predefined.coordinates);
      mapInstance.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  // Exportar todas las áreas a JSON (respaldo local)
  const exportAreas = () => {
    const dataStr = JSON.stringify(areas, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mapa-respaldo-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const centerOnCurrentLocation = () => {
    if (mapInstance && position) {
      mapInstance.flyTo([position.lat, position.lng], 18);
    }
  };

  if (loading || isSyncing) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-100">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-600 font-medium">
            {isSyncing ? 'Sincronizando con la nube...' : 'Obteniendo ubicación...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-100">
        <div className="glass-panel p-8 rounded-2xl shadow-glass max-w-md text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const defaultPosition = position || { lat: 40.4168, lng: -3.7038 };

  return (
    <div className="relative h-screen w-full">
      
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 z-[1000] glass-panel rounded-2xl p-4 shadow-glass">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-green-600 p-2 rounded-xl">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">Mapa Colaborativo</h1>
              <p className="text-sm text-gray-600 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                {areas.length} áreas públicas • En vivo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
            <span className="text-xs font-medium text-gray-500 px-2">Color:</span>
            {COLOR_PALETTE.map((color) => (
              <button
                key={color.hex}
                onClick={() => setSelectedColor(color)}
                className={`w-8 h-8 rounded-lg transition-all transform hover:scale-110 ${
                  selectedColor.hex === color.hex 
                    ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' 
                    : ''
                }`}
                style={{ backgroundColor: color.hex }}
                title={color.name}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Controles */}
      <div className="absolute top-28 left-4 z-[1000] flex flex-col gap-3">
        <div className="glass-panel rounded-2xl p-3 shadow-glass flex flex-col gap-2">
          
          <button
            onClick={() => isDrawing ? cancelDrawing() : setIsDrawing(true)}
            className={`p-3 rounded-xl transition-all flex items-center gap-2 ${
              isDrawing 
                ? 'bg-red-500 text-white hover:bg-red-600' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isDrawing ? <X className="w-5 h-5" /> : <MousePointer2 className="w-5 h-5" />}
            <span className="text-sm font-medium hidden lg:inline">
              {isDrawing ? 'Cancelar' : 'Dibujar'}
            </span>
          </button>

          {isDrawing && drawingPoints.length >= 3 && (
            <button
              onClick={finishDrawing}
              className="p-3 rounded-xl bg-green-600 text-white hover:bg-green-700 transition-all flex items-center gap-2 animate-pulse"
            >
              <Check className="w-5 h-5" />
              <span className="text-sm font-medium hidden lg:inline">Publicar</span>
            </button>
          )}

          <button
            onClick={() => loadPredefinedArea()}
            className="p-3 rounded-xl bg-white text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-2"
          >
            <Square className="w-5 h-5" />
            <span className="text-sm font-medium hidden lg:inline">Demo</span>
          </button>

          <button
            onClick={centerOnCurrentLocation}
            className="p-3 rounded-xl bg-white text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-2"
          >
            <Navigation className="w-5 h-5" />
            <span className="text-sm font-medium hidden lg:inline">Ubicación</span>
          </button>

          <button
            onClick={() => setShowAreasList(!showAreasList)}
            className={`p-3 rounded-xl transition-all flex items-center gap-2 ${
              showAreasList 
                ? 'bg-gray-800 text-white' 
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Palette className="w-5 h-5" />
            <span className="text-sm font-medium hidden lg:inline">
              Áreas ({areas.length})
            </span>
          </button>
        </div>

        <div className="glass-panel rounded-2xl p-3 shadow-glass flex flex-col gap-2">
          <button
            onClick={exportAreas}
            className="p-3 rounded-xl bg-white text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-2"
            title="Descargar respaldo JSON"
          >
            <Download className="w-5 h-5" />
            <span className="text-sm font-medium hidden lg:inline">Respaldo</span>
          </button>
        </div>
      </div>

      {/* Lista de Áreas */}
      {showAreasList && (
        <div className="absolute top-28 right-4 z-[1000] w-80 glass-panel rounded-2xl p-4 shadow-glass max-h-[70vh] overflow-y-auto">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Áreas Públicas
          </h3>
          
          {areas.length === 0 ? (
            <div className="text-center py-6">
              <Globe className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Nadie ha dibujado aún</p>
              <p className="text-xs text-gray-400 mt-1">¡Sé el primero!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {areas.map((area, index) => (
                <div 
                  key={area.id} 
                  className="bg-white/50 rounded-xl p-3 flex items-center justify-between group hover:bg-white/80 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                      style={{ backgroundColor: area.color }}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {area.name || `Área #${index + 1}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        {area.coordinates?.length || 0} puntos • {new Date(area.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteArea(area.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    title="Eliminar públicamente"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Instrucciones */}
      {isDrawing && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[1000] bg-gray-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <MousePointer2 className="w-5 h-5 text-blue-400" />
            <span className="font-medium">
              {drawingPoints.length === 0 
                ? 'Haz clic para empezar' 
                : `Puntos: ${drawingPoints.length}`}
            </span>
          </div>
          <div className="text-xs text-gray-400 flex gap-4">
            <span>• Doble clic para cerrar</span>
            <span>• Esc para cancelar</span>
          </div>
          {drawingPoints.length > 0 && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setDrawingPoints(drawingPoints.slice(0, -1))}
                className="px-3 py-1 bg-gray-700 rounded-lg text-xs hover:bg-gray-600"
              >
                Deshacer
              </button>
              {drawingPoints.length >= 3 && (
                <button
                  onClick={finishDrawing}
                  className="px-3 py-1 bg-green-600 rounded-lg text-xs hover:bg-green-700"
                >
                  Publicar
                </button>
              )}
            </div>
          )}
        </div>
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
          isDrawing={isDrawing}
          onPointAdd={addDrawingPoint}
          points={drawingPoints}
          onFinish={finishDrawing}
          onCancel={cancelDrawing}
        />

        {isDrawing && mapInstance && (
          <DrawingPreview 
            points={drawingPoints} 
            color={selectedColor.hex}
            map={mapInstance}
          />
        )}

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

        {position && (
          <CircleMarker
            center={[position.lat, position.lng]}
            radius={8}
            pathOptions={{
              color: '#3b82f6',
              fillColor: '#3b82f6',
              fillOpacity: 0.8,
              weight: 2,
            }}
          />
        )}
      </MapContainer>
    </div>
  );
};

export default MapComponent;