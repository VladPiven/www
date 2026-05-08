

import { login, logout, observeAuth } from './modules/auth.js';
import { getActiveTrips, deleteTripFull } from './api/firestore-db.js';
import { fetchExchangeRates } from './api/exchange-api.js';
import { createTrip } from './api/firestore-db.js';

let currentUser = null;
    
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const tripsContainer = document.getElementById('trips-container');
const addTripBtn = document.getElementById('add-trip-btn');
const createTripModal = document.getElementById('create-trip-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const createTripForm = document.getElementById('create-trip-form');

// Відстеження стану користувача
observeAuth(async (user) => {
    if (user) {
        currentUser = user;
        authSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
        await loadTrips();
    } else {
        currentUser = null;
        authSection.classList.remove('hidden');
        dashboardSection.classList.add('hidden');
    }
});

loginBtn.addEventListener('click', () => login());
logoutBtn.addEventListener('click', () => logout());

async function loadTrips() {
    tripsContainer.innerHTML = '<p>Loading...</p>';
    const trips = await getActiveTrips(currentUser.uid);
    tripsContainer.innerHTML = '';
    
    trips.forEach(trip => {
        const card = document.createElement('div');
        card.className = 'glass-card trip-card';
        card.innerHTML = `
            <h3>${trip.title}</h3>
            <p>${trip.startDate} - ${trip.endDate}</p>
            <p>Budget: ${trip.estimatedBudget} ${trip.currency}</p>
            <button class="delete-btn" data-id="${trip.id}">Delete</button>
            <a href="trip.html?id=${trip.id}" class="btn">View Details</a>
        `;
        tripsContainer.appendChild(card);
    });

    // Делегування подій для видалення
    tripsContainer.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const tripId = e.target.getAttribute('data-id');
            const confirmWord = prompt('Type "DELETE" to confirm:');
            if (confirmWord === 'DELETE') {
                await deleteTripFull(tripId);
                await loadTrips(); // Перезавантажити список
            } else {
                alert('Deletion cancelled.');
            }
        }
    });
};

// Відкрити / Закрити модалку
addTripBtn.addEventListener('click', () => createTripModal.classList.remove('hidden'));
closeModalBtn.addEventListener('click', () => createTripModal.classList.add('hidden'));

// Обробка форми
createTripForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Блокуємо кнопку від подвійного кліку
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerText = "Creating...";

    try {
        // 1. Отримуємо курс валют на СЬОГОДНІ і "заморожуємо" його для цієї подорожі
        const lockedRates = await fetchExchangeRates();

        // 2. Формуємо об'єкт подорожі
        const newTripData = {
            userId: currentUser.uid,
            title: document.getElementById('trip-title-input').value,
            startDate: document.getElementById('trip-start').value,
            endDate: document.getElementById('trip-end').value,
            estimatedBudget: parseFloat(document.getElementById('trip-budget').value),
            currency: document.getElementById('trip-currency').value,
            coverImage: document.getElementById('trip-image').value || 'assets/img/placeholder.jpg',
            lockedExchangeRates: lockedRates, // Зберігаємо курс на момент створення!
            createdAt: new Date().toISOString()
        };

        // 3. Зберігаємо в Firestore
        await createTrip(newTripData);
        
        // 4. Очищаємо та закриваємо
        createTripForm.reset();
        createTripModal.classList.add('hidden');
        await loadTrips(); // Перезавантажуємо список на Dashboard

    } catch (error) {
        console.error("Error creating trip:", error);
        alert("Failed to create trip.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Create & Lock Currency";
    }
});
