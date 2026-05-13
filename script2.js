// script2.js

document.addEventListener('DOMContentLoaded', () => {

    // ====================== 1. РОБОТА З ПОДІЯМИ МИШІ ======================

    // 1.1 Функція-обробник
    function mouseClickHandler(e) {
        console.log('Клік мишею!', e.type, 'на', e.currentTarget);
        alert('Клік оброблено!');
    }

    // Призначення через атрибут (в HTML) — приклад на кнопці "Повідомлення"
    // <button data-action="alert">Повідомлення</button>

    // Призначення через властивість
    const alertBtn = document.querySelector('button[data-action="alert"]');
    if (alertBtn) {
        alertBtn.onclick = mouseClickHandler;           // через властивість
    }

    // 1.2 addEventListener — кілька обробників на одну подію
    function handler1(e) {
        console.log('Обробник 1: ', e.currentTarget.tagName);
    }

    function handler2(e) {
        console.log('Обробник 2: Підсвічування заголовка');
        e.currentTarget.style.color = 'darkorange';
        setTimeout(() => {
            e.currentTarget.style.color = '';
        }, 1000);
    }

    const h1 = document.getElementById('top');
    h1.addEventListener('click', handler1);
    h1.addEventListener('click', handler2);

    // 1.3 Об’єкт як обробник + handleEvent
    const handlerObject = {
        handleEvent(e) {
            console.log('handleEvent спрацював! Елемент:', e.currentTarget);
            console.log('Тип події:', e.type);
        }
    };

    h1.addEventListener('click', handlerObject);

    // 1.4 Видалення обробника
    function removableHandler(e) {
        console.log('Цей обробник буде видалено');
    }

    h1.addEventListener('mouseover', removableHandler);

    // Видаляємо через 5 секунд (для демонстрації)
    setTimeout(() => {
        h1.removeEventListener('mouseover', removableHandler);
        console.log('removableHandler видалено');
    }, 5000);


    // ====================== 2. СПИСОК + ПІДСВІЧУВАННЯ ======================

    const countryList = document.getElementById('country-list');

    function listClickHandler(e) {
        const li = e.target.closest('li'); // event.target + делегування
        if (!li) return;

        // Прибираємо підсвічування з усіх
        countryList.querySelectorAll('li').forEach(item => {
            item.style.backgroundColor = '';
            item.style.color = '';
        });

        // Підсвічуємо вибраний
        li.style.backgroundColor = '#ffeb3b';
        li.style.color = 'darkblue';
        li.style.fontWeight = 'bold';
    }

    countryList.addEventListener('click', listClickHandler);


    // ====================== 3. МЕНЮ З data-* (Поведінка) ======================

    const menu = document.getElementById('menu');

    function menuHandler(e) {
        const btn = e.target.closest('button');
        if (!btn) return;

        const action = btn.dataset.action;

        switch (action) {
            case 'home':
                window.location.href = 'index.html';
                break;

            case 'scrollTop':
                window.scrollTo({ top: 0, behavior: 'smooth' });
                break;

            case 'alert':
                alert('Ласкаво просимо на сайт подорожей! 🌍');
                break;

            default:
                console.log('Невідома дія:', action);
        }
    }

    menu.addEventListener('click', menuHandler);


    // ====================== 4. mouseover / mouseout ======================

    function hoverStyle(e) {
        if (e.target.tagName === 'LI' || 
            e.target.tagName === 'TD' || 
            e.target.tagName === 'TH') {
            
            e.target.style.transition = 'all 0.3s';
            e.target.style.transform = 'scale(1.05)';
            e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        }
    }

    function leaveStyle(e) {
        if (e.target.tagName === 'LI' || 
            e.target.tagName === 'TD' || 
            e.target.tagName === 'TH') {
            
            e.target.style.transform = 'scale(1)';
            e.target.style.boxShadow = '';
        }
    }

    // Делегування для всього документа
    document.addEventListener('mouseover', hoverStyle);
    document.addEventListener('mouseout', leaveStyle);


    // ====================== 5. DRAG & DROP (перетягування) ======================

    let draggedElement = null;
    let offsetX = 0, offsetY = 0;

    function dragStart(e) {
        if (e.target.tagName === 'IMG') {
            draggedElement = e.target;
            
            const rect = draggedElement.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;

            draggedElement.style.position = 'absolute';
            draggedElement.style.zIndex = 1000;
            draggedElement.style.cursor = 'grabbing';

            document.body.appendChild(draggedElement); // виносимо на верхній рівень
        }
    }

    function dragMove(e) {
        if (!draggedElement) return;

        draggedElement.style.left = (e.clientX - offsetX) + 'px';
        draggedElement.style.top = (e.clientY - offsetY) + 'px';
    }

    function dragEnd() {
        if (draggedElement) {
            draggedElement.style.cursor = 'grab';
            draggedElement = null;
        }
    }

    // Призначаємо події
    document.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);

    // Додаємо курсор grab до всіх зображень у таблиці
    document.querySelectorAll('table img').forEach(img => {
        img.style.cursor = 'grab';
        img.draggable = false; // вимикаємо стандартний drag
    });

    console.log('%cscript2.js завантажено успішно! ✅', 'color: green; font-weight: bold');
});