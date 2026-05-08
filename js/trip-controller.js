import { db, auth } from './api/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    doc, getDoc, collection, query, where, getDocs, addDoc, deleteDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { setupTabs } from './modules/ui-effects.js';

const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
const TRANSPORT_EMOJI = {
    plane:       '✈️',
    train:       '🚂',
    bus:         '🚌',
    car:         '🚗',
    ship:        '🚢',
    metro:       '🚇',
    tram:        '🚊',
    bike:        '🚲',
    ferry:       '⛴️',
    helicopter:  '🚁',
};

function getTransportEmoji(type) {
    return TRANSPORT_EMOJI[type] || '✈️';
}


let currentTrip = null;
let cascadeMode = false;
let currentExpenses = [];
let currentWalking = [];
let map = null;
let miniMap = null; 
let miniMapMarker = null;
let editingExpenseId = null;
let selectingStart = true;        // true = початок, false = кінець
// Маркери для карти прогулянок
let walkStartMarker = null;
let walkEndMarker   = null;
let walkRouteLine   = null;
let currentWalkMapBtn = null; // відстежує яка кнопка відкрила карту

// Маркери для карти транспортних витрат
let expFromMarker  = null;
let expToMarker    = null;
let expRouteLine   = null;
let selectingExpFrom = true; // true = "Звідки", false = "Куди"

let currentNotes = [];
let editingNoteId = null;

let noteMap = null;
let noteMarker = null;

// --- ІНІЦІАЛІЗАЦІЯ ---
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupModals();
    createGlobalDatalist();
    initSmartSearch(); // Викликай ТУТ один раз при завантаженні сторінки
    setupNoteForm();
});

onAuthStateChanged(auth, (user) => {
    if (user) loadAllData();
    else window.location.href = 'index.html';
});

async function loadAllData() {
    if (!tripId) return;
    try {
        const tripSnap = await getDoc(doc(db, "trips", tripId));
        if (!tripSnap.exists()) return;

        currentTrip = { id: tripSnap.id, ...tripSnap.data() };
        document.getElementById('trip-title').innerText = currentTrip.title;

        cascadeMode = currentTrip.cascadeMode === true;
        const toggle = document.getElementById('cascade-toggle');
        if (toggle) toggle.checked = cascadeMode;

        // Завантаження даних
        const expSnap = await getDocs(query(collection(db, "expenses"), where("tripId", "==", tripId)));
        currentExpenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const walkSnap = await getDocs(query(collection(db, "walking"), where("tripId", "==", tripId)));
        currentWalking = walkSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const notesSnap = await getDocs(query(collection(db, "notes"), where("tripId", "==", tripId)));
currentNotes = notesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        updateOverview();
        renderTables();           // ← має працювати
        renderWalkingTable();
        renderNotesTable();
        updateGlobalCityList();
        initSmartSearch();
        

        if (map) renderMarkersOnMap();
    } catch (e) {
        console.error("Помилка завантаження:", e);
    }
}

// --- УПРАВЛІННЯ БЮДЖЕТОМ ТА ВАЛЮТОЮ ---
function updateOverview() {
    const statsContainer = document.getElementById('budget-info');
    const catContainer = document.getElementById('category-summary');
    if (!statsContainer || !currentTrip) return;

    const baseCurrency = currentTrip.currency || 'EUR';
    const rates = currentTrip.lockedExchangeRates || { "UAH": 43, "USD": 1.08, "EUR": 1 };
    
    let totalSpentInBase = 0;
    const cats = { "Transport": 0, "Hotel": 0, "Food": 0 };
    
    currentExpenses.forEach(exp => {
        if (!exp.isPlanned) {
            // Конвертуємо витрату в базову валюту подорожі
            let amountInBase = Number(exp.amount);
            if (exp.currency !== baseCurrency) {
                // Переводимо спочатку в EUR (якщо це не EUR), а потім у базову
                let inEur = exp.currency === 'EUR' ? exp.amount : exp.amount / (rates[exp.currency] || 1);
                amountInBase = baseCurrency === 'EUR' ? inEur : inEur * (rates[baseCurrency] || 1);
            }
            
            totalSpentInBase += amountInBase;
            const c = exp.category === 'Transport' || exp.category === 'Hotel' ? exp.category : 'Food';
            cats[c] += amountInBase;
        }
    });

    const totalKm = currentWalking.reduce((sum, w) => sum + (parseFloat(w.km) || 0), 0);
    const budget = parseFloat(currentTrip.estimatedBudget) || 0;
    const balance = budget - totalSpentInBase;

    statsContainer.innerHTML = `
        <div class="stat-card">
            Бюджет: <b>${budget.toFixed(2)} ${baseCurrency}</b> 
            <button onclick="editBudget()" class="btn-edit-small" title="Змінити бюджет">✏️</button>
        </div>
        <div class="stat-card">Витрачено: <b style="color:#ff4757">-${totalSpentInBase.toFixed(2)} ${baseCurrency}</b></div>
        <div class="stat-card">Залишок: <b style="color:${balance >= 0 ? '#00ff88' : '#ff4757'}">${balance.toFixed(2)} ${baseCurrency}</b></div>
        <div class="stat-card">Дистанція: <b style="color:#3498db">${totalKm.toFixed(1)} км</b></div>
    `;

    catContainer.innerHTML = `
        <div class="cat-pill">✈️ Транспорт: ${cats.Transport.toFixed(2)} ${baseCurrency}</div>
        <div class="cat-pill">🏠 Житло: ${cats.Hotel.toFixed(2)} ${baseCurrency}</div>
        <div class="cat-pill">🍴 Харчування/Інше: ${cats.Food.toFixed(2)} ${baseCurrency}</div>
    `;
}

window.editBudget = async () => {
    const newBudget = prompt(`Змінити бюджет (${currentTrip.currency}):`, currentTrip.estimatedBudget);
    if (newBudget !== null && !isNaN(newBudget)) {
        await updateDoc(doc(db, "trips", tripId), { estimatedBudget: parseFloat(newBudget) });
        loadAllData();
    }
};

// --- ГЛОБАЛЬНИЙ СПИСОК МІСТ ---
function createGlobalDatalist() {
    if (!document.getElementById('global-cities-list')) {
        const dl = document.createElement('datalist');
        dl.id = 'global-cities-list';
        document.body.appendChild(dl);
    }
}

function updateGlobalCityList() {
    const cities = new Set();
    currentExpenses.forEach(e => {
        if (e.city) cities.add(e.city);
        if (e.fromCity) cities.add(e.fromCity);
        if (e.toCity) cities.add(e.toCity);
    });
    currentWalking.forEach(w => { if (w.city) cities.add(w.city); });

    const datalist = document.getElementById('global-cities-list');
    datalist.innerHTML = Array.from(cities).map(c => `<option value="${c}">`).join('');
    
    // Прив'язуємо до всіх полів міст
    ['exp-from-city', 'exp-to-city', 'walk-city'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.setAttribute('list', 'global-cities-list');
    });
}

function updateLocationData(lat, lng, name = null) {
    const nameField = document.getElementById('exp-city-name');
    const latField = document.getElementById('exp-city-lat');
    const lngField = document.getElementById('exp-city-lng');

    if (!nameField || !latField || !lngField) return;

    nameField.value = name || "";
    latField.value = lat.toString();
    lngField.value = lng.toString();
}

// === ОТРИМАННЯ ПОВНОЇ ІЄРАРХІЇ З NOMINATIM ===
// === ОТРИМАННЯ ПОВНОЇ ІЄРАРХІЇ З NOMINATIM ЧЕРЕЗ ПРОКСІ ===
async function getLocationHierarchy(lat, lng) {
    try {
        const proxyUrl = `https://muddy-resonance-2672.kossakova-slava-v.workers.dev/?lat=${lat}&lon=${lng}&zoom=18`;

        const res = await fetch(proxyUrl);

        if (!res.ok) {
            throw new Error(`Proxy error: ${res.status}`);
        }

        const data = await res.json();
        const addr = data.address || {};
        const details = data.namedetails || {};

        console.log("=== RAW NOMINATIM ===", addr);


        let place =
            details['name:uk'] ||
            details.name ||
            addr.amenity ||
            addr.tourism ||
            addr.leisure ||
            addr.shop ||
            addr.building ||
            addr.road ||
            null;

        if (!place) {
            place = addr.house_number || addr.suburb || addr.neighbourhood || 
                    addr.village || addr.hamlet || null;
        }

        // =========================
        // 2. CITY (L2)
        // =========================
        let city =
            addr.city ||
            addr.town ||
            addr.municipality ||
            addr.city_district ||
            addr.county ||
            null;

        if (city && String(city).includes("громада")) {
            city = addr.city || addr.town || addr.county || null;
        }

        // =========================
        // 3. REGION + COUNTRY
        // =========================
        let region = addr.state || addr.state_district || addr.county || null;
        const country = addr.country || "Unknown";

        // =========================
        // Специфічні виправлення
        // =========================
        const rawText = JSON.stringify(addr);

        if (country.toLowerCase().includes("portugal")) {
            if (rawText.includes("Lisboa") || rawText.includes("Cascais") || 
                rawText.includes("Sintra") || rawText.includes("Oeiras") || rawText.includes("Amadora")) {
                city = "Лісабон";
            }
            if (city === "Matosinhos") city = "Порту";
        }

        if (country.toLowerCase().includes("poland")) {
            if (addr.county && addr.county.includes("Wrocław")) {
                city = "Вроцлав";
            }
        }

        if (country === "Україна") {
            if (addr.city === "Київ" || addr.town === "Київ") city = "Київ";
        }

        // =========================
        // DISPLAY NAME
        // =========================
        let displayName = place || city || "Unknown";

        if (place && city && place !== city) {
            displayName = `${city} (${place})`;
        }

        const result = {
    displayName,
    country,
    countryCode: addr.country_code ? addr.country_code.toUpperCase() : null,
    level1: place || null,
    level2: city || null,
    level3: region || null,
    level4: country,
    rawAddr: addr,
    lat,
    lng
};

        console.log("=== FINAL LOCATION ===", result);
        return result;

    } catch (err) {
        console.error("Nominatim Proxy Error:", err);
        return {
            displayName: `Точка (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            country: "Unknown",
            level1: null,
            level2: "Unknown",
            level3: null,
            level4: "Unknown",
            lat,
            lng
        };
    }
}


window.refreshAllHierarchy = async () => {

    const batch = [];
    for (let exp of currentExpenses) {
        if (!exp.location?.lat || !exp.location?.lng) continue;

        try {
            const newLoc = await getLocationHierarchy(exp.location.lat, exp.location.lng);
            
            batch.push(updateDoc(doc(db, "expenses", exp.id), { 
                location: newLoc,
                city: newLoc.displayName   // для сумісності
            }));
        } catch (e) {
            console.warn("Не вдалося оновити", exp.id, e);
        }
    }

    await Promise.all(batch);
    alert("Ієрархію оновлено!");
    loadAllData();
};

// 2. Оновлена функція toggleMiniMap
function toggleMiniMap(mode = 'normal') {  // mode: 'normal' | 'transport'
    let wrapper = document.getElementById('mini-map-wrapper');
    if (!wrapper) {
        const container = document.getElementById('geocoder-container');
        wrapper = document.createElement('div');
        wrapper.id = 'mini-map-wrapper';
        wrapper.className = 'hidden';
        wrapper.innerHTML = `
            <div id="mini-map" style="height: 300px; margin: 10px 0; border-radius: 12px; border: 2px solid #00ff88; cursor: crosshair;"></div>
            <p id="map-selection-hint" style="font-size: 0.85em; color: #00ff88; text-align: center; margin-bottom: 10px;">
                Клікніть на карту, щоб обрати місце
            </p>`;
        container.after(wrapper);
    }
    
    const isHidden = wrapper.classList.contains('hidden');
    wrapper.classList.toggle('hidden');

    if (!isHidden) { // якщо закриваємо — очищуємо
        resetMiniMapMarker();
        return;
    }

    if (!miniMap) {
        miniMap = L.map('mini-map').setView([48.3, 31.1], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(miniMap);
    }

    setTimeout(() => {
        miniMap.invalidateSize();
        miniMap.off('click'); // ← обов'язково знімаємо всі старі обробники

        miniMap.on('click', async (e) => {
            const { lat, lng } = e.latlng;

            // Оновлюємо/створюємо маркер
            if (miniMapMarker) {
                miniMapMarker.setLatLng([lat, lng]);
            } else {
                miniMapMarker = L.marker([lat, lng]).addTo(miniMap);
            }

            try {
                const proxyUrl = `https://muddy-resonance-2672.kossakova-slava-v.workers.dev/?lat=${lat}&lon=${lng}&zoom=18`;
                const response = await fetch(proxyUrl);
                const data = await response.json();

                const addr = data.address || {};
                const details = data.namedetails || {};

                let finalName = 
                    details['name:uk'] || 
                    addr.road || 
                    addr.city || 
                    addr.town || 
                    addr.village || 
                    `Точка (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

                // === РІЗНА ЛОГІКА ЗАЛЕЖНО ВІД РЕЖИМУ ===
                if (mode === 'transport' && selectingExpFrom !== undefined) {
                    // Transport mode
                    if (selectingExpFrom) {
                        // ... (твій код для from)
                    } else {
                        // ... (твій код для to)
                    }
                } else {
                    // Normal expense (Hotel/Food)
                    document.getElementById('exp-city-name').value = finalName;
                    document.getElementById('exp-city-lat').value = lat;
                    document.getElementById('exp-city-lng').value = lng;
                    
                    miniMapMarker.bindPopup(`<b>📍 ${finalName}</b>`).openPopup();
                }

            } catch (err) {
                console.warn("Nominatim error:", err);
            }
        });
    }, 200);
}

function initSmartSearch() {
    const container = document.getElementById('geocoder-container');
    if (!container || container.innerHTML !== '') return;

    container.innerHTML = `
        <div class="search-box">
            <input type="text" id="geocoder-input" placeholder="Пошук міста..." autocomplete="off" list="global-cities-list">
            <div id="geocoder-results" class="geocoder-dropdown hidden"></div>
        </div>
    `;

    const input = document.getElementById('geocoder-input');
    const dropdown = document.getElementById('geocoder-results');
    const geocoder = L.Control.Geocoder.nominatim();

    input.addEventListener('input', debounce(function() {
        const query = input.value.trim();
        if (query.length < 3) { dropdown.classList.add('hidden'); return; }

        geocoder.geocode(query, (results) => {
            dropdown.innerHTML = '';
            if (results && results.length > 0) {
                dropdown.classList.remove('hidden');
                results.forEach(res => {
                    const div = document.createElement('div');
                    div.className = 'dropdown-item';
                    div.innerText = res.name;
                    
                    div.onclick = () => {
                        const { lat, lng } = res.center;
                        
                        // ГАРАНТОВАНО записуємо дані у приховані поля через нашу функцію
                        updateLocationData(lat, lng, res.name);
                        
                        dropdown.classList.add('hidden');
                        
                        // Якщо карта ініціалізована — показуємо її та ставимо маркер
                        if (miniMap) {
                            const wrapper = document.getElementById('mini-map-wrapper');
                            if (wrapper) wrapper.classList.remove('hidden');
                            
                            miniMap.invalidateSize();
                            miniMap.setView(res.center, 13);
                            
                            if (miniMapMarker) {
                                miniMapMarker.setLatLng(res.center);
                            } else {
                                miniMapMarker = L.marker(res.center).addTo(miniMap);
                            }
                            
                            miniMapMarker.bindPopup(`<b>${res.name}</b>`).openPopup();
                        }
                    };
                    dropdown.appendChild(div);
                });
            }
        });
    }, 500));
}

// --- МОДАЛКИ ---
// --- МОДАЛКИ ---
function setupModals() {
    const today = new Date().toISOString().split('T')[0]; // ← один раз на початку

    function getLocalToday() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // ====================== ДОДАТИ ВИТРАТУ ======================
    document.getElementById('add-expense-btn').onclick = () => {
        resetMiniMapMarker();
        editingExpenseId = null;

        const modalTitle = document.getElementById('expense-modal-title');
        if (modalTitle) modalTitle.innerText = "Додати витрату";

        const modal = document.getElementById('expense-modal');
        if (modal) modal.classList.remove('hidden');

        const today = getLocalToday();

        setTimeout(() => {
            const dateInput = document.getElementById('exp-date');
            if (dateInput) dateInput.value = today;

            const timeInput = document.getElementById('exp-time');
            if (timeInput) timeInput.value = '00:00';
        }, 30);

        document.getElementById('expense-form')?.reset();
    };

    // ====================== ДОДАТИ ПРОГУЛЯНКУ ======================
    document.getElementById('add-walking-btn').onclick = () => {
        resetWalkingForm();
        
        const modal = document.getElementById('walking-modal');
        if (modal) modal.classList.remove('hidden');

        const today = getLocalToday();
        const walkDateInput = document.getElementById('walk-date');
        if (walkDateInput) walkDateInput.value = today;

        updateWalkSubmitButton();
    };

    // ====================== ЗАКРИТТЯ ======================
    document.getElementById('close-exp-btn').onclick = closeExpenseModal;
    document.getElementById('close-walk-btn').onclick = closeWalkingModal;

    // Інші обробники
    const selectOnMapBtn = document.getElementById('select-on-map-btn');
    if (selectOnMapBtn) {
        selectOnMapBtn.onclick = (e) => { 
            e.preventDefault(); 
            toggleMiniMap(); 
        };
    }

    const geoBtn = document.getElementById('use-geolocation-btn');
    if (geoBtn) geoBtn.onclick = window.useMyGeolocation;

    // Ініціалізація форм
    setupWalkingHandlers();
    setupExpenseForm();
    setupWalkingForm();
    setupNotesHandlers();
}

function renderTables() {
    const tables = {
        Transport: document.querySelector('#transport-table tbody'),
        Hotel:     document.querySelector('#hotels-table tbody'),
        Food:      document.querySelector('#daily-expenses-table tbody')
    };
    Object.values(tables).forEach(t => { if (t) t.innerHTML = ''; });

    const sorted = [...currentExpenses].sort((a, b) => {
    const getSortDate = (exp) => {
        if (exp.datetime) return new Date(exp.datetime);
        if (exp.date) return new Date(`${exp.date}T${exp.time || '00:00'}`);
        return new Date(0); // fallback
    };
    
    return getSortDate(b) - getSortDate(a);
});

function buildRow(exp) {
    const isPlanned = exp.isPlanned === true;
    const loc       = exp.location || {};

    // === ОБРОБКА ДАТИ ТА ЧАСУ ===
    let displayDate = '';
    let displayTime = '';

    if (exp.datetime) {
        const dt = new Date(exp.datetime);
        displayDate = dt.toLocaleDateString('uk-UA');
        displayTime = dt.toLocaleTimeString('uk-UA', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    } else {
        // Зворотна сумісність зі старими записами
        const dateOnly = new Date(exp.date);
        displayDate = dateOnly.toLocaleDateString('uk-UA');
        displayTime = exp.time || '00:00';
    }

    let mainText = '';
    if (exp.category === 'Transport') {
        const emoji     = getTransportEmoji(exp.transportType);
        const fromCity  = exp.fromCity || loc.displayName || '—';
        const toCity    = exp.toCity   || '';
        mainText = toCity
            ? `${emoji} ${fromCity} → ${toCity}`
            : `${emoji} ${fromCity}`;
    } else {
        mainText = loc.displayName || exp.city || '—';
    }

    const descText  = exp.title ? `<div class="route-desc">${exp.title}</div>` : '';
    const cellInner = `<div class="cell-route">
                           <div class="route-main">${mainText}</div>
                           ${descText}
                       </div>`;

    const actions = `
        ${isPlanned ? `<button class="btn-confirm" onclick="confirmExpense('${exp.id}',${exp.amount})">✅</button>` : ''}
        <button class="btn-edit-small" onclick="editExpense('${exp.id}')" title="Редагувати">✏️</button>
        <button class="btn-del" onclick="deleteItem('expenses','${exp.id}')" title="Видалити">❌</button>`;

    return `
        <tr class="${isPlanned ? 'row-planned' : ''}">
            <td style="white-space:nowrap; line-height: 1.4;">
                ${displayDate}
                <br>
                <small style="color:#888; font-size:0.9em;">${displayTime}</small>
            </td>
            <td>${cellInner}</td>
            <td><b>${Number(exp.amount).toFixed(2)}</b></td>
            <td>${exp.currency}</td>
            <td style="white-space:nowrap;">${actions}</td>
        </tr>`;
}

    // ── ПЛОСКИЙ РЕЖИМ ────────────────────────────────────────────────
    if (!cascadeMode) {
        sorted.forEach(exp => {
            const cat   = exp.category === 'Transport' || exp.category === 'Hotel' ? exp.category : 'Food';
            const tbody = tables[cat];
            if (tbody) tbody.innerHTML += buildRow(exp);
        });
        return;
    }

    // ── КАСКАДНИЙ РЕЖИМ ──────────────────────────────────────────────
    const groups = { Transport: {}, Hotel: {}, Food: {} };

    sorted.forEach(exp => {
        const cat = exp.category === 'Transport' || exp.category === 'Hotel' ? exp.category : 'Food';
        
        // ←←← ВИПРАВЛЕННЯ ЗВІДКИ БУЛА ПОМИЛКА
        const loc = exp.location || {};
        
        const country   = loc.country   || exp.country || 'Інше';
        const region    = loc.level3    || loc.level2 || 'Без регіону';
        const city      = loc.level2    || loc.city   || 'Без міста';
        const placeName = loc.displayName || exp.city  || 'Без назви';

        const cKey  = country;
        const rKey  = `${country}|${region}`;
        const ciKey = `${country}|${region}|${city}`;
        const pKey  = placeName;

        if (!groups[cat][cKey]) groups[cat][cKey] = {};
        if (!groups[cat][cKey][rKey]) groups[cat][cKey][rKey] = { regionName: region, cities: {} };
        if (!groups[cat][cKey][rKey].cities[ciKey])
            groups[cat][cKey][rKey].cities[ciKey] = { cityName: city, places: {} };
        if (!groups[cat][cKey][rKey].cities[ciKey].places[pKey])
            groups[cat][cKey][rKey].cities[ciKey].places[pKey] = [];
        
        groups[cat][cKey][rKey].cities[ciKey].places[pKey].push(exp);
    });

    Object.entries(groups).forEach(([cat, catData]) => {
        const tbody = tables[cat];
        if (!tbody) return;

        Object.entries(catData).forEach(([countryName, regions]) => {
            const flag = getCountryFlag(countryName);
            tbody.innerHTML += `
                <tr class="group-row parent-group">
                    <td colspan="5">${flag} ${countryName}</td>
                </tr>`;

            Object.entries(regions).forEach(([_, rd]) => {
                tbody.innerHTML += `
                    <tr class="group-row" style="background:rgba(0,255,136,0.15);">
                        <td colspan="5" style="padding-left:32px !important;">↳ ${rd.regionName}</td>
                    </tr>`;

                Object.entries(rd.cities).forEach(([_, cd]) => {
                    tbody.innerHTML += `
                        <tr class="group-row" style="background:rgba(255,255,255,0.05);">
                            <td colspan="5" style="padding-left:50px !important;">↳ ${cd.cityName}</td>
                        </tr>`;

                    Object.entries(cd.places).forEach(([_, items]) => {
                        items.forEach(exp => { 
                            tbody.innerHTML += buildRow(exp); 
                        });
                    });
                });
            });
        });
    });
}

function renderWalkingTable() {
    const tbody = document.querySelector('#walking-table tbody');
    if (!tbody) return;

    tbody.innerHTML = currentWalking
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map(w => {
            const startName = w.startLocation?.displayName || w.city || "—";
            let route = startName;

            if (w.hasEndPoint && w.endLocation) {
                route += ` → ${w.endLocation.displayName}`;
            }

            return `
                <tr>
                    <td>${new Date(w.date).toLocaleDateString('uk-UA')}</td>
                    <td>${route}</td>
                    <td>${w.steps}</td>
                    <td>${w.km} км</td>
                    <td><button class="btn-del" onclick="deleteItem('walking','${w.id}')">❌</button></td>
                </tr>
            `;
        }).join('');
}

window.initTripMap = function() {
    if (map) return;
    map = L.map('map').setView([48.3, 31.1], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    
    centerMapOnUserCountry();        // ← додаємо
    renderMarkersOnMap();
};

function renderMarkersOnMap() {
    if (!map) return;

    map.eachLayer(layer => {
        if (layer instanceof L.Marker || layer instanceof L.Polyline) map.removeLayer(layer);
    });

    currentExpenses.forEach(exp => {
        if (exp.isPlanned) return;

        if (exp.category === 'Transport') {
            // --- Транспортний маршрут (дві точки + лінія) ---
            const emoji = getTransportEmoji(exp.transportType);

            const from = exp.fromLocation;
            const to   = exp.toLocation;

            if (from?.lat && to?.lat) {
                // Маркер відправлення (синій)
                L.marker([from.lat, from.lng], {
                    icon: L.divIcon({
                        html: `<div class="map-emoji" style="background:#3498db;border-radius:50%;border:2px solid white;">
                                   ${emoji}
                               </div>`,
                        className: 'custom-leaflet-icon'
                    })
                }).addTo(map).bindPopup(
                    `<b>🔵 Звідки:</b> ${exp.fromCity || from.displayName}<br>` +
                    `${emoji} ${exp.title || ''}`
                );

                // Маркер прибуття (зелений)
                L.marker([to.lat, to.lng], {
                    icon: L.divIcon({
                        html: `<div class="map-emoji" style="background:#00c853;border-radius:50%;border:2px solid white;">
                                   🏁
                               </div>`,
                        className: 'custom-leaflet-icon'
                    })
                }).addTo(map).bindPopup(
                    `<b>🟢 Куди:</b> ${exp.toCity || to.displayName}<br>` +
                    `${emoji} ${exp.title || ''}`
                );

                // Переривчаста лінія маршруту
                L.polyline(
                    [[from.lat, from.lng], [to.lat, to.lng]],
                    { color: '#3498db', weight: 2, dashArray: '8, 10', opacity: 0.8 }
                ).addTo(map);

            } else if (exp.location?.lat) {
                // Стара запис — одна точка
                L.marker([exp.location.lat, exp.location.lng], {
                    icon: L.divIcon({
                        html: `<div class="map-emoji">${emoji}</div>`,
                        className: 'custom-leaflet-icon'
                    })
                }).addTo(map).bindPopup(`<b>${exp.city}</b><br>${exp.title}`);
            }

        } else if (exp.location?.lat) {
            // --- Готель / Їжа ---
            const emoji = exp.category === 'Hotel' ? '🏠' : '🍴';
            L.marker([exp.location.lat, exp.location.lng], {
                icon: L.divIcon({
                    html: `<div class="map-emoji">${emoji}</div>`,
                    className: 'custom-leaflet-icon'
                })
            }).addTo(map).bindPopup(`<b>${exp.city}</b><br>${exp.title}`);
        }
    });

    // --- Прогулянки ---
    currentWalking.forEach(w => {
        if (!w.startLocation?.lat) return;
        const startLL = [w.startLocation.lat, w.startLocation.lng];

        L.marker(startLL, {
            icon: L.divIcon({ html: `<div class="map-emoji">👟</div>`, className: 'custom-leaflet-icon' })
        }).addTo(map).bindPopup(
            `<b>${w.startLocation.displayName || w.city}</b><br>` +
            `${new Date(w.date).toLocaleDateString('uk-UA')}<br>${w.steps} кроків · ${w.km} км`
        );

        if (w.hasEndPoint && w.endLocation?.lat) {
            const endLL = [w.endLocation.lat, w.endLocation.lng];
            L.marker(endLL, {
                icon: L.divIcon({ html: `<div class="map-emoji">🏁</div>`, className: 'custom-leaflet-icon' })
            }).addTo(map).bindPopup(`<b>Кінець: ${w.endLocation.displayName}</b>`);

            L.polyline([startLL, endLL], {
                color: '#00ff88', weight: 2, dashArray: '8, 10', opacity: 0.75
            }).addTo(map);
        }
    });

    // === НОТАТКИ НА КАРТІ ===
currentNotes.forEach(note => {
    if (!note.location?.lat) return;

    L.marker([note.location.lat, note.location.lng], {
        icon: L.divIcon({
            html: `<div class="map-emoji" style="background:#9c27b0;">📝</div>`,
            className: 'custom-leaflet-icon'
        })
    }).addTo(map).bindPopup(`
        <b>📝 Нотатка</b><br>
        ${note.location.displayName || note.city}<br>
        <small>${new Date(note.datetime || note.date).toLocaleDateString('uk-UA')}</small><br><br>
        ${note.text ? (note.text.length > 100 ? note.text.substring(0,100) + '...' : note.text) : ''}
    `);
});

}

window.deleteItem = async (col, id) => {
    if (confirm("Видалити?")) { await deleteDoc(doc(db, col, id)); loadAllData(); }
};

window.confirmExpense = async (id, currentAmount) => {
    const newAmount = prompt("Підтвердіть суму:", currentAmount);
    if (newAmount !== null) {
        await updateDoc(doc(db, "expenses", id), { amount: parseFloat(newAmount), isPlanned: false });
        loadAllData();
    }
};

function debounce(f, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f.apply(this, a), ms); }; }

window.toggleCascadeMode = async () => {
    cascadeMode = !cascadeMode;
    document.getElementById('cascade-toggle').checked = cascadeMode;

    try {
        await updateDoc(doc(db, "trips", tripId), { cascadeMode });

        if (cascadeMode) {
            // Пропонуємо оновити ієрархію при першому ввімкненні
            if (confirm("Увімкнено каскадний режим.\n\ Оновити ієрархію для витрат?")) {
                await window.refreshAllHierarchy();
                return;
            }
        }
        renderTables();
    } catch (e) {
        console.error(e);
    }
};


window.editExpense = async (id) => {
    const exp = currentExpenses.find(e => e.id === id);
    if (!exp) return alert("Запис не знайдено");

    editingExpenseId = id;

    // Надійне відкриття модалки
    const modal = document.getElementById('expense-modal');
    if (modal) modal.classList.remove('hidden');

    const modalTitle = document.getElementById('expense-modal-title');
    if (modalTitle) {
        modalTitle.innerText = 'Редагувати витрату';
    } else {
        console.error("Елемент #expense-modal-title не знайдено!");
    }

    // Заповнення полів
    document.getElementById('exp-title').value     = exp.title    || '';
    document.getElementById('exp-amount').value    = exp.amount   || '';
    document.getElementById('exp-currency').value  = exp.currency || 'EUR';
    document.getElementById('exp-date').value      = exp.date     || '';
    document.getElementById('exp-time').value      = exp.time     || '00:00';
    document.getElementById('exp-category').value  = exp.category || 'Food';
    document.getElementById('exp-is-planned').value = exp.isPlanned ? 'true' : 'false';

    // Тригеримо change для показу transport-fields
    document.getElementById('exp-category').dispatchEvent(new Event('change'));

    if (exp.category === 'Transport') {
        document.getElementById('exp-from-city').value = exp.fromCity || '';
        document.getElementById('exp-to-city').value   = exp.toCity   || '';

        if (exp.transportType) {
            const sel = document.getElementById('exp-transport-type');
            if (sel) sel.value = exp.transportType;
        }

        // Координати
        if (exp.fromLocation?.lat) {
            document.getElementById('exp-from-lat').value = exp.fromLocation.lat;
            document.getElementById('exp-from-lng').value = exp.fromLocation.lng;
        }
        if (exp.toLocation?.lat) {
            document.getElementById('exp-to-lat').value = exp.toLocation.lat;
            document.getElementById('exp-to-lng').value = exp.toLocation.lng;
        }
    }

    if (exp.location?.lat) {
        document.getElementById('exp-city-lat').value  = exp.location.lat;
        document.getElementById('exp-city-lng').value  = exp.location.lng;
        document.getElementById('exp-city-name').value = exp.location.displayName || '';
    }

    // Відновлення карти (з невеликою затримкою)
    setTimeout(() => {
        toggleMiniMap();

        if (miniMap && exp.category === 'Transport') {
            if (exp.fromLocation?.lat) {
                const fl = [exp.fromLocation.lat, exp.fromLocation.lng];
                expFromMarker = L.marker(fl, { icon: createDotIcon('#3498db') }).addTo(miniMap);
                expFromMarker.bindPopup(`<b>🔵 Звідки:</b> ${exp.fromCity}`).openPopup();
                miniMap.setView(fl, 7);
            }
            if (exp.toLocation?.lat) {
                const tl = [exp.toLocation.lat, exp.toLocation.lng];
                expToMarker = L.marker(tl, { icon: createDotIcon('#00c853') }).addTo(miniMap);
                expToMarker.bindPopup(`<b>🟢 Куди:</b> ${exp.toCity}`);
                updateExpRouteLine();
            }
        } else if (miniMap && exp.location?.lat) {
            const lat = parseFloat(exp.location.lat);
            const lng = parseFloat(exp.location.lng);
            miniMap.setView([lat, lng], 15);
            if (miniMapMarker) miniMapMarker.setLatLng([lat, lng]);
            else miniMapMarker = L.marker([lat, lng]).addTo(miniMap);
            miniMapMarker.bindPopup(`<b>${exp.location.displayName || exp.city}</b>`).openPopup();
        }
    }, 300);
};

// Допоміжна функція закриття
function closeExpenseModal() {
    document.getElementById('expense-modal').classList.add('hidden');
    editingExpenseId = null;
    resetMiniMapMarker();

    // Очищуємо транспортні маркери
    if (expFromMarker && miniMap) { miniMap.removeLayer(expFromMarker); expFromMarker = null; }
    if (expToMarker   && miniMap) { miniMap.removeLayer(expToMarker);   expToMarker   = null; }
    if (expRouteLine  && miniMap) { miniMap.removeLayer(expRouteLine);  expRouteLine  = null; }
    currentExpMapBtn = null;

    // Видаляємо кнопки транспортної карти
    document.getElementById('transport-map-btns')?.remove();

    document.getElementById('expense-form').reset();
    document.getElementById('transport-fields').classList.add('hidden');
}

// Закриття модалки
document.getElementById('close-exp-btn').onclick = closeExpenseModal;

// === ВИКОРИСТАННЯ ГЕОЛОКАЦІЇ ===
// === ВИКОРИСТАННЯ ГЕОЛОКАЦІЇ ===
window.useMyGeolocation = async () => {
    const btn = document.getElementById('use-geolocation-btn');
    const originalText = btn.innerHTML;

    if (!navigator.geolocation) {
        alert("Ваш браузер не підтримує геолокацію");
        return;
    }

    btn.innerHTML = "⏳ Отримую...";
    btn.disabled = true;

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 0
            });
        });

        const { latitude, longitude } = position.coords;

        console.log(`📍 Геолокація отримана: ${latitude}, ${longitude}`);

        // Автоматично відкриваємо міні-карту, якщо вона закрита
        const wrapper = document.getElementById('mini-map-wrapper');
        if (wrapper && wrapper.classList.contains('hidden')) {
            toggleMiniMap();
        }

        // Чекаємо трохи, щоб карта встигла відкритись
        await new Promise(r => setTimeout(r, 300));

        if (miniMap) {
            // Центруємо карту і ставимо маркер
            miniMap.setView([latitude, longitude], 16);

            if (miniMapMarker) {
                miniMapMarker.setLatLng([latitude, longitude]);
            } else {
                miniMapMarker = L.marker([latitude, longitude]).addTo(miniMap);
            }

            // Оновлюємо popup
            miniMapMarker.bindPopup(`<b>Моя поточна позиція</b>`).openPopup();
        }

        // Отримуємо нормальну назву місця
        const locationData = await getLocationHierarchy(latitude, longitude);

        // Заповнюємо поля форми
        document.getElementById('exp-city-lat').value = latitude;
        document.getElementById('exp-city-lng').value = longitude;
        document.getElementById('exp-city-name').value = locationData.displayName || "";

    } catch (err) {
        console.error("Geolocation error:", err);
        
        let message = "Не вдалося отримати вашу геолокацію.";
        if (err.code === 1) message = "Доступ до геолокації заборонено.";
        if (err.code === 2) message = "Місцезнаходження недоступне.";
        if (err.code === 3) message = "Час запиту вичерпано.";

        alert(message);   // залишаємо тільки при помилці
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

async function centerMapOnUserCountry() {
    try {
        // Спроба 1: через геолокацію (найкраще)
        if (navigator.geolocation) {
            const pos = await new Promise((res, rej) => 
                navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
            );
            if (map) map.setView([pos.coords.latitude, pos.coords.longitude], 6);
            return;
        }

        // Спроба 2: через IP (запасний варіант)
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        
        if (data.latitude && data.longitude) {
            if (map) map.setView([data.latitude, data.longitude], 5);
        }
    } catch (e) {
        console.log("Не вдалося визначити локацію користувача");
        // fallback — Україна / Європа
        if (map) map.setView([48.5, 31.5], 5);
    }
}

// Очищення маркера на міні-карті
function resetMiniMapMarker() {
    if (miniMapMarker && miniMap) {
        miniMap.removeLayer(miniMapMarker);
        miniMapMarker = null;
    }
    
    // Також очищуємо приховані поля локації
    const latField = document.getElementById('exp-city-lat');
    const lngField = document.getElementById('exp-city-lng');
    const nameField = document.getElementById('exp-city-name');
    
    if (latField) latField.value = "";
    if (lngField) lngField.value = "";
    if (nameField) nameField.value = "";
}

// ЗАМІНИТИ існуючу closeWalkingModal() на цю:
function closeWalkingModal() {
    document.getElementById('walking-modal').classList.add('hidden');
    document.getElementById('walking-form').reset();

    document.getElementById('walk-end-group')?.classList.remove('hidden');

    const toggleBtn = document.getElementById('toggle-endpoint-btn');
    if (toggleBtn) {
        toggleBtn.classList.add('active');
        toggleBtn.textContent = '✓ Є кінцева точка (маршрут з А в Б)';
    }

    const submitBtn = document.getElementById('walk-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    // Ховаємо карту
    document.getElementById('walking-map-wrapper')?.classList.add('hidden');
    currentWalkMapBtn = null;
    walkingMap?._geoLocated && (walkingMap._geoLocated = false);

    // Очищуємо маркери та лінію
    if (walkingMap) {
        if (walkStartMarker) { walkingMap.removeLayer(walkStartMarker); walkStartMarker = null; }
        if (walkEndMarker)   { walkingMap.removeLayer(walkEndMarker);   walkEndMarker   = null; }
        if (walkRouteLine)   { walkingMap.removeLayer(walkRouteLine);   walkRouteLine   = null; }
    }

    // Очищуємо поля
    ['walk-start-name','walk-start-lat','walk-start-lng',
     'walk-end-name','walk-end-lat','walk-end-lng'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

function resetWalkingForm() {
    const form = document.getElementById('walking-form');
    if (form) form.reset();

    const walkEndDiv = document.getElementById('walk-end');
    if (walkEndDiv) walkEndDiv.classList.add('hidden');

    const checkbox = document.getElementById('has-end-point');
    if (checkbox) checkbox.checked = true;

    // Очищення полів
    const fields = ['walk-start-name','walk-start-lat','walk-start-lng',
                    'walk-end-name','walk-end-lat','walk-end-lng'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

// ============================================================
// === WALKING HANDLERS — всі обробники форми прогулянок ===
// ============================================================

let walkingMap = null;
let walkingMapMarker = null;

// Допоміжна: отримуємо назву за координатами (спрощена версія)
async function fetchLocationName(lat, lng) {
    try {
        const res = await fetch(
            `https://muddy-resonance-2672.kossakova-slava-v.workers.dev/?lat=${lat}&lon=${lng}&zoom=18`
        );
        const data = await res.json();
        const addr    = data.address    || {};
        const details = data.namedetails || {};
        return details['name:uk'] || addr.road || addr.city ||
               addr.town || addr.village ||
               `Точка (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    } catch {
        return `Точка (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    }
}

// Допоміжна: оновлює або перемалює лінію між двома точками
function updateWalkRouteLine() {
    if (walkRouteLine && walkingMap) {
        walkingMap.removeLayer(walkRouteLine);
        walkRouteLine = null;
    }
    if (!walkingMap || !walkStartMarker || !walkEndMarker) return;

    walkRouteLine = L.polyline(
        [walkStartMarker.getLatLng(), walkEndMarker.getLatLng()],
        { color: '#00ff88', weight: 2, dashArray: '8, 10', opacity: 0.85 }
    ).addTo(walkingMap);
}

function getOrCreateWalkingMapWrapper() {
    let wrapper = document.getElementById('walking-map-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'walking-map-wrapper';
        wrapper.innerHTML = `
            <div id="walking-map"
                 style="height:300px;margin:10px 0;border-radius:12px;
                        border:2px solid #00ff88;cursor:crosshair;z-index:100;"></div>
            <p id="walk-map-hint"
               style="font-size:0.85em;color:#00ff88;text-align:center;margin-bottom:6px;">
               Клікніть — поставить точку
            </p>`;
        document.getElementById('walk-end-group')?.after(wrapper);
    }
    return wrapper;
}

function openWalkingMap(forStart) {
    const btnId  = forStart ? 'select-start-on-map' : 'select-end-on-map';
    const wrapper = getOrCreateWalkingMapWrapper();
    const isOpen  = !wrapper.classList.contains('hidden');

    // Той самий рядок натиснули вдруге → закрити
    if (isOpen && currentWalkMapBtn === btnId) {
        wrapper.classList.add('hidden');
        currentWalkMapBtn = null;
        return;
    }

    currentWalkMapBtn = btnId;
    selectingStart    = forStart;
    wrapper.classList.remove('hidden');

    // Підказка
    const hint = document.getElementById('walk-map-hint');
    if (hint) hint.textContent = forStart
        ? '🔵 Клікніть на карті — обере ПОЧАТКОВУ точку'
        : '🟢 Клікніть на карті — обере КІНЦЕВУ точку';

    if (!walkingMap) {
        walkingMap = L.map('walking-map').setView([48.3, 31.1], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(walkingMap);
    }

    setTimeout(() => {
        walkingMap.invalidateSize();

        // Центруємо по геолокації (один раз)
        if (navigator.geolocation && !walkingMap._geoLocated) {
            navigator.geolocation.getCurrentPosition(pos => {
                walkingMap.setView([pos.coords.latitude, pos.coords.longitude], 13);
                walkingMap._geoLocated = true;
            }, () => {});
        }

        walkingMap.off('click');
        walkingMap.on('click', async (e) => {
            const { lat, lng } = e.latlng;
            const name = await fetchLocationName(lat, lng);

            if (selectingStart) {
                // Синій маркер — початок
                if (walkStartMarker) walkStartMarker.setLatLng([lat, lng]);
                else walkStartMarker = L.marker([lat, lng], {
                    icon: createDotIcon('#3498db')
                }).addTo(walkingMap);
                walkStartMarker.bindPopup(`<b>🔵 Початок</b><br>${name}`).openPopup();

                document.getElementById('walk-start-name').value = name;
                document.getElementById('walk-start-lat').value  = lat;
                document.getElementById('walk-start-lng').value  = lng;
            } else {
                // Зелений маркер — кінець
                if (walkEndMarker) walkEndMarker.setLatLng([lat, lng]);
                else walkEndMarker = L.marker([lat, lng], {
                    icon: createDotIcon('#00c853')
                }).addTo(walkingMap);
                walkEndMarker.bindPopup(`<b>🟢 Кінець</b><br>${name}`).openPopup();

                document.getElementById('walk-end-name').value = name;
                document.getElementById('walk-end-lat').value  = lat;
                document.getElementById('walk-end-lng').value  = lng;
            }

            updateWalkRouteLine();
            updateWalkSubmitButton();
        });
    }, 200);
}

// --- Оновлений setupWalkingHandlers ---
function setupWalkingHandlers() {
    // Toggle кінцевої точки
    document.getElementById('toggle-endpoint-btn')?.addEventListener('click', () => {
        const btn      = document.getElementById('toggle-endpoint-btn');
        const endGroup = document.getElementById('walk-end-group');
        const isActive = btn.classList.contains('active');

        if (isActive) {
            btn.classList.remove('active');
            btn.textContent = '+ Додати кінцеву точку (маршрут з А в Б)';
            endGroup?.classList.add('hidden');
            // Ховаємо/прибираємо зелений маркер і лінію
            if (walkEndMarker && walkingMap) { walkingMap.removeLayer(walkEndMarker); walkEndMarker = null; }
            if (walkRouteLine && walkingMap) { walkingMap.removeLayer(walkRouteLine); walkRouteLine = null; }
        } else {
            btn.classList.add('active');
            btn.textContent = '✓ Є кінцева точка (маршрут з А в Б)';
            endGroup?.classList.remove('hidden');
        }
    });

    // Карта — початок (toggle)
    document.getElementById('select-start-on-map')?.addEventListener('click', e => {
        e.preventDefault();
        openWalkingMap(true);
    });

    // Карта — кінець (toggle)
    document.getElementById('select-end-on-map')?.addEventListener('click', e => {
        e.preventDefault();
        openWalkingMap(false);
    });

    // Геолокація — початок
    document.getElementById('use-geolocation-start')?.addEventListener('click', async e => {
        e.preventDefault();
        await useGeolocationForWalking(true);
    });

    // Геолокація — кінець
    document.getElementById('use-geolocation-end')?.addEventListener('click', async e => {
        e.preventDefault();
        await useGeolocationForWalking(false);
    });

    // Активуємо кнопку "Зберегти" при введенні кроків/км
    ['walk-steps', 'walk-km'].forEach(id =>
        document.getElementById(id)?.addEventListener('input', updateWalkSubmitButton)
    );
}

// --- Карта для прогулянок (окрема від карти витрат) ---


// --- Геолокація для прогулянок ---
async function useGeolocationForWalking(isStart) {
    const btnId = isStart ? 'use-geolocation-start' : 'use-geolocation-end';
    const btn = document.getElementById(btnId);
    if (btn) { btn.innerHTML = '⏳ Отримую...'; btn.disabled = true; }

    if (!navigator.geolocation) {
        alert("Браузер не підтримує геолокацію");
        if (btn) { btn.innerHTML = '📍 Моя геолокація'; btn.disabled = false; }
        return;
    }

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true, timeout: 8000, maximumAge: 0
            });
        });

        const { latitude: lat, longitude: lng } = position.coords;

        // Отримуємо назву
        let finalName = `Точка (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        try {
            const proxyUrl = `https://muddy-resonance-2672.kossakova-slava-v.workers.dev/?lat=${lat}&lon=${lng}&zoom=18`;
            const res = await fetch(proxyUrl);
            const data = await res.json();
            const addr = data.address || {};
            const details = data.namedetails || {};
            finalName =
                details['name:uk'] ||
                addr.road ||
                addr.city ||
                addr.town ||
                addr.village ||
                finalName;
        } catch (e) {
            console.warn("Nominatim error:", e);
        }

        if (isStart) {
            document.getElementById('walk-start-name').value = finalName;
            document.getElementById('walk-start-lat').value = lat;
            document.getElementById('walk-start-lng').value = lng;
        } else {
            document.getElementById('walk-end-name').value = finalName;
            document.getElementById('walk-end-lat').value = lat;
            document.getElementById('walk-end-lng').value = lng;
        }

        updateWalkSubmitButton();

    } catch (err) {
        let msg = "Не вдалося отримати геолокацію.";
        if (err.code === 1) msg = "Доступ до геолокації заборонено.";
        if (err.code === 3) msg = "Час запиту вичерпано.";
        alert(msg);
    } finally {
        if (btn) { btn.innerHTML = '📍 Моя геолокація'; btn.disabled = false; }
    }
}

// --- Вмикає/вимикає кнопку "Зберегти" ---
function updateWalkSubmitButton() {
    const submitBtn = document.getElementById('walk-submit-btn');
    if (!submitBtn) return;

    const startLat = document.getElementById('walk-start-lat')?.value;
    const steps    = document.getElementById('walk-steps')?.value;
    const km       = document.getElementById('walk-km')?.value;

    // Потрібна хоча б початкова точка + кроки або км
    submitBtn.disabled = !(startLat && (steps || km));
}

// ============================================================
// === EXPENSE FORM — збереження витрат ===
// ============================================================
// Допоміжна: переривчаста лінія між маркерами витрат
function updateExpRouteLine() {
    if (expRouteLine && miniMap) { miniMap.removeLayer(expRouteLine); expRouteLine = null; }
    if (!miniMap || !expFromMarker || !expToMarker) return;

    expRouteLine = L.polyline(
        [expFromMarker.getLatLng(), expToMarker.getLatLng()],
        { color: '#3498db', weight: 2, dashArray: '8, 10', opacity: 0.85 }
    ).addTo(miniMap);

    // Підганяємо масштаб, щоб обидві точки були видні
    miniMap.fitBounds(
        L.latLngBounds([expFromMarker.getLatLng(), expToMarker.getLatLng()]),
        { padding: [40, 40] }
    );
}

function setupExpenseForm() {
    const catSelect = document.getElementById('exp-category');

    // Показуємо/ховаємо поля транспорту + кнопки карти для транспорту
    catSelect?.addEventListener('change', function () {
        const tf = document.getElementById('transport-fields');
        const isTransport = this.value === 'Transport';
        tf?.classList.toggle('hidden', !isTransport);
    document.getElementById('transport-fields')?.classList.toggle('hidden', !isTransport);

    // Очищення старих маркерів при переході
    if (miniMap) {
        if (expFromMarker) { miniMap.removeLayer(expFromMarker); expFromMarker = null; }
        if (expToMarker)   { miniMap.removeLayer(expToMarker);   expToMarker = null; }
        if (expRouteLine)  { miniMap.removeLayer(expRouteLine);  expRouteLine = null; }
    }
    resetMiniMapMarker(); // основний маркер теж
        // Кнопки вибору на карті для транспорту (вставляємо один раз)
        if (isTransport && !document.getElementById('transport-map-btns')) {
            const btns = document.createElement('div');
            btns.id = 'transport-map-btns';
            btns.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
            btns.innerHTML = `
                <button type="button" id="select-from-map-btn" class="btn btn-secondary" style="flex:1;">
                    🔵 Звідки на карті
                </button>
                <button type="button" id="select-to-map-btn" class="btn btn-secondary" style="flex:1;">
                    🟢 Куди на карті
                </button>`;
            tf?.after(btns);

            // Обробники
            document.getElementById('select-from-map-btn').addEventListener('click', e => {
                e.preventDefault();
                selectingExpFrom = true;
                openExpenseTransportMap();
            });
            document.getElementById('select-to-map-btn').addEventListener('click', e => {
                e.preventDefault();
                selectingExpFrom = false;
                openExpenseTransportMap();
            });
        }
    });

    const timeBtn = document.getElementById('use-current-time-btn');
    if (timeBtn) {
        timeBtn.addEventListener('click', () => {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            document.getElementById('exp-time').value = `${hours}:${minutes}`;
        });
    }

    // Клік на звичайній карті (не-транспортний режим) — залишаємо як є
    // Обробник submit форми
document.getElementById('expense-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const category      = document.getElementById('exp-category').value;
    const title         = document.getElementById('exp-title').value.trim();
    const amount        = parseFloat(document.getElementById('exp-amount').value);
    const currency      = document.getElementById('exp-currency').value;
    const date          = document.getElementById('exp-date').value;
    const time          = document.getElementById('exp-time').value || '00:00';
    const isPlanned     = document.getElementById('exp-is-planned').value === 'true';
    const transportType = document.getElementById('exp-transport-type')?.value || 'plane';  

    const fromCity = document.getElementById('exp-from-city').value.trim();
    const toCity   = document.getElementById('exp-to-city').value.trim();
    const fromLat  = parseFloat(document.getElementById('exp-from-lat')?.value);
    const fromLng  = parseFloat(document.getElementById('exp-from-lng')?.value);
    const toLat    = parseFloat(document.getElementById('exp-to-lat')?.value);
    const toLng    = parseFloat(document.getElementById('exp-to-lng')?.value);

    const lat      = parseFloat(document.getElementById('exp-city-lat').value);
    const lng      = parseFloat(document.getElementById('exp-city-lng').value);
    const cityName = document.getElementById('exp-city-name').value.trim();

    const dateTimeStr = `${date}T${time}`;
        const fullDate = new Date(dateTimeStr);

    // Основна локація
    let location = null;
    if (!isNaN(lat) && lat !== 0) {
        try { location = await getLocationHierarchy(lat, lng); }
        catch { location = { displayName: cityName, lat, lng, country: 'Unknown' }; }
    }

    // Локації відправлення/прибуття для транспорту
    let fromLocation = null;
    let toLocation   = null;

    if (category === 'Transport') {
        if (!isNaN(fromLat) && fromLat !== 0) {
            try { fromLocation = await getLocationHierarchy(fromLat, fromLng); }
            catch { fromLocation = { displayName: fromCity, lat: fromLat, lng: fromLng }; }
        } else if (fromCity) {
            // Геокодування по назві якщо немає координат
            fromLocation = { displayName: fromCity };
        }

        if (!isNaN(toLat) && toLat !== 0) {
            try { toLocation = await getLocationHierarchy(toLat, toLng); }
            catch { toLocation = { displayName: toCity, lat: toLat, lng: toLng }; }
        } else if (toCity) {
            toLocation = { displayName: toCity };
        }

        // Якщо немає основної локації — беремо fromLocation
        if (!location && fromLocation?.lat) location = fromLocation;
    }

    const expenseData = {
        tripId, category, title, amount, currency, date, time, datetime: dateTimeStr, isPlanned,
        city:          location?.displayName || cityName || fromCity || '—',
        location:      location   || null,
        transportType: category === 'Transport' ? transportType : null,
        fromCity:      category === 'Transport' ? fromCity      : null,
        toCity:        category === 'Transport' ? toCity        : null,
        fromLocation:  category === 'Transport' ? fromLocation  : null,
        toLocation:    category === 'Transport' ? toLocation    : null,
    };

    try {
        if (editingExpenseId) {
            await updateDoc(doc(db, "expenses", editingExpenseId), expenseData);
        } else {
            await addDoc(collection(db, "expenses"), expenseData);
        }
        closeExpenseModal();
        loadAllData();
    } catch (err) {
        console.error("Помилка збереження:", err);
        alert("Помилка збереження. Спробуйте ще раз.");
    }
});
}

// Відкриває/перемикає міні-карту в режимі транспорту (два маркери)
let currentExpMapBtn = null;

function openExpenseTransportMap() {
    const btnId = selectingExpFrom ? 'select-from-map-btn' : 'select-to-map-btn';

    // Відкриваємо карту якщо закрита
const wrapper = document.getElementById('mini-map-wrapper');
    if (wrapper?.classList.contains('hidden')) toggleMiniMap('transport');

    // Та сама кнопка → закрити
    if (currentExpMapBtn === btnId &&
        wrapper && !wrapper.classList.contains('hidden')) {
        toggleMiniMap();
        currentExpMapBtn = null;
        return;
    }
    currentExpMapBtn = btnId;

    if (!miniMap) return;

    // Підказка
    const hint = document.getElementById('map-selection-hint');
    if (hint) hint.textContent = selectingExpFrom
        ? '🔵 Клікніть — місто ВІДПРАВЛЕННЯ'
        : '🟢 Клікніть — місто ПРИБУТТЯ';

    miniMap.off('click');
    miniMap.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        const name = await fetchLocationName(lat, lng);

        if (selectingExpFrom) {
            // Синій маркер — звідки
            if (expFromMarker) expFromMarker.setLatLng([lat, lng]);
            else expFromMarker = L.marker([lat, lng], {
                icon: createDotIcon('#3498db')
            }).addTo(miniMap);
            expFromMarker.bindPopup(`<b>🔵 Звідки:</b> ${name}`).openPopup();

            document.getElementById('exp-from-city').value = name;
            document.getElementById('exp-from-lat').value  = lat;
            document.getElementById('exp-from-lng').value  = lng;

            // Основна локація = місто відправлення
            document.getElementById('exp-city-lat').value  = lat;
            document.getElementById('exp-city-lng').value  = lng;
            document.getElementById('exp-city-name').value = name;
        } else {
            // Зелений маркер — куди
            if (expToMarker) expToMarker.setLatLng([lat, lng]);
            else expToMarker = L.marker([lat, lng], {
                icon: createDotIcon('#00c853')
            }).addTo(miniMap);
            expToMarker.bindPopup(`<b>🟢 Куди:</b> ${name}`).openPopup();

            document.getElementById('exp-to-city').value = name;
            document.getElementById('exp-to-lat').value  = lat;
            document.getElementById('exp-to-lng').value  = lng;
        }

        updateExpRouteLine();
    });
}

// ============================================================
// === WALKING FORM — збереження прогулянки ===
// ============================================================
function setupWalkingForm() {
    document.getElementById('walking-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const date  = document.getElementById('walk-date').value;
        const steps = parseInt(document.getElementById('walk-steps').value) || 0;
        const km    = parseFloat(document.getElementById('walk-km').value) || 0;

        const startLat  = parseFloat(document.getElementById('walk-start-lat').value);
        const startLng  = parseFloat(document.getElementById('walk-start-lng').value);
        const startName = document.getElementById('walk-start-name').value;

        const hasEndToggle = document.getElementById('toggle-endpoint-btn')?.classList.contains('active');
        const endLat  = parseFloat(document.getElementById('walk-end-lat').value);
        const endLng  = parseFloat(document.getElementById('walk-end-lng').value);
        const endName = document.getElementById('walk-end-name').value;

        // Отримуємо ієрархію для початкової точки
        let startLocation = null;
        if (!isNaN(startLat) && !isNaN(startLng) && startLat !== 0) {
            try {
                startLocation = await getLocationHierarchy(startLat, startLng);
            } catch {
                startLocation = { displayName: startName, lat: startLat, lng: startLng };
            }
        }

        // Кінцева точка (якщо є)
        let endLocation = null;
        const hasEndPoint = hasEndToggle && !isNaN(endLat) && endLat !== 0;
        if (hasEndPoint) {
            try {
                endLocation = await getLocationHierarchy(endLat, endLng);
            } catch {
                endLocation = { displayName: endName, lat: endLat, lng: endLng };
            }
        }

        const walkingData = {
            tripId,
            date,
            steps,
            km,
            city: startLocation?.displayName || startName || '—',
            startLocation: startLocation || null,
            hasEndPoint: !!endLocation,
            endLocation: endLocation || null,
        };

        try {
            await addDoc(collection(db, "walking"), walkingData);
            closeWalkingModal();
            loadAllData();
        } catch (err) {
            console.error("Помилка збереження прогулянки:", err);
            alert("Помилка збереження. Спробуйте ще раз.");
        }
    });
}
// ============================================================
// === ДОПОМІЖНІ: іконки та прапори ===
// ============================================================

function createDotIcon(color, emoji = '') {
    const inner = emoji
        ? `<span style="font-size:16px;line-height:28px;">${emoji}</span>`
        : `<div style="width:12px;height:12px;background:${color};
               border-radius:50%;border:2px solid white;margin:auto;margin-top:8px;"></div>`;
    return L.divIcon({
        html: `<div style="width:28px;height:28px;background:${color};border-radius:50%;
                   border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5);
                   display:flex;align-items:center;justify-content:center;font-size:14px;">
                   ${emoji || ''}
               </div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
}

function getCountryFlag(countryInput) {
    if (!countryInput || typeof countryInput !== 'string') return '🌍';

    const input = countryInput.trim();

    // === ПРЯМІ КОДИ КРАЇН (найнадійніший варіант) ===
    const codeMap = {
        'UA': '🇺🇦', 'UKR': '🇺🇦',
        'PL': '🇵🇱', 'POL': '🇵🇱',
        'PT': '🇵🇹', 'PRT': '🇵🇹',
        'ES': '🇪🇸', 'ESP': '🇪🇸',
        'FR': '🇫🇷', 'FRA': '🇫🇷',
        'DE': '🇩🇪', 'DEU': '🇩🇪',
        'AT': '🇦🇹', 'AUT': '🇦🇹',
        'HU': '🇭🇺', 'HUN': '🇭🇺',
        'CZ': '🇨🇿', 'CZE': '🇨🇿',
        'SK': '🇸🇰', 'SVK': '🇸🇰',
        'RO': '🇷🇴', 'ROU': '🇷🇴',
        'BG': '🇧🇬', 'BGR': '🇧🇬',
        'HR': '🇭🇷', 'HRV': '🇭🇷',
        'SI': '🇸🇮', 'SVN': '🇸🇮',
        'RS': '🇷🇸', 'SRB': '🇷🇸',
        'ME': '🇲🇪', 'MNE': '🇲🇪',
        'IT': '🇮🇹', 'ITA': '🇮🇹',
        'GR': '🇬🇷', 'GRC': '🇬🇷',
        'TR': '🇹🇷', 'TUR': '🇹🇷',
        'GB': '🇬🇧', 'UK': '🇬🇧',
        'IE': '🇮🇪',
        'NL': '🇳🇱',
        'BE': '🇧🇪',
        'LU': '🇱🇺',
        'CH': '🇨🇭',
        'SE': '🇸🇪',
        'NO': '🇳🇴',
        'FI': '🇫🇮',
        'DK': '🇩🇰',
        'EE': '🇪🇪',
        'LV': '🇱🇻',
        'LT': '🇱🇹',
        'BY': '🇧🇾',
        'MD': '🇲🇩',
        'US': '🇺🇸', 'USA': '🇺🇸',
        'CA': '🇨🇦',
        'JP': '🇯🇵',
        'CN': '🇨🇳',
        'KR': '🇰🇷',
        'IL': '🇮🇱',
        'AE': '🇦🇪',
        'EG': '🇪🇬',
        'MA': '🇲🇦',
        'MT': '🇲🇹',
        'CY': '🇨🇾',
        'IS': '🇮🇸',
        'AL': '🇦🇱',
        'MK': '🇲🇰',
        // Додаткові популярні
        'MX': '🇲🇽',
        'BR': '🇧🇷',
        'IN': '🇮🇳',
        'AU': '🇦🇺',
        'NZ': '🇳🇿',
    };

    // === МАПІНГ ПОВНИХ НАЗВ ===
    const nameMap = {
        // Українські назви
        'Україна': '🇺🇦',
        'Польща': '🇵🇱',
        'Портуґалія': '🇵🇹',
        'Іспанія': '🇪🇸',
        'Франція': '🇫🇷',
        'Німеччина': '🇩🇪',
        'Австрія': '🇦🇹',
        'Угорщина': '🇭🇺',
        'Чехія': '🇨🇿',
        'Словаччина': '🇸🇰',
        'Румунія': '🇷🇴',
        'Болгарія': '🇧🇬',
        'Хорватія': '🇭🇷',
        'Словенія': '🇸🇮',
        'Сербія': '🇷🇸',
        'Чорногорія': '🇲🇪',
        'Італія': '🇮🇹',
        'Греція': '🇬🇷',
        'Туреччина': '🇹🇷',
        'Великобританія': '🇬🇧',
        'Ірландія': '🇮🇪',
        'Нідерланди': '🇳🇱',
        'Бельгія': '🇧🇪',
        'Люксембург': '🇱🇺',
        'Швейцарія': '🇨🇭',
        'Швеція': '🇸🇪',
        'Норвегія': '🇳🇴',
        'Фінляндія': '🇫🇮',
        'Данія': '🇩🇰',
        'Естонія': '🇪🇪',
        'Латвія': '🇱🇻',
        'Литва': '🇱🇹',
        'Білорусь': '🇧🇾',
        'Молдова': '🇲🇩',

        // Англійські назви від Nominatim
        'Ukraine': '🇺🇦',
        'Poland': '🇵🇱',
        'Portugal': '🇵🇹',
        'Spain': '🇪🇸',
        'France': '🇫🇷',
        'Germany': '🇩🇪',
        'Austria': '🇦🇹',
        'Hungary': '🇭🇺',
        'Czech Republic': '🇨🇿',
        'Czechia': '🇨🇿',
        'Slovakia': '🇸🇰',
        'Romania': '🇷🇴',
        'Bulgaria': '🇧🇬',
        'Croatia': '🇭🇷',
        'Slovenia': '🇸🇮',
        'Serbia': '🇷🇸',
        'Montenegro': '🇲🇪',
        'Italy': '🇮🇹',
        'Greece': '🇬🇷',
        'Turkey': '🇹🇷',
        'United Kingdom': '🇬🇧',
        'UK': '🇬🇧',
        'Great Britain': '🇬🇧',
        'Ireland': '🇮🇪',
        'Netherlands': '🇳🇱',
        'Belgium': '🇧🇪',
        'Luxembourg': '🇱🇺',
        'Switzerland': '🇨🇭',
        'Sweden': '🇸🇪',
        'Norway': '🇳🇴',
        'Finland': '🇫🇮',
        'Denmark': '🇩🇰',
        'Estonia': '🇪🇪',
        'Latvia': '🇱🇻',
        'Lithuania': '🇱🇹',
        'Belarus': '🇧🇾',
        'Moldova': '🇲🇩',
        'United States': '🇺🇸',
        'United States of America': '🇺🇸',
        'USA': '🇺🇸',
        'Canada': '🇨🇦',
        'Japan': '🇯🇵',
        'China': '🇨🇳',
        'South Korea': '🇰🇷',
        'Israel': '🇮🇱',
        'United Arab Emirates': '🇦🇪',
        'Egypt': '🇪🇬',
        'Morocco': '🇲🇦',
        'Malta': '🇲🇹',
        'Cyprus': '🇨🇾',
        'Iceland': '🇮🇸',
        'Albania': '🇦🇱',
        'North Macedonia': '🇲🇰',
    };

    // 1. Спроба по коду
    if (codeMap[input.toUpperCase()]) {
        return codeMap[input.toUpperCase()];
    }

    // 2. Спроба по повній назві
    if (nameMap[input]) {
        return nameMap[input];
    }

    // 3. Якщо нічого не знайдено — повертаємо глобус
    return '🌍';
}

// ====================== НОТАТКИ ======================
function renderNotesTable() {
    const tbody = document.querySelector('#notes-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    currentNotes
        .sort((a, b) => new Date(b.datetime || b.date) - new Date(a.datetime || a.date))
        .forEach(note => {
            const dt = note.datetime ? new Date(note.datetime) : new Date(note.date || note.datetime);
            const dateStr = dt.toLocaleDateString('uk-UA');
            const timeStr = note.time || dt.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

            const text = note.text || '';
            const shortText = text.length > 100 ? text.substring(0, 100) + '...' : text;

            const loc = note.location?.displayName || note.city || '—';

            const row = `
                <tr>
                    <td style="white-space:nowrap; line-height:1.4;">
                        ${dateStr}<br>
                        <small style="color:#888;">${timeStr}</small>
                    </td>
                    <td>${loc}</td>
                    <td class="note-text-cell">${shortText}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn-edit-small" onclick="viewNote('${note.id}')" title="Відкрити">👁️</button>
                        <button class="btn-edit-small" onclick="editNote('${note.id}')" title="Редагувати">✏️</button>
                        <button class="btn-del" onclick="deleteNote('${note.id}')" title="Видалити">❌</button>
                    </td>
                </tr>`;
            tbody.innerHTML += row;
        });
}

window.viewNote = (id) => {
    const note = currentNotes.find(n => n.id === id);
    if (!note) return;

    const dt = note.datetime
        ? new Date(note.datetime)
        : new Date(note.date);

    const dateStr = dt.toLocaleDateString('uk-UA');

    const timeStr =
        note.time ||
        dt.toLocaleTimeString('uk-UA', {
            hour: '2-digit',
            minute: '2-digit'
        });

    document.getElementById('view-note-date').innerText = dateStr;
    document.getElementById('view-note-time').innerText = timeStr;

    document.getElementById('view-note-location').innerText =
        note.location?.displayName ||
        note.city ||
        'Без локації';

    document.getElementById('view-note-text').innerText =
        note.text || '';

    document
        .getElementById('view-note-modal')
        .classList.remove('hidden');
};

window.closeViewNote = () => {
    document
        .getElementById('view-note-modal')
        .classList.add('hidden');
    document
    .getElementById('view-note-modal')
    .addEventListener('click', (e) => {
        if (e.target.id === 'view-note-modal') {
            closeViewNote();
        }
    });
};

window.deleteNote = async (id) => {
    if (confirm("Видалити нотатку?")) {
        await deleteDoc(doc(db, "notes", id));
        loadAllData();
    }
};

window.editNote = async (id) => {
    editingNoteId = id;
    const note = currentNotes.find(n => n.id === id);

    document.getElementById('note-modal-title').innerText = id ? "Редагувати нотатку" : "Додати нотатку";
    document.getElementById('note-modal').classList.remove('hidden');

    if (note) {
        document.getElementById('note-date').value = note.date || '';
        document.getElementById('note-time').value = note.time || '00:00';
        document.getElementById('note-text').value = note.text || '';
        document.getElementById('note-city-name').value = note.location?.displayName || note.city || '';

        if (note.location?.lat) {
            document.getElementById('note-lat').value = note.location.lat;
            document.getElementById('note-lng').value = note.location.lng;
        }
    } else {
        // Нова нотатка
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('note-date').value = today;
        document.getElementById('note-time').value = '00:00';
        document.getElementById('note-text').value = '';
        document.getElementById('note-city-name').value = '';
    }
};

// Закриття модалки нотаток
document.getElementById('close-note-btn').onclick = () => {
    document.getElementById('note-modal').classList.add('hidden');
    editingNoteId = null;
};

function getOrCreateNoteMapWrapper() {
    let wrapper = document.getElementById('note-map-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'note-map-wrapper';
        wrapper.innerHTML = `
            <div id="note-map" style="height:300px; margin:10px 0; border-radius:12px; border:2px solid #00ff88; cursor:crosshair;"></div>
            <p style="font-size:0.85em; color:#00ff88; text-align:center; margin:6px 0;">
                Клікніть на карті, щоб обрати місце
            </p>`;
        document.getElementById('note-city-name').parentElement.after(wrapper);
    }
    return wrapper;
}

function openNoteMap() {
    // 1. Пошук обгортки
    let wrapper = document.getElementById('note-map-wrapper');
    
    if (!wrapper) {
        // Створюємо, якщо ще не існує
        wrapper = getOrCreateNoteMapWrapper();
        wrapper.classList.remove('hidden');
    } else {
        // Перемикаємо видимість, якщо вже є
        wrapper.classList.toggle('hidden');
    }

    // 2. Якщо карту сховали — зупиняємо виконання
    if (wrapper.classList.contains('hidden')) return;

    // 3. Ініціалізація карти (виконується лише ОДИН раз за весь час)
    if (!noteMap) {
        noteMap = L.map('note-map').setView([48.3, 31.1], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(noteMap);

        // Обробка кліку на карті
        noteMap.on('click', async (e) => {
            const { lat, lng } = e.latlng;

            // Використовуємо переміщення замість видалення/створення
            if (noteMarker) {
                noteMarker.setLatLng([lat, lng]);
            } else {
                noteMarker = L.marker([lat, lng], {
                    icon: createPinIcon('#db348a')
                }).addTo(noteMap);
            }

            // Отримуємо назву та оновлюємо поля
            const name = await fetchLocationName(lat, lng);
            
            document.getElementById('note-city-name').value = name;
            document.getElementById('note-lat').value = lat;
            document.getElementById('note-lng').value = lng;

            // Оновлюємо поп-ап
            noteMarker.bindPopup(`<b>📍 ${name}</b>`).openPopup();
        });
    }

    // 4. Оновлення розмірів (важливо при відкритті hidden-блоків)
    // Використовуємо подвійний requestAnimationFrame або setTimeout
    requestAnimationFrame(() => {
        setTimeout(() => {
            noteMap.invalidateSize();
        }, 10);
    });
}

function createPinIcon(color) {
    return L.divIcon({
        className: 'custom-pin-wrapper',
        // Вказуємо точку, яка має точно вказувати на координати [x, y]
        // Для іконки шириною 24 і висотою 32 це [12, 32]
        iconSize: [24, 32],
        iconAnchor: [12, 32], 
        popupAnchor: [0, -30],
        html: `
            <svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="${color}"/>
                <circle cx="12" cy="12" r="5" fill="white"/>
            </svg>
        `
    });
}

function setupMapEvents() {
    noteMap.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        if (noteMarker) noteMap.removeLayer(noteMarker);

        noteMarker = L.marker([lat, lng], {
            icon: createDotIcon('#9c27b0', '📝')
        }).addTo(noteMap);

        const name = await fetchLocationName(lat, lng);
        document.getElementById('note-city-name').value = name;
        document.getElementById('note-lat').value = lat;
        document.getElementById('note-lng').value = lng;

        noteMarker.bindPopup(`<b>📍 ${name}</b>`).openPopup();
    });
}

function initNoteMap() {
    if (!noteMap) {
        noteMap = L.map('note-map').setView([48.3, 31.1], 6);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
            .addTo(noteMap);
    }

    requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        noteMap.invalidateSize();
    });
});

    noteMap.off('click');
    noteMap.on('click', async (e) => {
        const { lat, lng } = e.latlng;

        if (noteMarker) noteMap.removeLayer(noteMarker);

        noteMarker = L.marker([lat, lng], {
            icon: createDotIcon('#9c27b0', '📝')
        }).addTo(noteMap);

        const name = await fetchLocationName(lat, lng);

        document.getElementById('note-city-name').value = name;
        document.getElementById('note-lat').value = lat;
        document.getElementById('note-lng').value = lng;

        noteMarker.bindPopup(`<b>📍 ${name}</b>`).openPopup();
    });
}

// Ініціалізація обробників нотаток
function setupNoteForm() {
    const form = document.getElementById('note-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const date = document.getElementById('note-date').value;
        const time = document.getElementById('note-time').value || '00:00';
        const text = document.getElementById('note-text').value.trim();
        const cityName = document.getElementById('note-city-name').value.trim();
        const lat = parseFloat(document.getElementById('note-lat').value);
        const lng = parseFloat(document.getElementById('note-lng').value);

        let location = null;
        if (!isNaN(lat) && lat !== 0) {
            try {
                location = await getLocationHierarchy(lat, lng);
            } catch {
                location = { displayName: cityName || "Невідоме місце", lat, lng };
            }
        }

        const noteData = {
            tripId,
            date,
            time,
            datetime: `${date}T${time}`,
            text,
            city: location?.displayName || cityName || '—',
            location: location || null
        };

        try {
            if (editingNoteId) {
                await updateDoc(doc(db, "notes", editingNoteId), noteData);
            } else {
                await addDoc(collection(db, "notes"), noteData);
            }
            closeNoteModal();
            loadAllData();
        } catch (err) {
            console.error(err);
            alert("Помилка збереження нотатки");
        }
    });
}

function closeNoteModal() {
    document.getElementById('note-modal').classList.add('hidden');
    editingNoteId = null;
    document.getElementById('note-form').reset();

    // Прибираємо карту
    const wrapper = document.getElementById('note-map-wrapper');
    if (wrapper) wrapper.classList.add('hidden');
    if (noteMarker && noteMap) {
        noteMap.removeLayer(noteMarker);
        noteMarker = null;
    }
}

// Головна ініціалізація
function setupNotesHandlers() {
    document.getElementById('add-note-btn').onclick = () => {
        editingNoteId = null;
        document.getElementById('note-modal-title').innerText = "Додати нотатку";
        document.getElementById('note-modal').classList.remove('hidden');
        
        // Сьогоднішня дата
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('note-date').value = today;
        document.getElementById('note-time').value = '00:00';
    };

    document.getElementById('close-note-btn').onclick = closeNoteModal;

    // Карта
    document.getElementById('select-note-on-map').onclick = (e) => {
        e.preventDefault();
        openNoteMap();
    };

    // Геолокація
    document.getElementById('use-geolocation-note').onclick = async () => {
        if (!navigator.geolocation) return alert("Геолокація не підтримується");
        
        try {
            const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
            const { latitude: lat, longitude: lng } = pos.coords;
            const name = await fetchLocationName(lat, lng);

            document.getElementById('note-city-name').value = name;
            document.getElementById('note-lat').value = lat;
            document.getElementById('note-lng').value = lng;
        } catch (err) {
            alert("Не вдалося отримати геолокацію");
        }
    };

    // Час "Зараз"
    document.getElementById('use-current-time-note').onclick = () => {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        document.getElementById('note-time').value = `${h}:${m}`;
    };
}