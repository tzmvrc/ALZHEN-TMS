# ALZHEN TMS

### Transportation Management System

A centralized web-based Transportation Management System designed to digitize and streamline **trip dispatching, delivery monitoring, trucker operations, store coordination, proof of delivery, document management, billing, payables, receivables, and operational reporting**.

---

## 📌 Overview

**ALZHEN TMS** is a web-based logistics and transportation management platform being developed for **Alzhen Trucking**.

The system is designed to replace a workflow that currently relies heavily on shared Microsoft Excel files, manual data encoding, email communication, document processing, and spreadsheet-based monitoring.

The goal is to provide a centralized system where operational data can be entered once and then reused across dashboards, monitoring tools, reports, financial records, and document workflows.

### Current workflow

```text
Client
   │
   │ Delivery / trip details
   ▼
Email
   │
   ▼
Staff manually encodes data
   │
   ├── Dispatch Monitoring
   ├── Store Calling Tracker
   ├── Trip Booking Details
   └── Dispatch Report
   │
   ▼
Delivery Operations
   │
   ▼
Trucker sends documents / photos
   │
   ▼
Staff processes documents
   │
   ▼
Billing / Payables / Receivables
```

### Target workflow

```text
Client / Delivery Information
             │
             ▼
        ALZHEN TMS
             │
      ┌──────┴──────┐
      ▼             ▼
   Admin/Staff    Trucker
      │             │
      │             └── Status Updates
      │             └── POD Uploads
      │             └── Delivery Information
      │
      ├── Trip Management
      ├── Dispatch Monitoring
      ├── Store Calling
      ├── Document Management
      ├── Exception Monitoring
      ├── Billing
      ├── Payables
      ├── Receivables
      └── Reports
             │
             ▼
       Centralized Data
```

---

# 🎯 Project Goals

ALZHEN TMS is being developed around several primary goals:

* Centralize transportation and delivery information.
* Reduce repetitive manual Excel encoding.
* Improve visibility of trip and delivery status.
* Track warehouse and store operational events.
* Provide truckers with a dedicated operational portal.
* Centralize Proof of Delivery and other documents.
* Improve store calling and delivery coordination.
* Track delivery exceptions such as backloads, offloads, incidents, and demurrage.
* Connect operational records with billing and financial records.
* Generate consolidated and separated operational reports.
* Provide a foundation for future automation using email processing, OCR, and workflow automation.

---

# 🏗️ System Architecture

ALZHEN TMS uses a modern web application architecture.

```text
                    ┌─────────────────────┐
                    │      Users          │
                    │                     │
                    │ Admin / Staff       │
                    │ Truckers            │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ React + Vite        │
                    │ TypeScript          │
                    │ Tailwind CSS        │
                    └──────────┬──────────┘
                               │
                         REST API
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Node.js + Express   │
                    │ TypeScript          │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
             ┌──────────────┐      ┌──────────────┐
             │ Supabase     │      │ n8n           │
             │ PostgreSQL   │      │ Automation    │
             │ Auth         │      │ / Workflows   │
             │ Storage      │      └──────────────┘
             │ Realtime     │
             └──────────────┘
```

---

# 🛠️ Technology Stack

| Layer            | Technology                    |
| ---------------- | ----------------------------- |
| Frontend         | React                         |
| Build Tool       | Vite                          |
| Language         | TypeScript                    |
| Styling          | Tailwind CSS                  |
| Backend          | Node.js                       |
| API Framework    | Express.js                    |
| Database         | PostgreSQL                    |
| Backend Platform | Supabase                      |
| Authentication   | Supabase Auth                 |
| File Storage     | Supabase Storage              |
| Realtime         | Supabase Realtime             |
| Automation       | n8n                           |
| API Testing      | Postman                       |
| Version Control  | Git / GitHub                  |
| Deployment       | Planned production deployment |

---

# 👥 User Roles

ALZHEN TMS currently uses two primary operational user types.

## ADMIN / STAFF

Admin and staff users access the main TMS dashboard.

### Administrator

Administrators have elevated permissions and can manage users and administrative functions.

Typical capabilities include:

* Dashboard access
* Trip management
* Dispatch monitoring
* Store calling
* Document management
* Financial records
* Reports
* User management
* Audit logs

### Staff

Staff users use the same main application interface but have restricted administrative permissions.

They can perform operational work without having administrator-level user-management privileges.

---

## 🚛 TRUCKER

Truckers use a dedicated mobile-friendly portal.

The trucker interface is intentionally more focused than the admin/staff dashboard.

Typical functions include:

* View assigned trips
* View delivery stops
* Update delivery status
* Record operational events
* Submit delivery information
* Upload Proof of Delivery
* Upload required documents
* View profile

The trucker portal is designed primarily for **mobile browser usage**, allowing truckers to use their phones without requiring a separate native mobile application.

---

# 🔐 Authentication & Authorization

ALZHEN TMS uses **Supabase Authentication** for user authentication.

The backend validates the Supabase access token before allowing protected operations.

### Authentication flow

```text
User
 │
 ▼
Login
 │
 ▼
Supabase Auth
 │
 ▼
Access Token
 │
 ▼
Frontend
 │
 ▼
Authorization Header
 │
 ▼
Express Auth Middleware
 │
 ▼
Supabase Token Validation
 │
 ▼
User Profile / Role
 │
 ▼
Role-Based Authorization
```

The backend follows the principle that **frontend routing is not a security boundary**.

Permissions are enforced on the backend.

---

# 🌐 Application Routes

The application uses a single React application.

### Admin / Staff

```text
/login
/
```

### Trucker

```text
/trucker/login
/trucker
/trucker/trips
/trucker/profile
```

There are no separate frontend applications or subdomains required for the different user types.

---

# 📦 Core TMS Modules

## 1. Dashboard

The dashboard provides a centralized overview of transportation operations.

Planned dashboard information includes:

* Total trips
* Delivery status
* Pending drop-offs
* POD status
* Payables
* Receivables
* Billing status
* Operational exceptions
* Store calling status

The dashboard is intended to provide staff with a quick operational overview without requiring them to manually inspect multiple spreadsheets.

---

# 🚚 2. Trip Management

Trips are the central operational entity of the system.

A trip can contain:

* Dispatch number
* Trip type
* Warehouse
* Loading date
* Estimated delivery date
* Assigned truck
* Assigned driver
* Trucking company
* Multiple delivery stops
* Multiple products / line items
* Delivery documents
* Operational events
* Incidents
* Backloads
* Offloads
* Demurrage
* Billing
* Payables
* Receivables

Conceptually:

```text
Trip
 │
 ├── Truck Assignment
 │     ├── Truck
 │     ├── Driver
 │     └── Trucking Company
 │
 ├── Stop 1
 ├── Stop 2
 ├── Stop 3
 │
 ├── Line Items
 ├── Events
 ├── Documents
 ├── Incidents
 ├── Backloads
 ├── Offloads
 ├── Demurrage
 ├── Billing
 ├── Payable
 └── Receivable
```

---

# 📍 3. Trip Stops

A trip may contain multiple delivery destinations.

Each stop can contain:

* Customer
* Store
* Stop sequence
* Delivery status
* Arrival time
* Start unloading time
* Finish unloading time
* Departure time
* Remarks

This allows the system to represent real-world multi-drop trips.

```text
TRIP260819-5

Warehouse
    │
    ▼
Stop 1 ── Customer A / Store A
    │
    ▼
Stop 2 ── Customer B / Store B
    │
    ▼
Stop 3 ── Customer A / Store C
```

---

# 📦 4. Trip Line Items

Trip line items represent the actual products or shipment information associated with a trip.

Supported information includes:

* Product
* Quantity
* CBM
* DR number
* SAP SO number
* Customer PO
* Internal PO
* Customer model
* Remarks

This allows one trip to contain multiple products and multiple shipment references.

---

# 📊 5. Dispatch Monitoring

The Dispatch Monitoring module replaces the operational monitoring previously maintained through spreadsheets.

It provides visibility into:

* Loading
* Warehouse arrival
* Start loading
* Finish loading
* Departure
* In transit
* Store arrival
* Start unloading
* Finish unloading
* Store departure
* Delivery status

Operational timestamps can also be used as the basis for monitoring:

* Waiting time
* Demurrage
* Delays
* Foul trips
* Delivery performance

---

# 📞 6. Store Calling

The Store Calling module centralizes communication with delivery locations.

Each store call can contain:

* Assigned staff
* Store contact
* Contact number
* Contact name
* Da
