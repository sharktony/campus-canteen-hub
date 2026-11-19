# Pay-at-pickup orders

Student checkout requires a logged-in account. The backend calculates prices
from current menu items, checks availability and stock, records the order as
unpaid, and deducts stock in one database transaction. Payment is collected at
pickup. Order confirmation SMS is sent through mNotify when configured. When
the kitchen marks an order ready, the backend sends a pickup-ready SMS as well.
Browser SMS previews live in `../canteen/sms.js`; the mNotify sender is in
`sms.js` beside `server.js`. Add your mNotify API key to the backend `.env` as
`MNOTIFY_API_KEY` and, if needed, set `MNOTIFY_SENDER_ID` to your approved
sender ID. The Quick SMS endpoint expects Ghana-local numbers.

Configure `STUDENT_SESSION_SECRET` as at least 32 random bytes (for example,
generate a 64-character hexadecimal value with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
The backend has no default secret and keeps student login disabled if this
setting is missing or too short. Do not commit the generated secret.

## Open the login page on a phone

The backend serves the `canteen` page and its API from the same origin. Start
the backend from this directory with `node server.js` after configuring the
database and `STUDENT_SESSION_SECRET`. Connect the phone and computer to the
same Wi-Fi network, find the computer's IPv4 address with `ipconfig`, then open
`http://<computer-ip>:5000` in the phone's browser. If Windows Firewall prompts
you, allow Node.js on your private network. Do not expose this HTTP server to
the public internet; use a properly secured HTTPS deployment for that.

Alternatively, if you serve the frontend with Live Server on port 5500, open
`http://<computer-ip>:5500` on the phone and allow ports 5500 and 5000 through
Windows Firewall on the private network.

Use the moon/sun button in the navigation bar to switch between light and dark
mode. The selected theme is saved in that browser.

To add or replace a dish photo, open Kitchen Admin, go to Stock Manager, and
choose an image in that dish's Dish Image field. JPEG, PNG, and WebP files up
to 5 MB are supported.

To add stock to an existing dish, enter its quantity in the Stock Manager's
Stock field and select Save. New dishes also have an Initial stock field.
