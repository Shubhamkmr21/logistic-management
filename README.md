# Routeflow local logistics workspace

This version is wired end to end for local development. Shipment records, items, users, and status history live in PostgreSQL. The UI starts with an empty shipment register; it does not invent shipment activity or tracking updates.

## Start the local app

Requirements: Docker Desktop running, Node.js 20 or newer, and npm.

From the project root, start PostgreSQL:

```powershell
docker compose up -d
```

Start the API in one terminal:

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run dev
```

The `Copy-Item` command is a one-time setup; keep your local `.env` when restarting.

Start the UI in another terminal:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. The database is exposed on port **5433** because port 5432 is already in use on this machine. Docker keeps its data in a named volume, so records survive app and computer restarts.

## Local role accounts

These development-only accounts are checked by the API. Choose the matching role on the login screen, then enter the credentials; the form never pre-fills an account. The role also comes from the database on each request.

| Role | Email | Password |
|---|---|---|
| Staff | `staff@routeflow.local` | `staff1234` |
| Viewer | `viewer@routeflow.local` | `viewer1234` |
| Admin | `admin@routeflow.local` | `admin1234` |

Staff and admins can create, update, and cancel shipments. Viewers can search and read records. Local account passwords can be changed in `backend/.env` (`DEV_*_PASSWORD`). This login mode is for a private development machine, not production.

## Working features

- Create a shipment with a route, recipient, carrier, delivery date, and any number of items.
- Generate its tracking number on the API and save the shipment and items in one PostgreSQL transaction.
- Search shipment IDs, recipients, routes, carrier names, SKUs, and item names; filter by status and carrier; sort and paginate the loaded records.
- Update a shipment status with server-side transition checks. Each accepted update is saved as a tracking event.
- Show who created or changed each tracking event and display item and shipment weights in kilograms. Existing weight records are converted from pounds once during API startup.
- View saved items and the actual status history, cancel a permitted shipment, and export the current table to CSV.
- Enforce roles in the API, not only by hiding UI controls.
- Give admins a user directory with server-enforced role changes. Staff can create and update shipments; viewers have read-only shipment access.
- Let admins delete accounts from the user directory. The API prevents deleting the signed-in administrator or the last administrator; shipment records and tracking history remain after account removal.
- Provide a persistent Light/Dark theme toggle across sign-in and workspace screens.
- Sign in or register with Google after configuring an OAuth web client. New Google registrations start as Viewer; an admin can change access from User access.

The UI loads API pages in batches so local search, filters, and pagination include all saved shipments. Carrier GPS, messaging, freight prices, predictive risk scores, and document upload need separate carrier/provider integrations; the local app does not present them as live data.

## Database and API

`docker-compose.yml` starts PostgreSQL 17 and initializes it from `database/schema.sql`. The local connection is `postgres://routeflow:routeflow_local@localhost:5433/routeflow`.

The API runs at `http://localhost:4000`. Useful routes include `POST /api/auth/login`, `GET /api/auth/me`, `GET /api/shipments`, `POST /api/shipments`, `GET /api/shipments/:id`, `GET /api/shipments/track/:trackingNumber`, `PATCH /api/shipments/:id/status`, `DELETE /api/shipments/:id`, `GET /api/dashboard/stats`, and `GET /health`.

## Google sign-in setup

Create a Google OAuth client ID for a Web application. Add `http://localhost:5173` as an authorized JavaScript origin. Set the same client ID in `backend/.env` as `GOOGLE_CLIENT_ID` and in the project root `.env.local` as `VITE_GOOGLE_CLIENT_ID`, then restart both servers. The sign-in screen identifies which settings are missing. Google credentials are verified by the API; new accounts receive Viewer access and an admin must grant Staff or Admin.

## Registration and password reset

Use **Register now** to create an email/password account. New accounts start as Viewer. Selecting Staff or Admin creates an access request that an administrator can approve in **User access**. Passwords are hashed before they are stored.

In local development, **Forgot password?** creates a one-time reset link in the UI; it expires after 30 minutes. For reset links delivered by email, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in `backend/.env`, then restart the API. Email accounts can reset their password; Google-only accounts should continue using Google sign-in.

To use Microsoft Entra ID later, set `AUTH_MODE=microsoft` in the backend, configure the API audience and tenant, and set `VITE_AUTH_MODE=microsoft`, `VITE_MS_CLIENT_ID`, `VITE_MS_TENANT_ID`, and `VITE_MS_API_SCOPE` in the frontend environment. Local credentials should not be enabled on a deployed server.
