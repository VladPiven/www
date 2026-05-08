const API_URL = "https://api.exchangerate-api.com/v4/latest/EUR";

export async function fetchExchangeRates() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        return data.rates; // Повертає об'єкт { "USD": 1.08, "UAH": 41.5, ... }
    } catch (error) {
        console.error("Помилка при отриманні курсів валют:", error);
        // Резервний (дефолтний) курс, якщо немає інтернету під час створення
        return { "USD": 1.1, "UAH": 42.0, "PLN": 4.3 }; 
    }
}

// Функція для конвертації будь-якої валюти в EUR за зафіксованим курсом
export function convertToEur(amount, currency, lockedRates) {
    if (currency === 'EUR') return amount;
    const rate = lockedRates[currency];
    return rate ? (amount / rate) : amount; 
}