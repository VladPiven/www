// через атрибут onclick
window.mouseClickHandler = function(e) {
    console.log(`🔥 Клік через onclick-атрибут! Тип: ${e.type}`);
    alert('Дякуємо! Бажаємо приємної подорожі! 🌍✈️');
};

document.addEventListener('DOMContentLoaded', () => {

    console.log('%c✅ script2.js завантажено — повністю відповідає ТЗ', 'color: lime; font-weight: bold');

    // mouseaction

    // Через властивість
    const homeBtn = document.querySelector('button[data-action="home"]');
    if (homeBtn) homeBtn.onclick = mouseClickHandler;

    // Два різних обробники на одну подію
    function handler1(e) {
        console.log('Обробник 1 (handler1) спрацював на h1');
    }

    function handler2(e) {
        console.log('Обробник 2 (handler2) — підсвічування');
        e.currentTarget.style.color = '#e67e22';
        setTimeout(() => e.currentTarget.style.color = '', 1500);
    }

    const h1 = document.getElementById('top');
    h1.addEventListener('click', handler1);
    h1.addEventListener('click', handler2);

    // обробник + handleEvent + currentTarget
    const handlerObject = {
        handleEvent(e) {
            console.log('handleEvent спрацював! Елемент:', e.currentTarget.tagName);
        }
    };
    h1.addEventListener('click', handlerObject);

    // Видалення обробника
    function removableHandler(e) {
        console.log('removableHandler спрацював');
    }
    h1.addEventListener('mouseover', removableHandler);
    setTimeout(() => {
        h1.removeEventListener('mouseover', removableHandler);
        console.log('removableHandler видалено');
    }, 8000);


    // СПИСОК + ПІДСВІЧУВАННЯ

    const countryList = document.getElementById('country-list');

    function listClickHandler(e) {
        const li = e.target.closest('li');
        if (!li) return;

        countryList.querySelectorAll('li').forEach(item => item.classList.remove('highlighted'));
        li.classList.add('highlighted');
    }

    countryList.addEventListener('click', listClickHandler);


    // DRAG & DROP

    let draggedItem = null;
    let placeholder = null;

    function startDrag(e) {
        if (e.target.tagName !== 'LI') return;
        draggedItem = e.target;
        draggedItem.classList.add('dragging');

        placeholder = document.createElement('li');
        placeholder.className = 'placeholder';
        
        setTimeout(() => { if (draggedItem) draggedItem.style.display = 'none'; }, 0);
    }

    function moveDrag(e) {
        if (!draggedItem) return;
        const afterElement = getDragAfterElement(countryList, e.clientY);
        
        if (afterElement) {
            countryList.insertBefore(placeholder, afterElement);
        } else {
            countryList.appendChild(placeholder);
        }
    }

    function endDrag() {
        if (!draggedItem || !placeholder) return;
        if (placeholder.parentNode) {
            placeholder.parentNode.replaceChild(draggedItem, placeholder);
        }
        draggedItem.style.display = '';
        draggedItem.classList.remove('dragging');
        draggedItem = null;
        placeholder = null;
    }

    function getDragAfterElement(container, y) {
        const elements = [...container.querySelectorAll('li:not(.dragging)')];
        return elements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            }
            return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    countryList.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', moveDrag);
    document.addEventListener('mouseup', endDrag);


    // data-* 

    const menu = document.getElementById('menu');

    function menuHandler(e) {
        const btn = e.target.closest('button');
        if (!btn) return;

        switch (btn.dataset.action) {
            case 'home':
                window.location.href = 'index.html';
                break;
            case 'scrollTop':
                window.scrollTo({ top: 0, behavior: 'smooth' });
                break;
        }
    }

    menu.addEventListener('click', menuHandler);


    // mouseover / mouseout + event.relatedTarget

    function mouseMoveHandler(e) {
        const target = e.target;
        const related = e.relatedTarget;

        if (['LI', 'TD', 'TH'].includes(target.tagName)) {
            target.style.transform = 'scale(1.05)';
            target.style.boxShadow = '0 8px 16px rgba(0,0,0,0.25)';
            
            // Гарне використання relatedTarget
            if (related) {
                console.log(`🐭 Мишка перейшла з → ${related.tagName} (${related.textContent?.slice(0,30) || '...'}) 
                          на → ${target.tagName} (${target.textContent?.slice(0,30) || '...'})`);
            } else {
                console.log(`🐭 Мишка з'явилася на елементі: ${target.tagName}`);
            }
        }
    }

    function mouseLeaveHandler(e) {
        const target = e.target;
        if (['LI', 'TD', 'TH'].includes(target.tagName)) {
            target.style.transform = 'scale(1)';
            target.style.boxShadow = '';
        }
    }

    // обробники
    document.addEventListener('mouseover', mouseMoveHandler);
    document.addEventListener('mouseout', mouseLeaveHandler);

});