let map;
let markersGroup;

export function initMap(containerId, centerLat = 48.8566, centerLng = 2.3522, zoom = 12) {
    // Ініціалізація карти
    map = L.map(containerId).setView([centerLat, centerLng], zoom);

    // Підключення тайлів OpenStreetMap (безкоштовно, без API ключа)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    markersGroup = L.layerGroup().addTo(map);

    // Налаштування Leaflet Control Geocoder (Пошук місць)
    // Вимагає підключення скрипта плагіна в HTML
    if (typeof L.Control.Geocoder !== 'undefined') {
        L.Control.geocoder({
            defaultMarkGeocode: false
        }).on('markgeocode', function(e) {
            const bbox = e.geocode.bbox;
            const poly = L.polygon([
                bbox.getSouthEast(),
                bbox.getNorthEast(),
                bbox.getNorthWest(),
                bbox.getSouthWest()
            ]);
            map.fitBounds(poly.getBounds());
            
            // Тут можна викликати callback для збереження координат у форму
            console.log("Знайдено координати:", e.geocode.center);
        }).addTo(map);
    }
}

export function addMarker(lat, lng, title, popupContent) {
    if (!map || !markersGroup) return;
    const marker = L.marker([lat, lng]).addTo(markersGroup);
    if (title || popupContent) {
        marker.bindPopup(`<b>${title}</b><br>${popupContent}`);
    }
}

export function clearMarkers() {
    if (markersGroup) {
        markersGroup.clearLayers();
    }
}