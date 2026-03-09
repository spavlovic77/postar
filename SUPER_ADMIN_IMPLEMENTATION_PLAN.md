# Super Admin Dashboard Implementation Plan

## Overview v1

This document outlines the implementation plan for the multi-role user management system with company administration, invitation workflows, and account management features.

---

## User Stories Summary

### 1. SuperAdmin (Platform Owner)
- Create and edit companies (DIC, legal name, admin email)
- Invite and manage company administrators
- Reset passwords for any user (via magic link)
- Deactivate/reactivate user accounts

### 2. Administrator (Company Admin)
- View and edit own company details
- Invite accountants to manage company (can assign multiple companies per invite)
- Manage accountants (view, deactivate)
- Request own password reset or account deactivation

### 3. Accountant
- View all assigned companies
- Send/receive documents on behalf of assigned companies
- Request own password reset or account deactivation

---

## Current Database Schema

### Existing Tables
| Table | Fields |
|-------|--------|
| `companies` | id, name, DIC, peppolParticipantId, accessPointProviderId, createdById, createdAt |
| `companyAssignments` | id, userId, companyId, createdAt |
| `userRoles` | id, userId, role (superAdmin/administrator/accountant), createdAt |
| `accessPoints` | id, name, peppolParticipantId, createdAt |
| `auditLogs` | id, userId, action, details, createdAt |

### Existing Roles
- `superAdmin` - Platform owner with full access
- `administrator` - Company admin
- `accountant` - Document handler for companies

---

## Database Changes Required

### 1. Modify `companies` Table
```sql
ALTER TABLE companies
ADD COLUMN "legalName" TEXT,
ADD COLUMN "adminEmail" TEXT;
```

### 2. Modify `userRoles` Table
```sql
ALTER TABLE "userRoles"
ADD COLUMN "isActive" BOOLEAN DEFAULT TRUE;
```

### 3. Create `invitations` Table
```sql
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('administrator', 'accountant')),
  "invitedBy" UUID REFERENCES auth.users(id),
  token TEXT UNIQUE NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  "companyIds" UUID[] DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);
```

### 4. Create `accountDeactivationRequests` Table
```sql
CREATE TABLE "accountDeactivationRequests" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID REFERENCES auth.users(id),
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  "processedBy" UUID REFERENCES auth.users(id),
  "processedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Feature Specifications

### SuperAdmin Features

#### 1. Companies Management (`/admin/companies`)

**List View:**
- Table with columns: DIC, Legal Name, Name, Admin Email, Created Date, Actions
- Search/filter by DIC, name
- Pagination

**Create Company:**
- Form fields: DIC (required), Legal Name (required), Display Name (optional)
- Validation: DIC must be unique

**Edit Company:**
- Edit all company fields
- View assigned administrators
- Invite new administrator button

**Actions:**
- Edit company
- View administrators
- Invite administrator
- Delete company (with confirmation)

#### 2. User Management (`/admin/users`)

**List View:**
- Table with columns: Email, Role, Status (Active/Inactive), Companies, Created Date, Actions
- Filter by role, status
- Search by email

**Invite User:**
- Form fields: Email, Role (administrator/accountant)
- If administrator: Select company to assign
- If accountant: Select multiple companies to assign
- Sends Supabase magic link email

**Actions:**
- Send password reset (magic link)
- Deactivate account
- Reactivate account
- View user details

---

### Administrator Features

#### 1. My Company (`/dashboard/company`)

**View:**
- Display company details (DIC, Legal Name, Name)
- List of accountants assigned to company

**Edit:**
- Edit display name only (DIC and legal name locked)

#### 2. Invite Accountants (`/dashboard/invite`)

**Form:**
- Email address
- Select companies they can access (from admin's companies)
- Sends Supabase magic link

**Pending Invitations:**
- List of pending invitations sent by this admin
- Cancel invitation option

#### 3. Manage Accountants (`/dashboard/accountants`)

**List View:**
- Accountants assigned to admin's companies
- Status (Active/Inactive)

**Actions:**
- Remove from company
- Request deactivation (goes to superAdmin for approval)

---

### Accountant Features

#### 1. My Companies (`/dashboard`)

**List View:**
- Cards or table showing all assigned companies
- Company name, DIC, status
- Quick actions: View documents, Send document

#### 2. Company Workspace (`/dashboard/company/[id]`)

**Features:**
- View company details
- Send documents on behalf of company
- View received documents
- Document history

---

### Shared Features (All Roles)

#### Account Settings (`/settings`)

**Password Reset:**
- "Send password reset link" button
- Uses Supabase magic link

**Request Account Deactivation:**
- Form with optional reason
- Creates request for superAdmin approval
- Shows pending request status if exists

---

## API Endpoints

### Companies API
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/admin/companies` | List all companies | superAdmin |
| POST | `/api/admin/companies` | Create company | superAdmin |
| GET | `/api/admin/companies/[id]` | Get company details | superAdmin |
| PUT | `/api/admin/companies/[id]` | Update company | superAdmin |
| DELETE | `/api/admin/companies/[id]` | Delete company | superAdmin |

### Users API
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/admin/users` | List all users | superAdmin |
| POST | `/api/admin/users/invite` | Send invitation | superAdmin, administrator |
| POST | `/api/admin/users/[id]/reset-password` | Send password reset | superAdmin |
| PUT | `/api/admin/users/[id]/deactivate` | Deactivate user | superAdmin |
| PUT | `/api/admin/users/[id]/reactivate` | Reactivate user | superAdmin |

### Invitations API
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/invitations` | List invitations | superAdmin, administrator |
| POST | `/api/invitations` | Create invitation | superAdmin, administrator |
| DELETE | `/api/invitations/[id]` | Cancel invitation | superAdmin, administrator |
| GET | `/api/invitations/accept/[token]` | Accept invitation | Public (with valid token) |

### Account API
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/api/account/request-deactivation` | Request account deactivation | All authenticated |
| POST | `/api/account/reset-password` | Request own password reset | All authenticated |
| GET | `/api/admin/deactivation-requests` | List deactivation requests | superAdmin |
| PUT | `/api/admin/deactivation-requests/[id]` | Approve/reject request | superAdmin |

---

## Invitation Flow (Magic Link)

```
1. SuperAdmin/Administrator creates invitation
   └── POST /api/invitations
       ├── Create record in `invitations` table
       ├── Generate unique token
       └── Call Supabase Auth signInWithOtp(email, { shouldCreateUser: true })

2. User receives email with magic link
   └── Link format: /auth/callback?token=xxx

3. User clicks link
   └── GET /auth/callback
       ├── Verify token with Supabase
       ├── Find invitation by email
       ├── Create userRoles record
       ├── Create companyAssignments records
       ├── Update invitation status to 'accepted'
       └── Redirect to dashboard

4. User is now logged in with assigned role and companies
```

---

## Navigation Structure

### SuperAdmin Sidebar
```
Dashboard
├── Overview
├── Companies (NEW)
│   └── /admin/companies
├── Users (NEW - enhanced)
│   └── /admin/users
├── Deactivation Requests (NEW)
│   └── /admin/deactivation-requests
├── Access Points (existing)
│   └── /admin/accessPoints
└── Audit Logs (existing)
    └── /admin/auditLogs
```

### Administrator Sidebar
```
Dashboard
├── Overview
├── My Company
│   └── /dashboard/company
├── Accountants
│   └── /dashboard/accountants
├── Invite Accountant
│   └── /dashboard/invite
├── Documents
│   └── /documents
└── Settings
    └── /settings
```

### Accountant Sidebar
```
Dashboard
├── My Companies
│   └── /dashboard
├── Documents
│   └── /documents
└── Settings
    └── /settings
```

---

## Implementation Tasks

| # | Task | Estimated Scope |
|---|------|-----------------|
| 1 | **Database Migration** | Add new tables and columns |
| 2 | **SuperAdmin Companies Page** | New `/admin/companies` with CRUD |
| 3 | **Invitation System** | API routes + Supabase magic link integration |
| 4 | **SuperAdmin Users Page** | Enhanced `/admin/users` with invite/deactivate |
| 5 | **Deactivation Requests** | New `/admin/deactivation-requests` page |
| 6 | **Administrator Dashboard** | Company view + accountant management |
| 7 | **Accountant Dashboard** | Multi-company view |
| 8 | **Account Settings** | Password reset + deactivation request |
| 9 | **Sidebar Updates** | Role-based navigation |

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Email Provider | Supabase built-in | Quick setup, native magic link support |
| Invitation Flow | Magic link | No password management, secure |
| Deactivation | Soft delete | Accounts can be reactivated, audit trail preserved |
| Multi-company Invites | Supported | One invite can assign multiple companies to accountant |
| Admin Page Location | Separate `/admin/companies` | Clear separation of superAdmin vs regular pages |

---

## Security Considerations

1. **Role-based Access Control (RBAC)**
   - All API routes check user role before executing
   - RLS policies on all tables

2. **Invitation Security**
   - Tokens expire after 7 days
   - Single-use tokens
   - Rate limiting on invitation creation

3. **Deactivation**
   - Deactivated users cannot login
   - Check `isActive` on every authenticated request
   - Preserve audit trail

4. **Password Reset**
   - Uses Supabase built-in magic link
   - Rate limited
   - Audit logged

---

## Open Questions

1. Should invitations have a maximum number per day (rate limiting)?
2. Should deactivated users' sessions be immediately invalidated?
3. Should there be email notifications when deactivation request is approved/rejected?
4. Should administrators be able to edit company DIC/legal name, or only superAdmin?

---

## Next Steps

1. Review and approve this plan
2. Begin with Task 1 (Database Migration)
3. Implement features in task order
4. Test each feature before moving to next
