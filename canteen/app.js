const API_URL = '/api';

// State Management
let menuItems = [
    { id: 1, name: "Jollof Rice with Grilled Chicken & Kelewele", category: "Main Dishes", price: 35.00, stock: 25, imageIcon: "fa-bowl-rice" },
    { id: 2, name: "Waakye Special (Egg, Fish, Wele & Spaghetti)", category: "Main Dishes", price: 40.00, stock: 18, imageIcon: "fa-plate-wheat" },
    { id: 3, name: "Banku with Tilapia & Pepper Sauce", category: "Main Dishes", price: 45.00, stock: 12, imageIcon: "fa-fish" },
    { id: 4, name: "Fried Rice with Chili Wings", category: "Main Dishes", price: 30.00, stock: 20, imageIcon: "fa-drumstick-bite" },
    { id: 5, name: "Grilled Pork / Goat Chops Portion", category: "Grills & Sides", price: 25.00, stock: 15, imageIcon: "fa-bacon" },
    { id: 6, name: "Fried Plantain (Kelewele)", category: "Grills & Sides", price: 10.00, stock: 30, imageIcon: "fa-pepper-hot" },
    { id: 7, name: "Chilled Sobolo (Hibiscus Tea - 500ml)", category: "Beverages", price: 8.00, stock: 40, imageIcon: "fa-bottle-water" },
    { id: 8, name: "Fresh Pineapple & Ginger Juice", category: "Beverages", price: 12.00, stock: 22, imageIcon: "fa-glass-water" }
];

let cart = [];
let orders = [];
let activeCategory = "All";

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
    renderMenu();
    renderCart();
    loadStockManager();
    updateDashboardStats();
    loadOrders();
    checkStudentSession();
});

// View Switcher (Student App vs Kitchen Admin)
function switchView(view) {
    const studentView = document.getElementById("student-dashboard");
    const adminView = document.getElementById("admin-dashboard");
    const btnStudent = document.getElementById("btn-student-view");
    const btnAdmin = document.getElementById("btn-admin-view");

    if (view === "student") {
        checkStudentSession();
        studentView.classList.remove("d-none");
        adminView.classList.add("d-none");
        btnStudent.classList.add("btn-light", "active");
        btnStudent.classList.remove("btn-outline-light");
        btnAdmin.classList.remove("btn-light", "active");
        btnAdmin.classList.add("btn-outline-light");
    } else {
        if (sessionStorage.getItem("isAdminAuthenticated") !== "true") {
            requestAdminAccess(null, view);
            return;
        }
        studentView.classList.add("d-none");
        adminView.classList.remove("d-none");
        btnAdmin.classList.add("btn-light", "active");
        btnAdmin.classList.remove("btn-outline-light");
        btnStudent.classList.remove("btn-light", "active");
        btnStudent.classList.add("btn-outline-light");
        loadOrders();
        loadStockManager();
    }
}

function switchMainView(viewType) {
    if (viewType === "student") {
        sessionStorage.removeItem("isAdminAuthenticated");
        switchView("student");
        return;
    }
    if (viewType !== "admin") return;

    if (sessionStorage.getItem("isAdminAuthenticated") === "true") {
        switchView("admin");
    } else {
        requestAdminAccess(null, "admin");
    }
}

window.switchMainView = switchMainView;

async function requestAdminAccess(event, targetView) {
    event?.preventDefault();
    const view = targetView === "kitchen-admin-section" ? "admin" : targetView;
    if (sessionStorage.getItem("isAdminAuthenticated") === "true") {
        switchMainView(view);
        return;
    }

    const enteredPin = prompt("Enter Admin PIN to access Kitchen & Stock Management:");
    if (enteredPin === null || enteredPin.length === 0) return;

    try {
        const response = await fetch(`${API_URL}/admin/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin: enteredPin })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            alert(result.error || "Admin authentication failed.");
            return;
        }

        sessionStorage.setItem("isAdminAuthenticated", "true");
        switchMainView(view);
    } catch (error) {
        console.error("Error verifying admin PIN:", error);
        alert("Could not verify the Admin PIN. Check that the backend is running.");
    }
}

window.requestAdminAccess = requestAdminAccess;

function toggleAuthView(view) {
    const showRegister = view === "register";
    document.getElementById("login-form")?.classList.toggle("d-none", showRegister);
    document.getElementById("register-form")?.classList.toggle("d-none", !showRegister);
    const message = document.getElementById("auth-message");
    if (message) message.innerHTML = "";
}

async function registerStudent(event) {
    event.preventDefault();
    const full_name = document.getElementById("reg-name")?.value.trim();
    const email = document.getElementById("reg-email")?.value.trim();
    const phone = document.getElementById("reg-phone")?.value.trim();
    const password = document.getElementById("reg-password")?.value;

    try {
        const response = await fetch(`${API_URL}/student/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ full_name, email, phone, password })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Registration failed.");

        document.getElementById("register-form")?.reset();
        const loginEmail = document.getElementById("login-email");
        if (loginEmail) loginEmail.value = email;
        toggleAuthView("login");
        const message = document.getElementById("auth-message");
        if (message) message.innerHTML = '<div class="alert alert-success">Account created. Please log in.</div>';
    } catch (error) {
        console.error("Error during registration:", error);
        const message = document.getElementById("auth-message");
        if (message) message.innerHTML = `<div class="alert alert-danger">${error.message || "Could not connect to the server."}</div>`;
    }
}

async function loginStudent(event) {
    event.preventDefault();
    const email = document.getElementById("login-email")?.value.trim();
    const password = document.getElementById("login-password")?.value;

    try {
        const response = await fetch(`${API_URL}/student/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || "Invalid email or password.");
        }

        sessionStorage.setItem("currentStudent", JSON.stringify({ ...result.student, token: result.token }));
        document.getElementById("login-form")?.reset();
        checkStudentSession();
    } catch (error) {
        console.error("Error during login:", error);
        const message = document.getElementById("auth-message");
        if (message) message.innerHTML = `<div class="alert alert-danger">${error.message || "Could not connect to the server."}</div>`;
    }
}

function checkStudentSession() {
    const authContainer = document.getElementById("auth-container");
    const studentView = document.getElementById("student-dashboard");
    const accountPanel = document.getElementById("student-account-panel");
    if (!authContainer || !accountPanel || !studentView) return;

    try {
        const storedStudent = sessionStorage.getItem("currentStudent");
        const student = storedStudent ? JSON.parse(storedStudent) : null;
        if (student && student.name) {
            authContainer.classList.add("d-none");
            studentView.classList.remove("d-none");
            accountPanel.classList.remove("d-none");
            const name = document.getElementById("student-account-name");
            if (name) name.textContent = student.name;
            const phoneInput = document.getElementById("student-phone")
                || document.getElementById("student-phone-input");
            if (phoneInput && student.phone) {
                phoneInput.value = student.phone.replace(/^\+233\s*/, "");
            }
        } else {
            authContainer.classList.remove("d-none");
            studentView.classList.remove("d-none");
            accountPanel.classList.add("d-none");
        }
    } catch (error) {
        console.error("Invalid saved student session:", error);
        sessionStorage.removeItem("currentStudent");
        authContainer.classList.remove("d-none");
        studentView.classList.remove("d-none");
        accountPanel.classList.add("d-none");
    }
}

function logoutStudent() {
    sessionStorage.removeItem("currentStudent");
    checkStudentSession();
}

window.toggleAuthView = toggleAuthView;
window.registerStudent = registerStudent;
window.loginStudent = loginStudent;
window.checkStudentSession = checkStudentSession;
window.logoutStudent = logoutStudent;

// Render Menu Catalog
function renderMenu() {
    const grid = document.getElementById("menu-grid");
    const searchQuery = document.getElementById("menu-search").value.toLowerCase();
    grid.innerHTML = "";

    const filtered = menuItems.filter(item => {
        const matchesCategory = activeCategory === "All" || item.category === activeCategory;
        const matchesSearch = item.name.toLowerCase().includes(searchQuery);
        return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-12 text-center text-muted py-4"><p>No items found matching your filter.</p></div>`;
        return;
    }

    filtered.forEach(item => {
        const isAvailable = item.is_available !== undefined
            ? item.is_available === 1 || item.is_available === true || item.is_available === "1"
            : item.isAvailable !== false;
        const canOrder = isAvailable && item.stock > 0;
        const actionButton = canOrder
            ? `<button class="btn btn-primary btn-sm" onclick="addToCart(${item.id})">Add to Tray</button>`
            : `<button class="btn btn-secondary btn-sm" disabled>Out of Stock</button>`;
        const cardHtml = `
            <div class="col">
                <div class="card h-100 border-0 shadow-sm menu-card">
                    <div class="dish-img-placeholder rounded-top">
                        <i class="fa-solid ${item.imageIcon} fa-3x"></i>
                    </div>
                    <div class="card-body d-flex flex-column">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h6 class="fw-bold mb-0">${item.name}</h6>
                            <span class="badge bg-light text-dark border ms-2">GH₵ ${item.price.toFixed(2)}</span>
                        </div>
                        <p class="text-muted small mb-3">${item.category}</p>
                        <div class="mt-auto d-flex justify-content-between align-items-center">
                            <span class="small ${canOrder ? 'text-muted' : 'text-danger fw-bold'}">
                                ${canOrder ? `Stock: ${item.stock} portions` : 'Out of Stock'}
                            </span>
                            ${actionButton}
                        </div>
                    </div>
                </div>
            </div>
        `;
        grid.insertAdjacentHTML("beforeend", cardHtml);
    });
}

function setCategory(cat, element) {
    activeCategory = cat;
    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.classList.remove("btn-primary", "active");
        btn.classList.add("btn-outline-secondary");
    });
    element.classList.remove("btn-outline-secondary");
    element.classList.add("btn-primary", "active");
    renderMenu();
}

function filterMenu() {
    renderMenu();
}

// Cart Management
function addToCart(itemId) {
    const item = menuItems.find(m => m.id === itemId);
    if (!item || item.stock <= 0 || item.isAvailable === false || item.is_available === 0 || item.is_available === false || item.is_available === "0") return;

    const existingCartItem = cart.find(c => c.id === itemId);
    if (existingCartItem) {
        if (existingCartItem.qty < item.stock) {
            existingCartItem.qty++;
        } else {
            alert(`Sorry, only ${item.stock} portions available!`);
        }
    } else {
        cart.push({ id: item.id, name: item.name, price: item.price, qty: 1 });
    }
    renderCart();
}

function updateCartQty(itemId, change) {
    const item = cart.find(c => c.id === itemId);
    const stockItem = menuItems.find(m => m.id === itemId);

    if (item) {
        item.qty += change;
        if (item.qty > stockItem.stock) {
            item.qty = stockItem.stock;
            alert(`Stock limit reached (${stockItem.stock} max)`);
        }
        if (item.qty <= 0) {
            cart = cart.filter(c => c.id !== itemId);
        }
    }
    renderCart();
}

function renderCart() {
    const cartContainer = document.getElementById("cart-items-container");
    const cartBadge = document.getElementById("cart-badge");
    const subtotalEl = document.getElementById("cart-subtotal");
    const totalEl = document.getElementById("cart-total");
    const submitBtn = document.getElementById("btn-submit-order");

    cartContainer.innerHTML = "";
    let total = 0;
    let itemCount = 0;

    if (cart.length === 0) {
        cartContainer.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="fa-solid fa-basket-shopping fa-3x mb-2 text-secondary opacity-50"></i>
                <p>Your meal tray is currently empty.</p>
            </div>
        `;
        cartBadge.classList.add("d-none");
        submitBtn.disabled = true;
    } else {
        cart.forEach(item => {
            const lineTotal = item.price * item.qty;
            total += lineTotal;
            itemCount += item.qty;

            const cartHtml = `
                <div class="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
                    <div>
                        <h6 class="fw-bold mb-0 small">${item.name}</h6>
                        <small class="text-muted">GH₵ ${item.price.toFixed(2)} each</small>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <button class="btn btn-sm btn-outline-secondary px-2 py-0" onclick="updateCartQty(${item.id}, -1)">-</button>
                        <span class="fw-bold small">${item.qty}</span>
                        <button class="btn btn-sm btn-outline-secondary px-2 py-0" onclick="updateCartQty(${item.id}, 1)">+</button>
                        <span class="fw-bold ms-2 small">GH₵ ${lineTotal.toFixed(2)}</span>
                    </div>
                </div>
            `;
            cartContainer.insertAdjacentHTML("beforeend", cartHtml);
        });

        cartBadge.innerText = itemCount;
        cartBadge.classList.remove("d-none");
        submitBtn.disabled = false;
    }

    subtotalEl.innerText = `GH₵ ${total.toFixed(2)}`;
    totalEl.innerText = `GH₵ ${total.toFixed(2)}`;
}

// Checkout Processing
let checkoutInProgress = false;

async function processCheckout(event) {
    event.preventDefault();
    if (cart.length === 0 || checkoutInProgress) return;

    const student = JSON.parse(sessionStorage.getItem("currentStudent") || "null");
    if (!student || !student.token) {
        alert("Please log in before placing an order.");
        return;
    }

    const phone = document.getElementById("student-phone").value.trim();
    const submitButton = document.getElementById("btn-submit-order");
    checkoutInProgress = true;
    submitButton.disabled = true;

    try {
        const response = await fetch(API_URL + "/orders", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + student.token
            },
            body: JSON.stringify({
                student_phone: "+233 " + phone,
                items: cart.map(({ id, qty }) => ({ id, qty }))
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not place the order.");

        const purchasedItems = result.items.map(item => ({
            id: item.id,
            name: item.name,
            price: Number(item.price),
            qty: item.qty
        }));
        purchasedItems.forEach(item => {
            const menuItem = menuItems.find(candidate => candidate.id === item.id);
            if (menuItem) menuItem.stock -= item.qty;
        });
        orders.unshift({
            id: result.orderId,
            token: result.pickup_token,
            phone: result.student_phone,
            items: purchasedItems,
            total: Number(result.total_amount),
            status: result.status,
            paymentStatus: result.payment_status,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        });
        cart = [];
        renderCart();
        renderMenu();
        renderStudentOrders();
        updateDashboardStats();
        bootstrap.Offcanvas.getInstance(document.getElementById("cartOffcanvas"))?.hide();
        sendSMS(result.student_phone, "[Campus Canteen] Order " + result.pickup_token + " received. Payment of GH₵ " + Number(result.total_amount).toFixed(2) + " is due at pickup.");
    } catch (error) {
        console.error("Could not place order:", error);
        alert("Could not place the order: " + error.message);
    } finally {
        checkoutInProgress = false;
        submitButton.disabled = cart.length === 0;
    }
}

window.processCheckout = processCheckout;

function renderStudentOrders() {
    const container = document.getElementById("active-orders-container");
    const countBadge = document.getElementById("order-count-badge");

    const activeOrders = orders.filter(o => o.status !== "completed");
    countBadge.innerText = `${activeOrders.length} Active`;

    if (orders.length === 0) return;

    container.innerHTML = "";

    orders.forEach(order => {
        let statusBadge = "";
        let step1 = "done", step2 = "", step3 = "";

        if (order.status === "received") {
            statusBadge = '<span class="badge badge-received">Order Received</span>';
        } else if (order.status === "preparing") {
            statusBadge = '<span class="badge badge-preparing">Kitchen Preparing</span>';
            step2 = "active";
        } else if (order.status === "ready") {
            statusBadge = '<span class="badge badge-ready">READY FOR PICKUP</span>';
            step2 = "done";
            step3 = "active";
        } else if (order.status === "completed") {
            statusBadge = '<span class="badge badge-completed">Picked Up</span>';
            step2 = "done";
            step3 = "done";
        }

        const itemsSummary = order.items.map(i => `${i.qty}x ${i.name}`).join(", ");

        const card = `
            <div class="card border mb-3 shadow-sm">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="fw-bold text-primary">${order.id}</span>
                        ${statusBadge}
                    </div>
                    <div class="bg-light p-2 rounded text-center mb-3 border">
                        <small class="text-muted d-block">Pickup Token Code</small>
                        <span class="h4 fw-bold letter-spacing text-dark mb-0">${order.token}</span>
                    </div>

                    <div class="progress-steps px-3">
                        <div class="step-circle ${step1}"><i class="fa-solid fa-check"></i></div>
                        <div class="step-circle ${step2}">${step2 === 'done' ? '<i class="fa-solid fa-check"></i>' : '2'}</div>
                        <div class="step-circle ${step3}">${step3 === 'done' ? '<i class="fa-solid fa-check"></i>' : '3'}</div>
                    </div>

                    <p class="small text-muted mb-1"><strong>Items:</strong> ${itemsSummary}</p>
                    <div class="d-flex justify-content-between align-items-center small text-muted border-top pt-2 mt-2">
                        <span>${order.paymentStatus === "unpaid" ? "Due at pickup: GH₵ " : "Total: GH₵ "}${order.total.toFixed(2)}</span>
                        <span>${order.timestamp}</span>
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML("beforeend", card);
    });
}

// Kitchen Order Queue
function renderKitchenQueue() {
    const queue = document.getElementById("admin-orders-container");
    if (!queue) return;
    queue.innerHTML = "";

    if (orders.length === 0) {
        queue.innerHTML = `<div class="col-12 text-center text-muted py-5"><p>No orders in the system yet.</p></div>`;
        return;
    }

    orders.forEach(order => {
        let actionButtons = "";

        if (order.status === "received") {
            actionButtons = `<button class="btn btn-warning btn-sm fw-bold w-100" onclick="updateOrderStatus('${order.id}', 'preparing')">Start Preparing</button>`;
        } else if (order.status === "preparing") {
            actionButtons = `<button class="btn btn-info btn-sm fw-bold w-100 text-white" onclick="updateOrderStatus('${order.id}', 'ready')"><i class="fa-solid fa-bell me-1"></i> Mark Ready & Send SMS</button>`;
        } else if (order.status === "ready") {
            actionButtons = `<button class="btn btn-success btn-sm fw-bold w-100" onclick="updateOrderStatus('${order.id}', 'completed')"><i class="fa-solid fa-check-double me-1"></i> Handout Completed</button>`;
        } else {
            actionButtons = `<span class="badge bg-secondary w-100 py-2">Order Handed Out</span>`;
        }

        const itemsList = order.items.map(i => `<li class="d-flex justify-content-between"><span>${i.name}</span> <strong>x${i.qty}</strong></li>`).join("");

        const card = `
            <div class="col">
                <div class="card h-100 border-0 shadow-sm ${order.status === 'ready' ? 'border-start border-info border-4' : ''}">
                    <div class="card-header bg-white d-flex justify-content-between align-items-center">
                        <span class="fw-bold">${order.id}</span>
                        <span class="badge bg-dark">${order.token}</span>
                    </div>
                    <div class="card-body">
                        <div class="mb-2">
                            <small class="text-muted">Customer Phone:</small>
                            <div class="fw-bold">${order.phone}</div>
                            <small class="text-warning fw-bold">Payment due at pickup: GH₵ ${order.total.toFixed(2)}</small>
                        </div>
                        <ul class="list-unstyled small mb-3 border-top border-bottom py-2">
                            ${itemsList}
                        </ul>
                        <div class="d-flex justify-content-between small text-muted mb-3">
                            <span>Status: <strong class="text-uppercase">${order.status}</strong></span>
                            <span>${order.paymentStatus === "unpaid" ? "Payment due at pickup" : order.timestamp}</span>
                        </div>
                        ${actionButtons}
                    </div>
                </div>
            </div>
        `;
        queue.insertAdjacentHTML("beforeend", card);
    });
}

async function loadOrders() {
    try {
        const response = await fetch(`${API_URL}/orders`);
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Failed to load orders.");
        }

        orders = result.map(order => ({
            id: Number(order.order_id),
            token: order.pickup_token,
            phone: order.student_phone,
            items: order.items || [],
            total: Number(order.total_amount),
            status: String(order.status).toLowerCase(),
            paymentStatus: order.payment_status,
            timestamp: new Date(order.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            })
        }));

        renderKitchenQueue();
        renderStudentOrders();
        updateDashboardStats();
    } catch (error) {
        console.error("Failed to load kitchen orders:", error);
        const queue = document.getElementById("admin-orders-container");
        if (queue) {
            queue.innerHTML = `<div class="col-12"><div class="alert alert-danger">Could not load orders. Check that the backend and database are running.</div></div>`;
        }
    }
}

async function updateOrderStatus(orderId, newStatus) {
    const order = orders.find(o => String(o.id) === String(orderId));
    if (!order) return false;

    try {
        const response = await fetch(`${API_URL}/orders/${orderId}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Failed to update order status.");
        }

        order.status = newStatus;

        if (newStatus === "preparing") {
            sendSMS(order.phone, `[Campus Canteen] Chef is now preparing your order #${order.token}. Get ready to head to Counter B!`);
        } else if (newStatus === "ready") {
            sendSMS(order.phone, `[Campus Canteen] 🔔 YOUR FOOD IS READY! Show token #${order.token} at Counter B to pick up your meal now.`);
        } else if (newStatus === "completed") {
            sendSMS(order.phone, `[Campus Canteen] Order #${order.token} marked as collected. Enjoy your meal!`);
        }

        renderKitchenQueue();
        renderStudentOrders();
        updateDashboardStats();
        return true;
    } catch (error) {
        console.error("Failed to update order status:", error);
        alert(`Could not update order status: ${error.message}`);
        return false;
    }
}

window.updateOrderStatus = updateOrderStatus;

setInterval(() => {
    const adminView = document.getElementById("admin-dashboard");
    const kitchenTab = document.getElementById("kitchen-orders");
    if (adminView && !adminView.classList.contains("d-none")
        && kitchenTab && kitchenTab.classList.contains("active")) {
        loadOrders();
    }
}, 10000);

// Stock Manager
function renderStockTable() {
    const tbody = document.getElementById("stock-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    menuItems.forEach(item => {
        const isAvailable = item.isAvailable !== false;
        const row = `
            <tr>
                <td class="fw-bold">${item.name}</td>
                <td><span class="badge bg-light text-dark border">${item.category}</span></td>
                <td>GH₵ ${item.price.toFixed(2)}</td>
                <td>${isAvailable
                    ? '<span class="badge bg-success">Available</span>'
                    : '<span class="badge bg-danger">Out of Stock</span>'}</td>
                <td><button class="btn btn-sm ${isAvailable ? "btn-outline-danger" : "btn-outline-success"}" onclick="toggleStockStatus(${item.id}, ${isAvailable ? 0 : 1})">${isAvailable ? "Mark Out of Stock" : "Mark Available"}</button></td>
            </tr>
        `;
        tbody.insertAdjacentHTML("beforeend", row);
    });
}

async function loadStockManager() {
    try {
        const response = await fetch(`${API_URL}/menu/admin`);
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Failed to load menu stock.");
        }

        result.forEach(serverItem => {
            const itemId = Number(serverItem.item_id);
            let item = menuItems.find(menuItem => menuItem.id === itemId);
            if (!item) {
                item = { id: itemId, stock: 0, imageIcon: "fa-utensils" };
                menuItems.push(item);
            }
            item.name = serverItem.name;
            item.category = serverItem.category || "General";
            item.price = Number(serverItem.price);
            item.isAvailable = serverItem.is_available === true
                || serverItem.is_available === 1
                || serverItem.is_available === "1";
        });

        renderMenu();
        renderStockTable();
    } catch (error) {
        console.error("Error loading stock manager:", error);
        const tbody = document.getElementById("stock-table-body");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5"><div class="alert alert-danger mb-0">Could not load menu stock. Check the backend and database.</div></td></tr>`;
        }
    }
}

async function toggleStockStatus(itemId, newAvailability) {
    try {
        const response = await fetch(`${API_URL}/menu/${itemId}/stock`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_available: newAvailability })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Failed to update stock status.");
        }

        const item = menuItems.find(menuItem => menuItem.id === itemId);
        if (item) item.isAvailable = Boolean(newAvailability);
        renderMenu();
        renderStockTable();
    } catch (error) {
        console.error("Error updating stock:", error);
        alert(`Could not update stock status: ${error.message}`);
    }
}

async function addNewMenuItem() {
    const nameInput = document.getElementById("new-item-name");
    const categoryInput = document.getElementById("new-item-category");
    const priceInput = document.getElementById("new-item-price");
    if (!nameInput || !categoryInput || !priceInput) return;

    const name = nameInput.value.trim();
    const category = categoryInput.value.trim() || "General";
    const price = Number(priceInput.value);
    if (!name || !Number.isFinite(price) || price <= 0) {
        alert("Please enter a valid item name and positive price.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/menu`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, category, price })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Failed to add menu item.");
        }

        nameInput.value = "";
        categoryInput.value = "";
        priceInput.value = "";
        await loadStockManager();
    } catch (error) {
        console.error("Error adding menu item:", error);
        alert(`Could not add menu item: ${error.message}`);
    }
}

window.loadStockManager = loadStockManager;
window.toggleStockStatus = toggleStockStatus;
window.addNewMenuItem = addNewMenuItem;

// Stats Tracker
function updateDashboardStats() {
    document.getElementById("stat-total-orders").innerText = orders.length;
    document.getElementById("stat-preparing").innerText = orders.filter(o => o.status === "preparing").length;
    document.getElementById("stat-ready").innerText = orders.filter(o => o.status === "ready").length;

    const totalRev = orders.reduce((sum, o) => sum + (o.paymentStatus === "paid" ? o.total : 0), 0);
    document.getElementById("stat-revenue").innerText = `GH₵ ${totalRev.toFixed(2)}`;
}

async function loadSalesReport() {
    const container = document.getElementById("sales-report-container");
    if (!container) return;

    try {
        const response = await fetch(`${API_URL}/admin/sales-report`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Failed to load sales report.");
        }

        const summary = data.summary || {};
        const reportOrders = data.orders || [];
        const statusClasses = {
            received: "bg-secondary",
            preparing: "bg-warning text-dark",
            ready: "bg-info text-dark",
            completed: "bg-success",
            cancelled: "bg-danger"
        };
        const rows = reportOrders.length
            ? reportOrders.map(order => {
                const status = String(order.status || "").toLowerCase();
                return `<tr><td><strong>${order.pickup_token}</strong></td><td>${order.student_phone}</td><td>${order.items_summary || "No items"}</td><td>GH₵ ${Number(order.total_amount).toFixed(2)}</td><td><span class="badge ${statusClasses[status] || "bg-secondary"}">${status}</span></td></tr>`;
            }).join("")
            : '<tr><td colspan="5" class="text-center text-muted">No orders found today.</td></tr>';

        container.innerHTML = `
            <div class="row mb-4">
                <div class="col-md-6"><div class="card shadow-sm border-primary"><div class="card-body"><h6 class="text-muted">Today's Orders</h6><h3>${Number(summary.total_orders_count) || 0}</h3></div></div></div>
                <div class="col-md-6"><div class="card shadow-sm border-success"><div class="card-body"><h6 class="text-muted">Today's Revenue</h6><h3 class="text-success">GH₵ ${Number(summary.total_revenue).toFixed(2)}</h3></div></div></div>
            </div>
            <h5 class="mb-3">Today's Order History</h5>
            <div class="table-responsive"><table class="table table-bordered align-middle">
                <thead class="table-light"><tr><th>Token</th><th>Phone</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>${rows}</tbody>
            </table></div>
        `;
    } catch (error) {
        console.error("Error loading sales report:", error);
        container.innerHTML = `<div class="alert alert-danger">Could not load sales report: ${error.message}</div>`;
    }
}

window.loadSalesReport = loadSalesReport;

async function trackStudentOrder() {
    const tokenInput = document.getElementById("track-token-input");
    const resultContainer = document.getElementById("track-result-container");
    if (!tokenInput || !resultContainer) return;

    const token = tokenInput.value.trim().toUpperCase();
    if (!token) {
        resultContainer.innerHTML = `<div class="alert alert-warning mt-3 mb-0">Please enter your pickup token.</div>`;
        return;
    }

    try {
        const response = await fetch(`${API_URL}/orders/token/${encodeURIComponent(token)}`);
        const order = await response.json();
        if (!response.ok) {
            resultContainer.innerHTML = `<div class="alert alert-danger mt-3 mb-0">${order.error || "Token not found. Please check your token and try again."}</div>`;
            return;
        }

        const status = String(order.status).toLowerCase();
        const statusDetails = {
            received: { badgeClass: "bg-warning text-dark", message: "Received - Waiting for kitchen to start" },
            preparing: { badgeClass: "bg-info text-dark", message: "Preparing - Kitchen is cooking your meal!" },
            ready: { badgeClass: "bg-success", message: "Ready for Pickup! Head to the counter." },
            completed: { badgeClass: "bg-dark", message: "Completed - Order picked up" }
        };
        const statusInfo = statusDetails[status] || {
            badgeClass: "bg-secondary",
            message: status || "Status unavailable"
        };

        resultContainer.innerHTML = `
            <div class="card bg-light border-0 mt-3">
                <div class="card-body">
                    <h6 class="text-muted mb-1">Token: <strong>${order.pickup_token}</strong></h6>
                    <p class="mb-2"><strong>Status:</strong> <span class="badge ${statusInfo.badgeClass}">${statusInfo.message}</span></p>
                    <p class="mb-1 text-muted small"><strong>Items:</strong> ${order.items_summary || "No items"}</p>
                    <p class="mb-0 small"><strong>Total Amount:</strong> GH₵ ${Number(order.total_amount).toFixed(2)}</p>
                </div>
            </div>
        `;
    } catch (error) {
        console.error("Error tracking order:", error);
        resultContainer.innerHTML = `<div class="alert alert-danger mt-3 mb-0">Server error while tracking order.</div>`;
    }
}

window.trackStudentOrder = trackStudentOrder;

// Counter Token Verification
async function verifyPickupToken(event) {
    event.preventDefault();
    const tokenInput = document.getElementById("token-input").value.trim().toUpperCase();
    const resultDiv = document.getElementById("token-verify-result");

    if (!tokenInput) {
        resultDiv.innerHTML = `<div class="alert alert-danger mt-3">Please enter a pickup token.</div>`;
        return;
    }

    try {
        const response = await fetch(`${API_URL}/orders/token/${encodeURIComponent(tokenInput)}`);
        const order = await response.json();
        if (!response.ok) {
            resultDiv.innerHTML = `<div class="alert alert-danger mt-3">${order.error || "Token not found or invalid."}</div>`;
            return;
        }

        const status = String(order.status).toLowerCase();
        let matchingOrder = orders.find(o => String(o.id) === String(order.order_id));
        if (matchingOrder) {
            matchingOrder.status = status;
        } else {
            matchingOrder = {
                id: Number(order.order_id),
                token: order.pickup_token,
                phone: order.student_phone,
                items: [],
                total: Number(order.total_amount),
                status,
                timestamp: new Date(order.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                })
            };
            orders.push(matchingOrder);
        }

        const completionAction = status === "completed"
            ? `<div class="alert alert-warning mb-0">This order has already been completed.</div>`
            : `<button class="btn btn-success" onclick="completeVerifiedOrder(${Number(order.order_id)})">Mark as Completed &amp; Hand Over</button>`;

        resultDiv.innerHTML = `
            <div class="card shadow-sm mt-3">
                <div class="card-body">
                    <h5 class="card-title">Token: <strong>${order.pickup_token}</strong> <span class="badge bg-info text-dark">${status}</span></h5>
                    <p class="mb-1 text-muted">Phone: ${order.student_phone}</p>
                    <p class="mb-1"><strong>Items:</strong> ${order.items_summary || "No items"}</p>
                    <p class="mb-3"><strong>Total:</strong> GH₵ ${Number(order.total_amount).toFixed(2)}</p>
                    ${completionAction}
                </div>
            </div>
        `;
    } catch (error) {
        console.error("Error verifying token:", error);
        resultDiv.innerHTML = `<div class="alert alert-danger mt-3">Server error during verification.</div>`;
    }
}

async function completeVerifiedOrder(orderId) {
    const resultDiv = document.getElementById("token-verify-result");
    const updated = await updateOrderStatus(orderId, "completed");
    if (!updated) return;

    resultDiv.innerHTML = `<div class="alert alert-success mt-3">Order verified and marked as Completed!</div>`;
    document.getElementById("token-input").value = "";
}

window.verifyPickupToken = verifyPickupToken;
window.completeVerifiedOrder = completeVerifiedOrder;

async function loadMenu() {
    try {
        const response = await fetch(`${API_URL}/menu`);
        const menuItems = await response.json();
        
        const menuContainer = document.getElementById('menu-container'); // Update with your actual HTML container ID
        menuContainer.innerHTML = '';

        menuItems.forEach(item => {
            menuContainer.innerHTML += `
                <div class="menu-card">
                    <img src="${item.image_url}" alt="${item.name}">
                    <h3>${item.name}</h3>
                    <p>Category: ${item.category}</p>
                    <p class="price">GH₵ ${parseFloat(item.price).toFixed(2)}</p>
                    <button onclick="addToCart(${item.item_id}, '${item.name}', ${item.price})">Add to Order</button>
                </div>
            `;
        });
    } catch (error) {
        console.error('Failed to load menu from server:', error);
    }
}

// Call this when your page loads
window.addEventListener('DOMContentLoaded', loadMenu);
window.updateOrderStatus = updateOrderStatus;