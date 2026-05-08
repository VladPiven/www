import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Отримання активних подорожей (додаємо 3 дні до поточної дати для фільтру)
export async function getActiveTrips(uid) {
    const tripsRef = collection(db, "trips");
    const q = query(tripsRef, where("userId", "==", uid));
    const snapshot = await getDocs(q);
    
    let trips = [];
    const now = new Date().getTime();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

    snapshot.forEach((doc) => {
        const data = doc.data();
        const endDateMs = new Date(data.endDate).getTime();
        // Фільтруємо на клієнті для простоти, поки подорож не старіша за endDate + 3 дні
        if (now <= (endDateMs + threeDaysMs)) {
            trips.push({ id: doc.id, ...data });
        }
    });
    return trips;
}

export async function createTrip(tripData) {
    const tripsRef = collection(db, "trips");
    return await addDoc(tripsRef, tripData);
}

// Каскадне видалення (Подорож + Витрати + Нотатки)
export async function deleteTripFull(tripId) {
    const batch = writeBatch(db);

    // 1. Знаходимо всі витрати, пов'язані з tripId
    const expensesQ = query(collection(db, "expenses"), where("tripId", "==", tripId));
    const expensesSnap = await getDocs(expensesQ);
    expensesSnap.forEach((docSnap) => {
        batch.delete(doc(db, "expenses", docSnap.id));
    });

    // 2. Знаходимо всі нотатки
    const notesQ = query(collection(db, "notes"), where("tripId", "==", tripId));
    const notesSnap = await getDocs(notesQ);
    notesSnap.forEach((docSnap) => {
        batch.delete(doc(db, "notes", docSnap.id));
    });

    // 3. Видаляємо саму подорож
    batch.delete(doc(db, "trips", tripId));

    // Виконуємо всі операції видалення як одну транзакцію
    await batch.commit();
}