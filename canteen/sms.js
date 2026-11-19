const smsStyles = document.createElement("style");
smsStyles.textContent = `
    .sms-toast {
        background: #1e293b;
        color: #f8fafc;
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
        border-left: 5px solid #3b82f6;
    }
`;
document.head.appendChild(smsStyles);

function sendSMS(phone, message) {
    let container = document.getElementById("sms-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "sms-toast-container";
        container.className = "toast-container position-fixed bottom-0 end-0 p-3";
        container.style.zIndex = "1090";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = "toast sms-toast show p-3 mb-2";
    toast.setAttribute("role", "alert");
    toast.setAttribute("aria-live", "assertive");
    toast.setAttribute("aria-atomic", "true");

    const header = document.createElement("div");
    header.className = "d-flex justify-content-between";

    const title = document.createElement("strong");
    title.className = "text-info";
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-comment-sms me-2";
    title.append(icon, document.createTextNode("SMS Alert"));

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "btn-close btn-close-white";
    closeButton.setAttribute("aria-label", "Close SMS alert");
    closeButton.addEventListener("click", () => toast.remove());
    header.append(title, closeButton);

    const recipient = document.createElement("div");
    recipient.className = "small text-muted mt-1";
    recipient.textContent = `To: ${phone}`;

    const body = document.createElement("div");
    body.className = "mt-1";
    body.textContent = message;

    toast.append(header, recipient, body);
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
}

window.sendSMS = sendSMS;
