# Routeflow Logistics Workspace

```text
 ____             _       __ _
|  _ \ ___  _   _| |_ ___/ _| | _____      __
| |_) / _ \| | | | __/ _ \ |_| |/ _ \ \ /\ / /
|  _ < (_) | |_| | ||  __/  _| | (_) \ V  V /
|_| \_\___/ \__,_|\__\___|_| |_|\___/ \_/\_/
```

Routeflow is a role-based logistics workspace for maintaining shipment records, items, statuses, and tracking history. Local shipment data is stored in PostgreSQL. The shipment list starts empty unless the database already contains records; the app does not create sample shipments.

## Features

- Create shipments with an origin, destination, recipient, carrier, mode, delivery date, and one or more items.
- Edit shipment details and items. Each edit is recorded in tracking history with the employee who made it.
- Search shipments and items; filter by status or carrier; sort and page through saved records; export the filtered list to CSV.
- Update shipment status with server-side transition checks. Tracking history records who made each change.
- Cancel eligible shipments into the **Bin**. Staff and admins can restore them; restored shipments return to their last non-cancelled status. Admins can permanently delete shipments from the Bin. Permanent deletion also removes the shipment's items and tracking history.
- Manage workspace users as an admin: review registered accounts and role requests, change access, and delete accounts. The API prevents deleting your own account or the last administrator.
- Use Staff, Viewer, or Admin access. The API checks each protected operation; the UI also adapts to the signed-in role.
- View weights in kilograms. Existing pound values are converted to kilograms once by the API migration.
- Switch between light and dark themes. The preference is saved in the browser.
- Sign in with local email and password or Google. Microsoft Entra ID can be configured as an alternative provider.

## Requirements

- Node.js 20 or newer and npm
- Docker Desktop with Docker Compose

## Run locally

Start PostgreSQL from the project root:

```powershell
docker compose up -d postgres
```

In a second terminal, install and start the API:

```powershell
cd backend
Copy-Item .env.example .env # Run once; keep this file for later starts.
npm install
npm run dev
```

In another terminal, install and start the frontend from the project root:

```powershell
Copy-Item .env.example .env.local # Run once; keep this file for later starts.
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API runs at [http://localhost:4000](http://localhost:4000); check its database connection at `/health`. PostgreSQL is exposed on localhost port **5433** and its data is kept in the `routeflow_pgdata` Docker volume, so restarting the app does not erase records.

## Local development sign-in

The API provisions these local-only accounts. Choose the matching role on the sign-in screen and enter the credentials; the form does not prefill them.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@routeflow.local` | `admin1234` |
| Staff | `staff@routeflow.local` | `staff1234` |
| Viewer | `viewer@routeflow.local` | `viewer1234` |

Set the initial local passwords in `backend/.env` with `DEV_ADMIN_PASSWORD`, `DEV_STAFF_PASSWORD`, and `DEV_VIEWER_PASSWORD` before first sign-in. After an account has a stored password hash, use **Forgot password?** to change it. Local authentication is for development on a private machine and should not be exposed as production authentication.

New email/password registrations start with Viewer access; requesting Staff or Admin creates a pending request for approval in **User access**. New Google users must register as Viewer, then ask an administrator to grant another role. When using local email/password sign-in without SMTP, the password reset link is shown in the app and expires after 30 minutes.

## Google sign-in

1. Create a Google OAuth client for a Web application.
2. Add `http://localhost:5173` as an authorized JavaScript origin.
3. Set the client ID as `VITE_GOOGLE_CLIENT_ID` in the project root `.env.local` and `GOOGLE_CLIENT_ID` in `backend/.env`.
4. Restart the frontend and API.

The API verifies Google identity tokens. An admin can promote a new account to Staff or Admin in **User access**.

## Microsoft Entra ID sign-in

Microsoft sign-in requires an Entra app registration for the SPA and an API registration with a delegated scope.

1. Add `http://localhost:5173` as the SPA redirect URI.
2. Configure a delegated API scope, such as `access_as_user`, and grant the SPA permission to request it.
3. In the project root `.env.local`, set `VITE_AUTH_MODE=microsoft`, `VITE_MS_CLIENT_ID`, `VITE_MS_TENANT_ID`, and `VITE_MS_API_SCOPE` (for example, `api://<api-client-id>/access_as_user`). Set `VITE_ALLOWED_EMAILS` to a comma-separated allowlist, or leave it empty to allow any signed-in account.
4. In `backend/.env`, set `AUTH_MODE=microsoft`, `MS_TENANT_ID`, and `MS_API_AUDIENCE` to match the Entra tenant and API audience.
5. Restart both servers.

The API creates first-time Microsoft users as Viewers. An administrator can then assign Staff or Admin access. For a fresh Microsoft-only database, sign in once with the trusted account, then grant the first administrator role directly in PostgreSQL. Replace the email with that verified account:

```sql
UPDATE users
SET role = 'admin', requested_role = NULL
WHERE lower(email) = lower('admin@your-company.com');
```

Run this only for an identity you have verified; afterwards, manage roles from **User access**.

## Optional password-reset email

To deliver reset links by email, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in `backend/.env`, then restart the API. Without SMTP, local mode returns a development reset link in the app.

## API overview

The API is mounted under `/api`. Protected routes require a bearer token.

| Method | Route | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | Local mode | Sign in with a local account or registered email account |
| `POST` | `/api/auth/register` | Local mode | Register as Viewer or request Staff/Admin access |
| `POST` | `/api/auth/google` | Google configured | Sign in with Google |
| `GET` | `/api/auth/me` | Signed in | Return the current account and role |
| `GET` | `/api/shipments` | Signed in | Search and page through active shipments |
| `POST` | `/api/shipments` | Staff, Admin | Create a shipment |
| `GET` | `/api/shipments/:id` | Signed in | Read shipment details and history |
| `PATCH` | `/api/shipments/:id` | Staff, Admin | Edit shipment details and items |
| `PATCH` | `/api/shipments/:id/status` | Staff, Admin | Change shipment status |
| `DELETE` | `/api/shipments/:id` | Staff, Admin | Cancel a shipment into the Bin |
| `GET` | `/api/shipments/bin` | Staff, Admin | List cancelled shipments |
| `POST` | `/api/shipments/:id/restore` | Staff, Admin | Restore a cancelled shipment |
| `DELETE` | `/api/shipments/:id/permanent` | Admin | Permanently delete a shipment from the Bin |
| `GET` | `/api/shipments/track/:trackingNumber` | Signed in | Read tracking details and event history |
| `GET` | `/api/users` | Admin | List workspace users and role requests |
| `PATCH` | `/api/users/:id/role` | Admin | Change a user's role |
| `DELETE` | `/api/users/:id` | Admin | Delete a user account |
| `GET` | `/api/dashboard/stats` | Signed in | Return shipment status counts |
| `GET` | `/health` | Public | Check API and database availability |

## Data and integrations

Shipment records, items, accounts, and tracking events are stored in PostgreSQL. Shipment events record the actor's name so history remains attributable even if that account is later deleted. Dashboard shipment counts are calculated from saved records. The displayed average-delay value is currently placeholder text; it is not calculated from carrier telemetry.

Carrier GPS updates, recipient notifications, live chat, freight pricing, predictive risk scoring, and document upload are not connected. Shipment status changes are entered by staff or admins. These functions need separate carrier or service integrations before they can provide live data.

To remove the local database and all stored records, run `docker compose down -v` from the project root. This permanently deletes the PostgreSQL volume.
