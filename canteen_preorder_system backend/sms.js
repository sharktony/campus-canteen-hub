function normalizeGhanaRecipient(phone) {
    if (typeof phone !== 'string') return null;

    let digits = phone.trim().replace(/\D/g, '');
    if (digits.startsWith('0')) {
        digits = `233${digits.slice(1)}`;
    } else if (digits.length === 9) {
        digits = `233${digits}`;
    }

    return /^233\d{9}$/.test(digits) ? digits : null;
}

function logSimulatedSMS(recipient, senderId, smsMessage, reason) {
    console.log('\n==================================================');
    console.log('📱 [SMS GATEWAY FALLBACK / DEMO SIMULATION]');
    console.log(`To      : +${recipient}`);
    console.log(`Sender  : ${senderId}`);
    console.log(`Message : ${smsMessage}`);
    console.log(`Note    : ${reason}`);
    console.log('==================================================\n');
    return { status: 'simulated', recipient, message: smsMessage };
}

function sendOrderSMS(studentPhone, pickupToken, totalAmount) {
    const smsMessage = `Your Campus Canteen order token is ${pickupToken}. Total: GHS ${totalAmount}. Present this at the counter.`;
    return sendSMSMessage(studentPhone, smsMessage);
}

function sendOrderReadySMS(studentPhone, pickupToken) {
    const smsMessage = `[Campus Canteen] Your order ${pickupToken} is ready for pickup. Please show your token at the counter.`;
    return sendSMSMessage(studentPhone, smsMessage);
}

async function sendSMSMessage(studentPhone, smsMessage) {
    const senderId = process.env.MNOTIFY_SENDER_ID || 'CanteenHub';
    const apiKey = process.env.MNOTIFY_API_KEY;

    const recipient = normalizeGhanaRecipient(studentPhone);
    if (!recipient) {
        console.warn('Order SMS was not sent because the student phone number is invalid.');
        return null;
    }

    if (!apiKey || !apiKey.trim()) {
        return logSimulatedSMS(recipient, senderId, smsMessage, 'MNOTIFY_API_KEY not configured');
    }

    try {
        const endpoint = new URL('https://api.mnotify.com/api/sms/quick');
        endpoint.searchParams.set('key', apiKey.trim());

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                recipient: [recipient],
                sender: senderId,
                message: smsMessage,
                is_schedule: false,
                schedule_date: ''
            })
        });

        const responseText = await response.text();
        let data = null;
        try {
            data = responseText ? JSON.parse(responseText) : null;
        } catch {
            data = null;
        }

        if (!response.ok || !data || data.status !== 'success') {
            const details = data && (data.message || data.error)
                ? data.message || data.error
                : response.statusText || 'Invalid response from mNotify';
            return logSimulatedSMS(
                recipient,
                senderId,
                smsMessage,
                `Gateway returned HTTP ${response.status} (${details})`
            );
        }

        console.log(`✅ Live Order SMS sent successfully to +${recipient} via mNotify.`);
        return data;
    } catch (error) {
        return logSimulatedSMS(
            recipient,
            senderId,
            smsMessage,
            `Network/Gateway unreachable (${error.message})`
        );
    }
}

module.exports = { sendOrderSMS, sendOrderReadySMS };