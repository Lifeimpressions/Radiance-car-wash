# Radiance Car Wash – booking app

Customer booking app and admin console for Radiance Car Wash.

- **Frontend:** plain HTML, CSS and JavaScript. No build step. Hosted free on GitHub Pages.
- **Backend:** Supabase (logins + database).

```
index.html            the app page
css/styles.css        colours and layout
js/config.js          YOUR Supabase details go here
js/app.js             the app
assets/               banner, logo, icon
supabase/schema.sql   database setup (run once in Supabase)
```

## Setup (about 20 minutes)

### 1. Create the Supabase project

1. Go to https://supabase.com, sign up, and click **New project**. Pick the region closest to India (Mumbai). Save the database password somewhere safe.
2. Open **SQL Editor > New query**. Open `supabase/schema.sql` from this package, copy everything, paste it, and click **Run**. It should say "Success".
3. Open **Authentication > Sign In / Providers > Email** and switch **Confirm email OFF**, then Save.
   Customers log in with a mobile number, so there is no email to confirm. Registration will not work until this is off.
4. Open **Project Settings > API** (or the **Connect** button) and copy:
   - the **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - the **anon public** key

### 2. Put your Supabase details in the app

Open `js/config.js` in any text editor and replace the two placeholder values:

```js
SUPABASE_URL: 'https://abcdefgh.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...',
```

The anon key is meant to be public. **Never** paste the `service_role` key anywhere in these files.

### 3. Put it on GitHub Pages

1. On https://github.com click **New repository**. Name it e.g. `radiance-car-wash`, set it to **Public**, and create it.
2. Click **uploading an existing file**, drag in **everything inside this folder** (including the `css`, `js`, `assets` and `supabase` folders), and click **Commit changes**.
3. Go to **Settings > Pages**. Under "Build and deployment" choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and Save.
4. After a minute or two your app is live at
   `https://YOUR-GITHUB-USERNAME.github.io/radiance-car-wash/`

Share that link with customers. On a phone they can use the browser's "Add to Home Screen" to get an app icon (works on Android and iPhone).

### 4. Make yourself the admin

1. Open your live app and **Register** with the shop owner's mobile number and a strong password.
2. In Supabase **SQL Editor** run (with your number):

   ```sql
   update public.profiles set role = 'admin' where phone = '7449250989';
   ```
3. Log out and log in again. You now see the admin console. Repeat for any staff member who needs admin access.

## What each side can do

**Customers:** register and log in with mobile number + password, book a slot (vehicle, package, day, time, coupon), see and cancel their bookings, edit their details, change password, request the monthly package.

**Admin:**

| Tab | What it shows |
| --- | --- |
| Upcoming | Schedule by day, with Mark done / Cancel |
| All bookings | Every booking (last 400 days), search and status filter |
| Cancelled | Cancelled bookings, who cancelled, value lost |
| Monthly packages | Requests, holders, washes used, add a package |
| Last month | Washes, revenue, average bill, cancellations, new customers, breakdowns |
| Marketing | Offer banner, coupon codes, WhatsApp promos, service reminders |
| Customers | Customer list, reset a forgotten password |
| Settings | Opening slots, vehicles per slot, how many days ahead customers can book |

Revenue and statistics count only bookings you have marked **done**, so mark each wash done when it is finished.

## Everyday changes

- **Prices or a new package:** Supabase **Table Editor > prices**. One row per vehicle type + package. Vehicle must be `small`, `sedan`, `large`, `premium` or `bike`.
- **Opening hours / slot capacity:** admin console > Settings.
- **Customer forgot password:** admin console > Customers > Reset password, then tell them the new one.
- **Update the app files later:** upload the changed file to the same GitHub repository; the site updates in a minute or two.

## Good to know

- **Default assumptions you should check:** slots are hourly from 9 AM to 7 PM, 2 vehicles per slot, bookings up to 7 days ahead, and a monthly package lasts 30 days. The vehicle hints (Hatchback, MUV, Luxury car) are in `js/app.js` near the top (`SIZES`).
- **How mobile login works:** Supabase needs an email behind each account, so the app builds a hidden one from the mobile number (`9876543210@your-project.supabase.co`). No email is ever sent.
- **Security:** customers can only read their own profile, bookings and package. Prices, slot limits and coupon discounts are checked on the server when a booking is made. Only admins can see other customers or change anything else. These rules are in `schema.sql` (row level security).
- **Supabase free plan:** a project with no activity for about a week is paused. If the app stops loading after a quiet period, open the Supabase dashboard and click **Restore**.
- **WhatsApp marketing** opens one chat at a time with the message typed; you press send. It does not send automatically.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Page says "Setup needed" | `js/config.js` still has the placeholder values, or was not uploaded. |
| Registering says registration is not switched on | Turn off **Confirm email** (step 1.3). |
| Registering says "Email address ... is invalid" | Set `LOGIN_EMAIL_DOMAIN` in `js/config.js` to a real domain you own (e.g. `radiancecarwash.in`). Do this before real customers register, because changing it later changes everyone's hidden login email. |
| Registering says "email rate limit exceeded" | Confirm email is still on. Turn it off. |
| Admin console does not appear | Run the SQL in step 4 with the exact mobile number, then log out and in. |
| Reset password fails | Ask your developer to check the `admin_set_password` function; as a fallback, delete the user in Supabase **Authentication > Users** and let them register again..|
