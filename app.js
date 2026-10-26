const validTags = ["monkey", "internauta"];
const currentView = document.body.dataset.view;
const apiBase = window.location.protocol === "file:" ? "http://localhost:8000" : "";
const collectionByStorageKey = {
    "mis-tareas": "tasks",
    "mis-stock": "stock",
    "mis-gastos": "expenses"
};
let remoteData = {};
let remoteSnapshot = "";

function setupNavigation() {
    const toggle = document.getElementById("menu-toggle");
    const links = document.getElementById("nav-links");
    toggle.addEventListener("click", () => {
        const isOpen = links.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.setAttribute("aria-label", isOpen ? "Cerrar menú" : "Abrir menú");
    });
    links.addEventListener("click", () => {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Abrir menú");
    });
}

function readStorage(key, fallback) {
    if (Object.prototype.hasOwnProperty.call(remoteData, key)) {
        return remoteData[key];
    }
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
    } catch (error) {
        return fallback;
    }
}

function writeStorage(key, value, message) {
    remoteData[key] = value;
    localStorage.setItem(key, JSON.stringify(value));
    const collection = collectionByStorageKey[key];
    fetch(`${apiBase}/api/${collection}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value)
    }).then(response => {
        if (!response.ok) throw new Error("No se pudo guardar");
        remoteSnapshot = JSON.stringify(remoteData);
    }).catch(() => alert(message));
}

async function loadRemoteData() {
    for (const [key, collection] of Object.entries(collectionByStorageKey)) {
        try {
            const response = await fetch(`${apiBase}/api/${collection}`);
            if (!response.ok) throw new Error("API no disponible");
            remoteData[key] = await response.json();
        } catch (error) {
            remoteData[key] = readLocalStorage(key, []);
        }
    }
    remoteSnapshot = JSON.stringify(remoteData);
}

function readLocalStorage(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
    } catch (error) {
        return fallback;
    }
}

async function checkForRemoteChanges() {
    const latestData = {};
    try {
        for (const [key, collection] of Object.entries(collectionByStorageKey)) {
            const response = await fetch(`${apiBase}/api/${collection}`);
            if (!response.ok) return;
            latestData[key] = await response.json();
        }
        if (JSON.stringify(latestData) !== remoteSnapshot) {
            window.location.reload();
        }
    } catch (error) {
        // Se reintentará en la próxima actualización.
    }
}

function setupTasks() {
    const form = document.getElementById("task-form");
    const input = document.getElementById("task-input");
    const descriptionInput = document.getElementById("task-description");
    const tagInput = document.getElementById("task-tag");
    const taskList = document.getElementById("task-list");
    const stats = document.getElementById("stats");
    const clearAllButton = document.getElementById("clear-all-button");
    const tagFilter = document.getElementById("tag-filter");
    const taskModal = document.getElementById("task-modal");
    const modalClose = document.getElementById("modal-close");
    const modalTag = document.getElementById("modal-tag");
    const modalTitle = document.getElementById("modal-title");
    const modalDescription = document.getElementById("modal-description");
    let currentFilter = "all";
    let tasks = readStorage("mis-tareas", []);

    if (!Array.isArray(tasks)) tasks = [];
    tasks = tasks
        .filter(task => task && typeof task.id === "string" && typeof task.text === "string")
        .map(task => ({
            ...task,
            tag: validTags.includes(task.tag) ? task.tag : "monkey",
            description: typeof task.description === "string" ? task.description : "",
            completed: task.completed === true
        }));

    function saveTasks() {
        writeStorage("mis-tareas", tasks, "No se pudieron guardar las tareas en el navegador.");
    }

    function openTaskDetails(task) {
        modalTag.className = `task-tag ${task.tag}`;
        modalTag.textContent = task.tag;
        modalTitle.textContent = task.text;
        modalDescription.textContent = task.description || "Esta tarea no tiene descripción.";
        taskModal.hidden = false;
        modalClose.focus();
    }

    function renderTasks() {
        taskList.replaceChildren();
        const visibleTasks = currentFilter === "all" ? tasks : tasks.filter(task => task.tag === currentFilter);
        const pending = visibleTasks.filter(task => !task.completed).length;
        stats.textContent = `${pending} pendientes · ${visibleTasks.length - pending} completadas`;
        clearAllButton.hidden = tasks.length <= 1;

        if (visibleTasks.length === 0) {
            const message = document.createElement("li");
            message.className = "empty";
            message.textContent = tasks.length === 0 ? "Todavía no agregaste ninguna tarea." : "No hay tareas con esta etiqueta.";
            taskList.appendChild(message);
            return;
        }

        visibleTasks.forEach(task => {
            const li = document.createElement("li");
            li.className = task.completed ? "completed task-item" : "task-item";
            li.tabIndex = 0;
            li.setAttribute("role", "button");
            li.setAttribute("aria-label", `Ver detalles de: ${task.text}`);
            li.addEventListener("click", () => openTaskDetails(task));
            li.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openTaskDetails(task);
                }
            });

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = task.completed;
            checkbox.setAttribute("aria-label", "Marcar tarea como completada");
            checkbox.addEventListener("click", event => event.stopPropagation());
            checkbox.addEventListener("change", () => {
                task.completed = checkbox.checked;
                saveTasks();
                renderTasks();
            });

            const text = document.createElement("span");
            text.className = "task-text";
            text.textContent = task.text;
            const tag = document.createElement("span");
            tag.className = `task-tag ${task.tag}`;
            tag.textContent = task.tag;

            const deleteButton = document.createElement("button");
            deleteButton.className = "delete-button";
            deleteButton.textContent = "Eliminar";
            deleteButton.type = "button";
            deleteButton.addEventListener("click", event => {
                event.stopPropagation();
                tasks = tasks.filter(item => item.id !== task.id);
                saveTasks();
                renderTasks();
            });
            li.append(checkbox, text, tag, deleteButton);
            taskList.appendChild(li);
        });
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        const text = input.value.trim();
        const tag = tagInput.value;
        if (!text || !validTags.includes(tag)) return;
        tasks.unshift({
            id: crypto.randomUUID(),
            text,
            description: descriptionInput.value.trim(),
            tag,
            completed: false
        });
        saveTasks();
        renderTasks();
        input.value = "";
        descriptionInput.value = "";
        tagInput.value = "";
        input.focus();
    });
    clearAllButton.addEventListener("click", () => {
        if (!confirm("¿Querés eliminar todas las tareas?")) return;
        tasks = [];
        saveTasks();
        renderTasks();
    });
    tagFilter.addEventListener("change", () => {
        currentFilter = tagFilter.value;
        renderTasks();
    });
    modalClose.addEventListener("click", () => { taskModal.hidden = true; });
    taskModal.addEventListener("click", event => {
        if (event.target === taskModal) taskModal.hidden = true;
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !taskModal.hidden) taskModal.hidden = true;
    });
    renderTasks();
}

function setupStock() {
    const form = document.getElementById("stock-form");
    const nameInput = document.getElementById("stock-name");
    const quantityInput = document.getElementById("stock-quantity");
    const stats = document.getElementById("stock-stats");
    const list = document.getElementById("stock-list");
    let stock = readStorage("mis-stock", []);
    if (!Array.isArray(stock)) stock = [];

    function saveStock() {
        writeStorage("mis-stock", stock, "No se pudo guardar el stock en el navegador.");
    }
    function renderStock() {
        list.replaceChildren();
        const total = stock.reduce((sum, item) => sum + item.quantity, 0);
        stats.textContent = `${stock.length} artículos · ${total} unidades`;
        if (stock.length === 0) {
            const message = document.createElement("li");
            message.className = "empty";
            message.textContent = "Todavía no agregaste ningún artículo.";
            list.appendChild(message);
            return;
        }
        stock.forEach(item => {
            const li = document.createElement("li");
            li.className = "stock-item";
            const name = document.createElement("span");
            name.className = "stock-name";
            name.textContent = item.name;
            const controls = document.createElement("div");
            controls.className = "quantity-controls";
            const decrease = document.createElement("button");
            decrease.className = "quantity-button";
            decrease.type = "button";
            decrease.textContent = "−";
            decrease.setAttribute("aria-label", `Restar una unidad de ${item.name}`);
            decrease.addEventListener("click", () => { item.quantity = Math.max(0, item.quantity - 1); saveStock(); renderStock(); });
            const quantity = document.createElement("span");
            quantity.className = "quantity-value";
            quantity.textContent = item.quantity;
            const increase = document.createElement("button");
            increase.className = "quantity-button";
            increase.type = "button";
            increase.textContent = "+";
            increase.setAttribute("aria-label", `Sumar una unidad a ${item.name}`);
            increase.addEventListener("click", () => { item.quantity += 1; saveStock(); renderStock(); });
            const remove = document.createElement("button");
            remove.className = "delete-button";
            remove.type = "button";
            remove.textContent = "Eliminar";
            remove.addEventListener("click", () => { stock = stock.filter(stockItem => stockItem.id !== item.id); saveStock(); renderStock(); });
            controls.append(decrease, quantity, increase);
            li.append(name, controls, remove);
            list.appendChild(li);
        });
    }
    form.addEventListener("submit", event => {
        event.preventDefault();
        const name = nameInput.value.trim();
        const quantity = Number(quantityInput.value);
        if (!name || !Number.isInteger(quantity) || quantity < 1) return;
        const existing = stock.find(item => item.name.toLowerCase() === name.toLowerCase());
        if (existing) existing.quantity += quantity;
        else stock.unshift({ id: crypto.randomUUID(), name, quantity });
        saveStock();
        renderStock();
        nameInput.value = "";
        quantityInput.value = "1";
        nameInput.focus();
    });
    renderStock();
}

function setupExpenses() {
    const form = document.getElementById("expense-form");
    const nameInput = document.getElementById("expense-name");
    const valueInput = document.getElementById("expense-value");
    const totalElement = document.getElementById("expense-total");
    const clearButton = document.getElementById("clear-expenses-button");
    const exportButton = document.getElementById("export-expenses-button");
    const list = document.getElementById("expense-list");
    let expenses = readStorage("mis-gastos", []);
    if (!Array.isArray(expenses)) expenses = [];

    function saveExpenses() {
        writeStorage("mis-gastos", expenses, "No se pudieron guardar los gastos en el navegador.");
    }
    function currency(value) {
        return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
    }
    function renderExpenses() {
        list.replaceChildren();
        const total = expenses.reduce((sum, expense) => sum + expense.value, 0);
        totalElement.textContent = `Total: ${currency(total)}`;
        clearButton.hidden = expenses.length <= 1;
        exportButton.disabled = expenses.length === 0;
        if (expenses.length === 0) {
            const message = document.createElement("li");
            message.className = "empty";
            message.textContent = "Todavía no agregaste ningún gasto.";
            list.appendChild(message);
            return;
        }
        expenses.forEach(expense => {
            const li = document.createElement("li");
            li.className = "expense-item";
            const name = document.createElement("span");
            name.className = "expense-name";
            name.textContent = expense.name;
            const value = document.createElement("span");
            value.className = "expense-value";
            value.textContent = currency(expense.value);
            const remove = document.createElement("button");
            remove.className = "delete-button";
            remove.type = "button";
            remove.textContent = "Eliminar";
            remove.addEventListener("click", () => { expenses = expenses.filter(item => item.id !== expense.id); saveExpenses(); renderExpenses(); });
            li.append(name, value, remove);
            list.appendChild(li);
        });
    }
    form.addEventListener("submit", event => {
        event.preventDefault();
        const name = nameInput.value.trim();
        const value = Number(valueInput.value);
        if (!name || !Number.isFinite(value) || value < 0) return;
        expenses.unshift({ id: crypto.randomUUID(), name, value });
        saveExpenses();
        renderExpenses();
        nameInput.value = "";
        valueInput.value = "";
        nameInput.focus();
    });
    clearButton.addEventListener("click", () => {
        if (!confirm("¿Querés eliminar todos los gastos?")) return;
        expenses = [];
        saveExpenses();
        renderExpenses();
    });
    exportButton.addEventListener("click", () => {
        if (expenses.length === 0) return;
        const total = expenses.reduce((sum, expense) => sum + expense.value, 0);
        const rows = [["Nombre", "Valor"], ...expenses.map(expense => [expense.name, expense.value.toFixed(2)]), ["TOTAL", total.toFixed(2)]];
        const escapeCsv = value => `"${String(value).replace(/"/g, '""')}"`;
        const csv = "\ufeff" + rows.map(row => row.map(escapeCsv).join(";")).join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "gastos.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    });
    renderExpenses();
}

async function startApp() {
    await loadRemoteData();
    setupNavigation();
    if (currentView === "tasks") setupTasks();
    if (currentView === "stock") setupStock();
    if (currentView === "expenses") setupExpenses();
    window.setInterval(checkForRemoteChanges, 3000);
}

startApp();
