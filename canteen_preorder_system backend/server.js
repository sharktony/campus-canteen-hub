require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const db = require('./db');
const { sendOrderSMS, sendOrderReadySMS } = require('./sms');

const scrypt = promisify(crypto.scrypt);
const app = express();
const publicDirectory = path.join(__dirname, '..', 'canteen');
const uploadsDirectory = path.join(publicDirectory, 'uploads');
app.use(express.json());
app.use(cors());
app.use(express.static(publicDirectory));

function getStudentSessionSecret() {
    const secret = process.env.STUDENT_SESSION_SECRET;
    return typeof secret === 'string' && Buffer.byteLength(secret, 'utf8') >= 32
        ? secret
        : null;
}

function createStudentSessionToken(studentId) {
    const secret = getStudentSessionSecret();
    if (!secret) throw new Error('STUDENT_SESSION_SECRET must be at least 32 bytes');

    const payload = Buffer.from(JSON.stringify({
        studentId,
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000)
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${signature}`;
}

function requireStudent(req, res, next) {
    const secret = getStudentSessionSecret();
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const [payload, signature, ...extra] = token.split('.');

    if (!secret || !payload || !signature || extra.length
        || !/^[a-f\d]{64}$/i.test(signature)) {
        return res.status(401).json({ error: 'Student login is required' });
    }

    const expected = crypto.createHmac('sha256', secret).update(payload).digest();
    const supplied = Buffer.from(signature, 'hex');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        return res.status(401).json({ error: 'Student session is invalid' });
    }

    try {
        const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!Number.isSafeInteger(session.studentId) || session.studentId < 1
            || !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= Date.now()) {
            return res.status(401).json({ error: 'Student session has expired' });
        }
        req.studentId = session.studentId;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Student session is invalid' });
    }
}

async function hashStudentPassword(password) {
    const salt = crypto.randomBytes(16);
    const derivedKey = await scrypt(password, salt, 64);
    return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

async function verifyStudentPassword(password, storedPassword) {
    if (typeof storedPassword !== 'string') return false;
    const parts = storedPassword.split('$');

    if (parts.length === 3 && parts[0] === 'scrypt'
        && /^[a-f\d]{32}$/i.test(parts[1])
        && /^[a-f\d]{128}$/i.test(parts[2])) {
        const salt = Buffer.from(parts[1], 'hex');
        const expectedKey = Buffer.from(parts[2], 'hex');
        const derivedKey = await scrypt(password, salt, expectedKey.length);
        return crypto.timingSafeEqual(derivedKey, expectedKey);
    }

    const passwordBuffer = Buffer.from(password);
    const storedBuffer = Buffer.from(storedPassword);
    return passwordBuffer.length === storedBuffer.length
        && crypto.timingSafeEqual(passwordBuffer, storedBuffer);
}

// Verify the admin PIN configured in the backend environment
app.post('/api/admin/login', (req, res) => {
    const adminPin = process.env.ADMIN_PIN;
    const { pin } = req.body;

    if (!adminPin) {
        console.error('Admin login is unavailable because ADMIN_PIN is not configured.');
        return res.status(503).json({ success: false, error: 'Admin login is not configured' });
    }
    if (typeof pin !== 'string' || pin.length === 0) {
        return res.status(400).json({ success: false, error: 'PIN is required' });
    }

    if (pin === adminPin) {
        return res.json({ success: true, message: 'Admin authenticated successfully' });
    }
    res.status(401).json({ success: false, error: 'Incorrect PIN' });
});

// Register a student account and store a password hash
app.post('/api/student/register', async (req, res) => {
    const { full_name, email, phone, password } = req.body || {};
    const fullName = typeof full_name === 'string' ? full_name.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!fullName || !normalizedEmail || typeof password !== 'string'
        || password.length < 8 || password.length > 1024) {
        return res.status(400).json({ error: 'Name and email are required; password must be 8 to 1024 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (phone !== undefined && phone !== null && typeof phone !== 'string') {
        return res.status(400).json({ error: 'Phone must be a string' });
    }

    try {
        const passwordHash = await hashStudentPassword(password);
        await db.query(
            'INSERT INTO students (full_name, email, phone, password) VALUES (?, ?, ?, ?)',
            [fullName, normalizedEmail, phone || null, passwordHash]
        );
        res.status(201).json({ success: true, message: 'Account created successfully!' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email is already registered' });
        }
        console.error('Error registering student:', err);
        res.status(500).json({ error: 'Database error during registration' });
    }
});

// Authenticate a student and migrate legacy plaintext passwords to hashes
app.post('/api/student/login', async (req, res) => {
    const { email, password } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalizedEmail || typeof password !== 'string' || password.length === 0 || password.length > 1024) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    if (!getStudentSessionSecret()) {
        console.error('Student login is unavailable because STUDENT_SESSION_SECRET is missing or shorter than 32 bytes.');
        return res.status(503).json({ error: 'Student login is not configured' });
    }

    try {
        const [rows] = await db.query(
            'SELECT student_id, full_name, email, phone, password FROM students WHERE email = ? LIMIT 1',
            [normalizedEmail]
        );
        if (rows.length === 0 || !await verifyStudentPassword(password, rows[0].password)) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const student = rows[0];
        if (!student.password.startsWith('scrypt$')) {
            const passwordHash = await hashStudentPassword(password);
            await db.query(
                'UPDATE students SET password = ? WHERE student_id = ?',
                [passwordHash, student.student_id]
            );
        }

        res.json({
            success: true,
            token: createStudentSessionToken(student.student_id),
            student: {
                id: student.student_id,
                name: student.full_name,
                email: student.email,
                phone: student.phone
            }
        });
    } catch (err) {
        console.error('Error logging in student:', err);
        res.status(500).json({ error: 'Database error during login' });
    }
});

// 1. Get All Menu Items & Live Stock
app.get('/api/menu', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM menu_items WHERE is_available = TRUE');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all menu items for the Stock Manager
app.get('/api/menu/admin', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT item_id, name, price, category, is_available, daily_stock, image_url FROM menu_items ORDER BY item_id'
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching menu items:', err);
        res.status(500).json({ error: 'Failed to load menu stock' });
    }
});

// Add a menu item
app.post('/api/menu', async (req, res) => {
    const { name, category, price, daily_stock } = req.body || {};
    const itemName = typeof name === 'string' ? name.trim() : '';
    const itemPrice = Number(price);
    const initialStock = daily_stock === undefined ? 0 : Number(daily_stock);

    if (!itemName || price === undefined || price === null || price === ''
        || !Number.isFinite(itemPrice) || itemPrice <= 0
        || !Number.isSafeInteger(initialStock) || initialStock < 0 || initialStock > 2147483647) {
        return res.status(400).json({ error: 'Enter a valid item name, positive price, and whole-number stock of 0 or more' });
    }

    try {
        const [result] = await db.query(
            'INSERT INTO menu_items (name, category, price, daily_stock, is_available) VALUES (?, ?, ?, ?, 1)',
            [itemName, typeof category === 'string' && category.trim() ? category.trim() : 'General', itemPrice, initialStock]
        );
        res.status(201).json({
            message: 'Menu item added successfully',
            item_id: result.insertId
        });
    } catch (err) {
        console.error('Error adding menu item:', err);
        res.status(500).json({ error: 'Failed to add menu item' });
    }
});

app.put('/api/menu/:id/quantity', async (req, res) => {
    const itemId = Number(req.params.id);
    const dailyStock = req.body && req.body.daily_stock;

    if (!Number.isSafeInteger(itemId) || itemId < 1) {
        return res.status(400).json({ error: 'A valid menu item ID is required' });
    }
    if (!Number.isSafeInteger(dailyStock) || dailyStock < 0 || dailyStock > 2147483647) {
        return res.status(400).json({ error: 'Stock must be a whole number from 0 to 2147483647' });
    }

    try {
        const [result] = await db.query(
            'UPDATE menu_items SET daily_stock = ? WHERE item_id = ?',
            [dailyStock, itemId]
        );
        if (result.affectedRows === 0) {
            const [rows] = await db.query(
                'SELECT item_id FROM menu_items WHERE item_id = ?',
                [itemId]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Menu item not found' });
            }
        }
        res.json({ message: 'Stock quantity updated successfully', daily_stock: dailyStock });
    } catch (error) {
        console.error('Error updating menu quantity:', error);
        res.status(500).json({ error: 'Failed to update stock quantity' });
    }
});

app.post('/api/menu/:id/image', express.raw({ type: 'application/octet-stream', limit: '5mb' }), async (req, res) => {
    const itemId = Number(req.params.id);
    if (!Number.isSafeInteger(itemId) || itemId < 1) {
        return res.status(400).json({ error: 'A valid menu item ID is required' });
    }

    const image = req.body;
    if (!Buffer.isBuffer(image) || image.length === 0) {
        return res.status(400).json({ error: 'An image file is required' });
    }

    let extension;
    if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) {
        extension = 'jpg';
    } else if (image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        extension = 'png';
    } else if (image.length >= 12
        && image.toString('ascii', 0, 4) === 'RIFF'
        && image.toString('ascii', 8, 12) === 'WEBP') {
        extension = 'webp';
    } else {
        return res.status(415).json({ error: 'Use a JPEG, PNG, or WebP image' });
    }

    try {
        const [rows] = await db.query(
            'SELECT image_url FROM menu_items WHERE item_id = ?',
            [itemId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Menu item not found' });
        }

        await fs.mkdir(uploadsDirectory, { recursive: true });
        const filename = `${crypto.randomBytes(16).toString('hex')}.${extension}`;
        const imagePath = path.join(uploadsDirectory, filename);
        const imageUrl = `/uploads/${filename}`;
        await fs.writeFile(imagePath, image, { flag: 'wx' });

        try {
            await db.query(
                'UPDATE menu_items SET image_url = ? WHERE item_id = ?',
                [imageUrl, itemId]
            );
        } catch (error) {
            try {
                await fs.unlink(imagePath);
            } catch (cleanupError) {
                console.error('Could not remove an image after its database update failed:', cleanupError);
            }
            throw error;
        }

        const previousImageUrl = rows[0].image_url;
        if (typeof previousImageUrl === 'string'
            && /^\/uploads\/[a-f\d]{32}\.(jpg|png|webp)$/i.test(previousImageUrl)) {
            try {
                await fs.unlink(path.join(uploadsDirectory, path.basename(previousImageUrl)));
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error('Could not remove the previous menu image:', error);
                }
            }
        }

        res.json({ message: 'Dish image uploaded successfully', image_url: imageUrl });
    } catch (error) {
        console.error('Error uploading menu image:', error);
        res.status(500).json({ error: 'Failed to save dish image' });
    }
});

// Update menu item availability (1 = available, 0 = out of stock)
app.put('/api/menu/:id/stock', async (req, res) => {
    const { is_available } = req.body;
    if (![0, 1, false, true].includes(is_available)) {
        return res.status(400).json({ error: 'is_available must be 0 or 1' });
    }

    try {
        const [result] = await db.query(
            'UPDATE menu_items SET is_available = ? WHERE item_id = ?',
            [Number(is_available), req.params.id]
        );
        if (result.affectedRows === 0) {
            const [rows] = await db.query(
                'SELECT item_id FROM menu_items WHERE item_id = ?',
                [req.params.id]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Menu item not found' });
            }
        }
        res.json({ message: 'Stock status updated successfully' });
    } catch (err) {
        console.error('Error updating stock status:', err);
        res.status(500).json({ error: 'Failed to update stock status' });
    }
});

// Place an authenticated order; payment is due at pickup.
app.post('/api/orders', requireStudent, async (req, res) => {
    const { student_phone, items } = req.body || {};
    if (typeof student_phone !== 'string' || !student_phone.trim() || student_phone.trim().length > 32) {
        return res.status(400).json({ error: 'A valid student phone number is required' });
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
        return res.status(400).json({ error: 'The order must contain between 1 and 50 items' });
    }

    const normalizedItems = [];
    const seenIds = new Set();
    for (const item of items) {
        const id = Number(item && item.id);
        const qty = Number(item && item.qty);
        if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(qty) || qty < 1 || qty > 100
            || seenIds.has(id)) {
            return res.status(400).json({ error: 'Order items must have unique item IDs and quantities from 1 to 100' });
        }
        seenIds.add(id);
        normalizedItems.push({ id, qty });
    }

    let connection;
    let transactionStarted = false;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;

        const orderLines = [];
        let totalPesewas = 0;
        for (const item of normalizedItems) {
            const [rows] = await connection.query(
                'SELECT item_id, name, price, daily_stock, is_available FROM menu_items WHERE item_id = ? FOR UPDATE',
                [item.id]
            );
            const menuItem = rows[0];
            if (!menuItem) {
                await connection.rollback();
                transactionStarted = false;
                return res.status(400).json({ error: 'Menu item ' + item.id + ' no longer exists' });
            }
            if (Number(menuItem.is_available) !== 1 || Number(menuItem.daily_stock) < item.qty) {
                await connection.rollback();
                transactionStarted = false;
                return res.status(409).json({ error: 'Menu item ' + item.id + ' is unavailable or has insufficient stock' });
            }

            const unitPricePesewas = Math.round(Number(menuItem.price) * 100);
            if (!Number.isSafeInteger(unitPricePesewas) || unitPricePesewas <= 0) {
                await connection.rollback();
                transactionStarted = false;
                return res.status(500).json({ error: 'Menu item ' + item.id + ' has an invalid price' });
            }
            const lineTotalPesewas = unitPricePesewas * item.qty;
            totalPesewas += lineTotalPesewas;
            if (!Number.isSafeInteger(totalPesewas)) {
                await connection.rollback();
                transactionStarted = false;
                return res.status(400).json({ error: 'Order total is too large' });
            }
            orderLines.push({
                id: item.id,
                name: menuItem.name,
                qty: item.qty,
                price: unitPricePesewas / 100,
                subtotal: lineTotalPesewas / 100
            });
        }

        const totalAmount = totalPesewas / 100;
        const pickupToken = 'CB-' + Math.floor(1000 + Math.random() * 9000);
        const [orderResult] = await connection.query(
            "INSERT INTO orders (student_id, student_phone, total_amount, payment_status, order_status, pickup_token) VALUES (?, ?, ?, 'unpaid', 'received', ?)",
            [req.studentId, student_phone.trim(), totalAmount, pickupToken]
        );
        const orderId = orderResult.insertId;
        for (const item of orderLines) {
            await connection.query(
                'INSERT INTO order_items (order_id, item_id, quantity, subtotal) VALUES (?, ?, ?, ?)',
                [orderId, item.id, item.qty, item.subtotal]
            );
            await connection.query(
                'UPDATE menu_items SET daily_stock = daily_stock - ? WHERE item_id = ?',
                [item.qty, item.id]
            );
        }

        await connection.commit();
        transactionStarted = false;
        try {
            await sendOrderSMS(student_phone.trim(), pickupToken, totalAmount);
        } catch (smsError) {
            console.error('Could not log order SMS simulation:', smsError);
        }
        res.status(201).json({
            success: true,
            orderId,
            pickup_token: pickupToken,
            student_phone: student_phone.trim(),
            total_amount: totalAmount,
            status: 'received',
            payment_status: 'unpaid',
            items: orderLines
        });
    } catch (err) {
        if (transactionStarted) await connection.rollback();
        console.error('Error saving pay-at-pickup order:', err);
        res.status(500).json({ error: 'Could not save the order' });
    } finally {
        if (connection) connection.release();
    }
});

// 3. Get All Orders with Their Items for the Kitchen
app.get('/api/orders', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                o.order_id,
                o.student_phone,
                o.total_amount,
                o.payment_status,
                o.pickup_token,
                o.order_status AS status,
                o.created_at,
                oi.item_id,
                oi.quantity,
                oi.subtotal,
                m.name AS item_name
            FROM orders o
            LEFT JOIN order_items oi ON o.order_id = oi.order_id
            LEFT JOIN menu_items m ON oi.item_id = m.item_id
            ORDER BY o.created_at DESC, o.order_id DESC
        `);

        const orders = new Map();
        for (const row of rows) {
            let order = orders.get(row.order_id);
            if (!order) {
                order = {
                    order_id: row.order_id,
                    student_phone: row.student_phone,
                    total_amount: row.total_amount,
                    payment_status: row.payment_status,
                    pickup_token: row.pickup_token,
                    status: row.status,
                    created_at: row.created_at,
                    items: []
                };
                orders.set(row.order_id, order);
            }

            if (row.item_id !== null) {
                order.items.push({
                    id: row.item_id,
                    name: row.item_name,
                    qty: row.quantity,
                    price: row.quantity ? row.subtotal / row.quantity : 0
                });
            }
        }

        res.json([...orders.values()]);
    } catch (err) {
        console.error('Error fetching orders:', err);
        res.status(500).json({ error: 'Failed to load orders' });
    }
});

// Get the all-time sales summary and order history
app.get('/api/admin/sales-report', async (req, res) => {
    try {
        const [summaryResult, ordersResult] = await Promise.all([
            db.query(`
                SELECT
                    COUNT(order_id) AS total_orders_count,
                    COALESCE(SUM(CASE WHEN LOWER(payment_status) = 'paid' THEN total_amount ELSE 0 END), 0) AS total_revenue
                FROM orders
                WHERE LOWER(order_status) != 'cancelled'
            `),
            db.query(`
                SELECT
                    o.order_id,
                    o.pickup_token,
                    o.student_phone,
                    o.total_amount,
                    o.payment_status,
                    o.order_status AS status,
                    o.created_at,
                    GROUP_CONCAT(
                        CONCAT(oi.quantity, 'x ', m.name)
                        ORDER BY oi.item_id
                        SEPARATOR ', '
                    ) AS items_summary
                FROM orders o
                LEFT JOIN order_items oi ON o.order_id = oi.order_id
                LEFT JOIN menu_items m ON oi.item_id = m.item_id
                WHERE LOWER(o.order_status) != 'cancelled'
                GROUP BY o.order_id
                ORDER BY o.created_at DESC
            `)
        ]);

        res.json({
            summary: summaryResult[0][0],
            orders: ordersResult[0]
        });
    } catch (err) {
        console.error('Error fetching sales report:', err);
        res.status(500).json({ error: 'Failed to load sales report' });
    }
});

// 3. Update Order Status (Kitchen Workflow: received -> preparing -> ready -> completed)
const updateOrderStatus = async (req, res) => {
    const { status } = req.body;
    const orderId = req.params.id;
    const validStatuses = ['received', 'preparing', 'ready', 'completed'];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
    }

    let connection;
    let transactionStarted = false;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;

        const [orders] = await connection.query(
            'SELECT order_status, student_phone, pickup_token FROM orders WHERE order_id = ? FOR UPDATE',
            [orderId]
        );
        if (orders.length === 0) {
            await connection.rollback();
            transactionStarted = false;
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orders[0];
        await connection.query(
            'UPDATE orders SET order_status = ? WHERE order_id = ?',
            [status, orderId]
        );
        await connection.commit();
        transactionStarted = false;
        connection.release();
        connection = null;

        if (order.order_status === 'preparing' && status === 'ready') {
            try {
                await sendOrderReadySMS(order.student_phone, order.pickup_token);
            } catch (smsError) {
                console.error(`Could not send order-ready SMS for order ${orderId}:`, smsError);
            }
        }

        res.json({ message: `Order status updated to ${status}` });
    } catch (err) {
        if (transactionStarted) await connection.rollback();
        console.error('Error updating order status:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
};

app.patch('/api/orders/:id/status', updateOrderStatus);
app.put('/api/orders/:id/status', updateOrderStatus);

// 4. Look Up an Order by Pickup Token
const lookupOrderByToken = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                o.order_id,
                o.student_phone,
                o.total_amount,
                o.payment_status,
                o.pickup_token,
                o.order_status AS status,
                o.created_at,
                GROUP_CONCAT(
                    CONCAT(oi.quantity, 'x ', m.name)
                    ORDER BY oi.item_id
                    SEPARATOR ', '
                ) AS items_summary
            FROM orders o
            LEFT JOIN order_items oi ON o.order_id = oi.order_id
            LEFT JOIN menu_items m ON oi.item_id = m.item_id
            WHERE o.pickup_token = ?
            GROUP BY o.order_id
        `, [req.params.token]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Pickup token not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('Error looking up pickup token:', err);
        res.status(500).json({ error: 'Database error during lookup' });
    }
};

app.get('/api/orders/token/:token', lookupOrderByToken);
app.get('/api/orders/verify/:token', lookupOrderByToken);

async function initializeOrderSchema() {
    const [imageColumns] = await db.query("SHOW COLUMNS FROM menu_items LIKE 'image_url'");
    if (imageColumns.length === 0) {
        await db.query('ALTER TABLE menu_items ADD COLUMN image_url VARCHAR(512) NULL');
    }

    const [studentColumns] = await db.query("SHOW COLUMNS FROM orders LIKE 'student_id'");
    if (studentColumns.length === 0) {
        await db.query('ALTER TABLE orders ADD COLUMN student_id BIGINT UNSIGNED NULL');
    }

    const [paymentStatusColumns] = await db.query("SHOW COLUMNS FROM orders LIKE 'payment_status'");
    if (paymentStatusColumns.length === 0) {
        await db.query("ALTER TABLE orders ADD COLUMN payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid'");
    } else if (String(paymentStatusColumns[0].Type).toLowerCase().startsWith('enum(')) {
        await db.query("ALTER TABLE orders MODIFY payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid'");
    }
}

const PORT = process.env.PORT || 5000;
initializeOrderSchema().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Canteen Backend Server running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Unable to initialize order schema:', err);
    process.exitCode = 1;
});