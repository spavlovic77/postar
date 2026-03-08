# Super Admin Dashboard Implementation Plan

## Overview

This document outlines the implementation plan for the multi-role user management system with company administration, invitation workflows, MFA, and account management features.

---

## Role Hierarchy & Permissions Matrix

### Core Principle
Each role can manage users at **lower levels only**, plus themselves.

| Role | Can Manage | Cannot Manage |
|------|------------|---------------|
| **SuperAdmin** | Administrators, Accountants, Self | - |
| **Administrator** | Accountants (in their companies), Self | Other Administrators, SuperAdmins |
| **Accountant** | Self | Anyone else |

### Detailed Permission Matrix

| Action | SuperAdmin | Administrator | Accountant |
|--------|------------|---------------|------------|
| **Companies** |
| Create company | Yes | No | No |
| Edit any company | Yes | No | No |
| Edit own company details | Yes | Yes (limited) | No |
| Delete company | Yes | No | No |
| View all companies | Yes | No | No |
| View assigned companies | Yes | Yes | Yes |
| **User Management** |
| Invite administrator | Yes | No | No |
| Invite accountant | Yes | Yes (to own companies) | No |
| View all users | Yes | No | No |
| View accountants in own companies | Yes | Yes | No |
| Reset any user's password | Yes | No | No |
| Reset accountant's password (own co.) | Yes | Yes | No |
| Deactivate administrator | Yes | No | No |
| Deactivate accountant | Yes | No | No |
| Remove accountant from company | Yes | Yes (own companies) | No |
| Reactivate any user | Yes | No | No |
| **Self-Management** |
| Update own profile | Yes | Yes | Yes |
| Request password reset | Yes | Yes | Yes |
| Request account deactivation | Yes | Yes | Yes |
| Enable/disable MFA | Yes | Yes | Yes |
| **System** |
| View audit logs | Yes | No | No |
| Manage access points | Yes | No | No |
| Process deactivation requests | Yes | No | No |

---

## Gap Analysis: Current vs Required

### Critical Gaps (Must Fix)

| Gap | Current State | Required State | Priority |
|-----|---------------|----------------|----------|
| **Admin can't manage accountants** | Only SuperAdmin can manage | Admin can remove accountant from company, reset password | Critical |
| **No hierarchical enforcement** | Any admin API works for any user | Check role hierarchy before action | Critical |
| **SuperAdmin self-deactivation** | Can deactivate self | Should be blocked (last SuperAdmin check) | Critical |
| **Invitation scope** | Admin can invite any role | Admin can only invite accountant | Critical |
| **Company-scoped actions** | Global user management | Admin only sees/manages users in their companies | Critical |

### Medium Gaps (Should Fix)

| Gap | Current State | Required State | Priority |
|-----|---------------|----------------|----------|
| **No MFA** | Not implemented | Passkeys/WebAuthn (optional) | Medium |
| **No profile management** | Users can't update profile | Name/email update flow | Medium |
| **No invitation tracking** | Basic tracking | Track invitedByRole, audit trail | Medium |

### Nice to Have

| Gap | Current State | Required State | Priority |
|-----|---------------|----------------|----------|
| Email notifications | Not implemented | Notify on key events | Low |
| Session invalidation | Deactivation doesn't logout | Immediately invalidate sessions | Low |

---

## Modern Best Practices

### 1. Invitation System (Magic Link)

**Why Magic Links are Best Practice:**
- No password to remember or store
- Reduced phishing risk (no credentials to steal)
- Better UX (one-click access)
- Supabase native support

**Implementation Flow:**
```
1. Admin creates invitation
   ├── Validate inviter can invite this role
   ├── Validate inviter has access to selected companies
   ├── Create invitation record (pending)
   └── Call supabase.auth.admin.inviteUserByEmail()

2. User receives email
   └── Contains magic link with invite token

3. User clicks link
   ├── Supabase handles authentication
   ├── Redirect to /auth/callback?token=xxx
   ├── Create userRoles record
   ├── Create companyAssignments records  
   ├── Mark invitation as accepted
   └── Redirect to role-appropriate dashboard

4. User is logged in with correct role and company access
```

**Security Measures:**
- Tokens expire in 7 days (configurable)
- Single-use tokens
- Rate limiting (max 10 invites/hour per admin)
- Audit logging of all invitations

### 2. MFA with Passkeys/WebAuthn

**Why Passkeys are Best Practice (2026):**
- Phishing-resistant (bound to domain)
- No shared secrets to steal
- Biometric or hardware key based
- Supported by all major browsers
- Better UX than TOTP codes

**Implementation Approach:**
Using `@simplewebauthn/browser` and `@simplewebauthn/server`:

```
Registration Flow:
1. User clicks "Add Passkey" in settings
2. Server generates registration options (challenge)
3. Browser prompts for biometric/security key
4. Credential sent to server for verification
5. Public key stored in database
6. User can now login with passkey

Login Flow:
1. User enters email or clicks "Login with Passkey"
2. Server generates authentication options
3. Browser prompts for biometric/security key  
4. Signature verified against stored public key
5. Session created
```

**Database Schema for Passkeys:**
```sql
CREATE TABLE passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  "credentialId" TEXT UNIQUE NOT NULL,
  "publicKey" TEXT NOT NULL,
  counter BIGINT DEFAULT 0,
  "deviceType" TEXT, -- 'platform' (built-in) or 'cross-platform' (usb key)
  "transports" TEXT[], -- ['internal', 'usb', 'ble', 'nfc']
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "lastUsedAt" TIMESTAMPTZ
);

CREATE INDEX idx_passkeys_user ON passkeys("userId");
CREATE INDEX idx_passkeys_credential ON passkeys("credentialId");
```

**MFA Policy:**
- Optional for all users (user's choice)
- Stored in user metadata or separate settings table
- Graceful fallback to magic link if passkey fails

### 3. Hierarchical Access Control

**Implementation Pattern:**
```typescript
// lib/auth/permissions.ts

type Role = 'superAdmin' | 'administrator' | 'accountant'

const ROLE_HIERARCHY: Record<Role, number> = {
  superAdmin: 3,
  administrator: 2,
  accountant: 1
}

function canManageRole(actorRole: Role, targetRole: Role): boolean {
  return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole]
}

function canInviteRole(actorRole: Role, invitedRole: Role): boolean {
  // SuperAdmin can invite any role
  if (actorRole === 'superAdmin') return true
  // Administrator can only invite accountants
  if (actorRole === 'administrator' && invitedRole === 'accountant') return true
  return false
}

async function canManageUser(
  actorId: string, 
  actorRole: Role, 
  targetUserId: string,
  targetRole: Role,
  action: 'deactivate' | 'resetPassword' | 'removeFromCompany'
): Promise<boolean> {
  // Can't manage users at same or higher level
  if (!canManageRole(actorRole, targetRole)) return false
  
  // SuperAdmin can manage anyone below them
  if (actorRole === 'superAdmin') return true
  
  // Administrator can only manage accountants in their companies
  if (actorRole === 'administrator') {
    const sharedCompanies = await getSharedCompanies(actorId, targetUserId)
    return sharedCompanies.length > 0
  }
  
  return false
}
```

---

## Updated Database Schema

### New Tables

```sql
-- Passkeys for WebAuthn MFA
CREATE TABLE passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  "credentialId" TEXT UNIQUE NOT NULL,
  "publicKey" TEXT NOT NULL,
  counter BIGINT DEFAULT 0,
  "deviceType" TEXT,
  transports TEXT[],
  name TEXT, -- User-friendly name like "MacBook Pro Touch ID"
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "lastUsedAt" TIMESTAMPTZ
);

-- Enhanced invitations with hierarchy tracking
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('administrator', 'accountant')),
  "invitedBy" UUID REFERENCES auth.users(id),
  "invitedByRole" TEXT NOT NULL, -- Track what role invited
  token TEXT UNIQUE NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  "companyIds" UUID[] DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "acceptedAt" TIMESTAMPTZ
);

-- Deactivation requests
CREATE TABLE "deactivationRequests" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID REFERENCES auth.users(id),
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  "processedBy" UUID REFERENCES auth.users(id),
  "processedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
```

### Modified Tables

```sql
-- Add legalName and adminEmail to companies
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS "legalName" TEXT,
ADD COLUMN IF NOT EXISTS "adminEmail" TEXT;

-- Add isActive to userRoles (already done)
ALTER TABLE "userRoles"
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT TRUE;
```

---

## Updated API Endpoints

### Companies API (SuperAdmin Only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/companies` | List all companies |
| POST | `/api/admin/companies` | Create company |
| PUT | `/api/admin/companies/[id]` | Update company |
| DELETE | `/api/admin/companies/[id]` | Delete company |

### Users API
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/admin/users` | List all users | SuperAdmin |
| GET | `/api/admin/users?companyId=xxx` | List company users | SuperAdmin, Admin (own) |
| POST | `/api/admin/users/[id]/reset-password` | Reset password | SuperAdmin, Admin (own accountants) |
| PUT | `/api/admin/users/[id]/deactivate` | Deactivate user | SuperAdmin only |
| PUT | `/api/admin/users/[id]/reactivate` | Reactivate user | SuperAdmin only |

### Company User Management (Administrator)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/companies/[id]/users` | List company accountants |
| DELETE | `/api/companies/[id]/users/[userId]` | Remove accountant from company |
| POST | `/api/companies/[id]/users/[userId]/reset-password` | Reset accountant password |

### Invitations API
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/invitations` | List sent invitations | SuperAdmin (all), Admin (own) |
| POST | `/api/invitations` | Create invitation | SuperAdmin (any), Admin (accountant only) |
| DELETE | `/api/invitations/[id]` | Cancel invitation | Creator or SuperAdmin |
| POST | `/api/invitations/accept` | Accept invitation | Public (with valid token) |

### MFA API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/passkey/register/options` | Get registration options |
| POST | `/api/auth/passkey/register/verify` | Verify and store passkey |
| POST | `/api/auth/passkey/login/options` | Get login options |
| POST | `/api/auth/passkey/login/verify` | Verify passkey login |
| GET | `/api/auth/passkey/list` | List user's passkeys |
| DELETE | `/api/auth/passkey/[id]` | Remove passkey |

### Account API (Self-Management)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/account/profile` | Get own profile |
| PUT | `/api/account/profile` | Update own profile |
| POST | `/api/account/request-deactivation` | Request deactivation |
| POST | `/api/account/reset-password` | Request password reset |

---

## Implementation Tasks (Updated)

| # | Task | Description | Scope |
|---|------|-------------|-------|
| 1 | **Fix RLS/API Issues** | Fix current 500/400 errors on admin APIs | Critical |
| 2 | **Permission Helpers** | Create `lib/auth/permissions.ts` with hierarchy checks | Critical |
| 3 | **Update Admin APIs** | Add hierarchy checks to all admin endpoints | Critical |
| 4 | **Administrator Company APIs** | New endpoints for admin to manage their accountants | Critical |
| 5 | **Invitation System Fix** | Add role validation to invitation creation | Critical |
| 6 | **MFA Database Migration** | Add passkeys table | Medium |
| 7 | **Passkey Registration** | WebAuthn registration flow | Medium |
| 8 | **Passkey Login** | WebAuthn login flow | Medium |
| 9 | **MFA Settings UI** | Settings page for passkey management | Medium |
| 10 | **Profile Management** | Self-profile update flow | Low |

---

## Security Checklist

- [ ] Hierarchical permission checks on ALL user management endpoints
- [ ] SuperAdmin cannot deactivate self (check for last SuperAdmin)
- [ ] Administrator can only invite accountants
- [ ] Administrator can only manage users in their companies
- [ ] Rate limiting on invitations (10/hour)
- [ ] Rate limiting on password resets (5/hour)
- [ ] Audit logging for all sensitive actions
- [ ] Passkey challenge expiration (5 minutes)
- [ ] Session invalidation on deactivation
- [ ] HTTPS required for WebAuthn

---

## Dependencies

```json
{
  "@simplewebauthn/browser": "^10.0.0",
  "@simplewebauthn/server": "^10.0.0"
}
```

---

## Questions Answered

| Question | Answer |
|----------|--------|
| Admin deactivate accountant? | Remove from company only (partial access removal) |
| MFA method? | Passkeys/WebAuthn (most secure, modern) |
| MFA mandatory? | Optional for all users |
| Invitation flow? | Magic Link (passwordless) |

---

## Next Steps

1. **Immediate:** Fix current API 500/400 errors
2. **Phase 1:** Implement permission helpers and update admin APIs
3. **Phase 2:** Add administrator company-scoped management
4. **Phase 3:** Implement Passkey MFA
5. **Phase 4:** Profile management and polish

