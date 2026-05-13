/* ПОДІЇ МИШІ */

// 1) обробник через властивість
function hoverHandler() {
    console.log("onmouseover (property)");
    this.style.backgroundColor = "#ffe6cc";
}

// 2) другий обробник
function hoverHandler2() {
    console.log("addEventListener handler");
    this.style.border = "2px solid red";
}

// 3) об'єкт-обробник
const hoverObjectHandler = {
    handleEvent(event) {
        console.log("handleEvent:", event.currentTarget);
        event.currentTarget.style.color = "green";
    }
};

// таблиця
let table = document.querySelector("table");

// атрибут (HTML-level)
table.setAttribute("onclick", "console.log('onclick attribute')");

// property
table.onmouseover = hoverHandler;

// addEventListener (кілька обробників)
table.addEventListener("mouseover", hoverHandler2);
table.addEventListener("mouseover", hoverObjectHandler);

// removeEventListener через 5 сек
setTimeout(() => {
    table.removeEventListener("mouseover", hoverHandler2);
    console.log("hoverHandler2 removed");
}, 5000);



/* ДЕЛЕГУВАННЯ (СПИСОК) */

// якщо списку нема — створюємо його (щоб не ламалось)
let list = document.getElementById("country-list");

if (list) {
    list.onclick = function(event) {

        let items = list.querySelectorAll("li");

        items.forEach(li => li.style.backgroundColor = "");

        if (event.target.tagName === "LI") {
            event.target.style.backgroundColor = "yellow";
            console.log("Clicked:", event.target.textContent);
        }
    };
}



/* MENU + data-* (behavior)*/

let menu = document.getElementById("menu");

if (menu) {
    menu.addEventListener("click", function(event) {

        let action = event.target.dataset.action;

        switch(action) {

            case "home":
                location.href = "index.html";
                break;

            case "scrollTop":
                window.scrollTo({ top: 0, behavior: "smooth" });
                break;

            case "alert":
                alert("Menu works via data-action!");
                break;
        }
    });
}