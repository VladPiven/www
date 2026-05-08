// Власна функція "Діалог з користувачем"
// Використано змінні, умовне розгалуження та цикл
function dialogWithUser() {
    let name = prompt("Як вас звати?");
    let tripsCount = prompt("Скільки подорожей ви вже мали?");

    if (name == null || name.trim() == "") {
        name = "турист";
    }

    tripsCount = Number(tripsCount);

    if (isNaN(tripsCount) || tripsCount < 0) {
        alert("Схоже, кількість подорожей введена неправильно. Спробуйте ще раз.");
        return;
    }

    let message = "Привіт, " + name + "!\n\n";

    if (tripsCount == 0) {
        message += "У вас ще не було подорожей, але все попереду. Саме час почати планувати першу!";
    } else {
        message += "Класно! У вас уже було " + tripsCount + " подорожей.\n\n";
        message += "Список ваших подорожей:\n";

        for (let i = 1; i <= tripsCount; i++) {
            message += "Подорож №" + i + "\n";
        }

        message += "\nБажаємо ще більше цікавих маршрутів!";
    }

    alert(message);
}


// Функція виводу інформації про розробника сторінки
// Параметр "посада" має значення за замовчуванням
function showDeveloperInfo(lastName, firstName, position = "Найкращий розробник") {
    alert(
        "Інформація про розробника сторінки:\n\n" +
        "Прізвище: " + lastName + "\n" +
        "Ім'я: " + firstName + "\n" +
        "Посада: " + position
    );
}


// Функція порівняння двох рядків
function compareStrings() {
    let firstString = prompt("Введіть перший рядок:");
    let secondString = prompt("Введіть другий рядок:");

    if (firstString == null || secondString == null) {
        alert("Порівняння скасовано.");
        return;
    }

    if (firstString.length > secondString.length) {
        alert("Перший рядок довший:\n\n" + firstString);
    } else if (secondString.length > firstString.length) {
        alert("Другий рядок довший:\n\n" + secondString);
    } else {
        alert("Рядки мають однакову довжину.");
    }
}


// Зміна фону сторінки на 30 секунд
function changeBackground() {
    let oldBackground = document.body.style.backgroundColor;

    document.body.style.setProperty("background-color", "#ffe6f2", "important");

    alert("Фон сторінки тимчасово змінено на 30 секунд.");

    setTimeout(function () {
        document.body.style.backgroundColor = oldBackground;
        document.body.style.removeProperty("background-color");

        alert("Фон сторінки повернувся до початкового кольору.");
    }, 30000);
}


// Перенаправлення браузера на іншу сторінку за допомогою location
function redirectToGallery() {
    let answer = confirm("Бажаєте перейти до галереї подорожей?");

    if (answer) {
        location.href = "gallery.html";
    } else {
        alert("Добре, залишаємося на сторінці порад.");
    }
}


// Робота з DOM
function changeDOM() {

    // getElementById
    let title = document.getElementById("top");
    title.textContent = "Корисні поради для туриста";

    // querySelectorAll
    let listItems = document.querySelectorAll("ul li");

    for (let i = 0; i < listItems.length; i++) {
        listItems[i].style.color = "darkblue";
        listItems[i].style.fontWeight = "bold";
    }

    // innerHTML
    let textBlock = document.getElementById("dom-text");
    textBlock.innerHTML = "<b>Цей текст був змінений за допомогою innerHTML.</b>";

    // textContent
    let confirmResult = document.getElementById("confirm-result");
    confirmResult.textContent = "Цей текст був змінений за допомогою textContent.";

    // nodeValue / data
    let note = document.getElementById("replace-note");
    let textNode = note.firstChild;

    textNode.nodeValue = "Спочатку текст був змінений через nodeValue.";
    textNode.data = "Потім цей самий текст був змінений через data.";

    // outerHTML
    note.outerHTML = "<p id='new-note'><b>Цей абзац повністю замінено за допомогою outerHTML.</b></p>";

    // document.createElement
    let newParagraph = document.createElement("p");

    // document.createTextNode
    let newText = document.createTextNode("Новий абзац створено за допомогою createElement і createTextNode.");

    newParagraph.append(newText);

    let jsBlock = document.getElementById("js-block");

    // append
    jsBlock.append(newParagraph);

    // prepend
    let startText = document.createElement("p");
    startText.textContent = "Цей абзац додано на початок блоку за допомогою prepend.";
    jsBlock.prepend(startText);

    // after
    let afterText = document.createElement("p");
    afterText.textContent = "Цей абзац додано після блоку за допомогою after.";
    jsBlock.after(afterText);

    // replaceWith
    let replaceElement = document.createElement("p");
    replaceElement.textContent = "Цей абзац буде замінено.";

    jsBlock.append(replaceElement);

    let newReplaceElement = document.createElement("p");
    newReplaceElement.textContent = "Абзац успішно замінено за допомогою replaceWith.";
    replaceElement.replaceWith(newReplaceElement);

    // remove
    let removeElement = document.createElement("p");
    removeElement.textContent = "Цей абзац був створений, але одразу видалений.";
    jsBlock.append(removeElement);

    removeElement.remove();

    alert("Готово! На сторінці були змінені заголовок, текст, список і блок з інформацією.");
}