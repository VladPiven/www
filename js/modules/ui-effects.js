export function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.getAttribute('data-target');
            if (!targetId) return;

            // Активна кнопка
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Видимість контенту
            contents.forEach(content => {
                if (content.id === targetId) {
                    content.classList.remove('hidden');
                    content.classList.add('active');
                } else {
                    content.classList.add('hidden');
                    content.classList.remove('active');
                }
            });

            // Спеціальна логіка для карти
            if (targetId === 'map-view') {
                if (typeof window.initTripMap === 'function') {
                    window.initTripMap();
                }
                setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
            }

            // Для нотаток — оновлюємо таблицю
            if (targetId === 'notes-section') {
                if (typeof window.renderNotesTable === 'function') {
                    window.renderNotesTable();
                }
            }
        });
    });
}