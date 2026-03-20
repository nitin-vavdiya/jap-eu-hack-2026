# Flow: Consent-Based Data Access

Vehicle owners control who can access their vehicle's data. Before any third party (insurer, researcher, regulator) can access protected endpoints, they must request consent from the owner. The owner approves or denies, and approval grants an ephemeral access session.

This flow is also Phase 1–2 of the [Insurance VP Verification](insurance-verification.md) flow.

---

## Actors

| Actor | Portal | Role |
|---|---|---|
| Requester (Digit Agent) | `portal-insurance` | Requests data access |
| Owner (Mario Sanchez) | `portal-wallet` | Approves or denies |
| Backend | `backend` | Manages consent state + access sessions |

---

## Flow Diagram

```
Requester                 Backend                    Owner (Mario)
    │                        │                            │
    ├─ POST /consent/request ►│                            │
    │   { vin, purpose }     │                            │
    │◄─ { consentId }        │                            │
    │                        │   [notification pending]   │
    ├─ GET /consent/check ───►│                            │
    │   (polling every 5s)   │                            │
    │◄─ { status: "pending" }─┤                            │
    │                        │                            │
    │                        │◄── GET /consent/pending/:userId
    │                        │    (wallet polls for requests)
    │                        │──────────────────────────►│
    │                        │    { consent request }    │
    │                        │                         Mario sees modal
    │                        │                            │
    │                        │◄── PUT /consent/:id/approve┤
    │                        │    (Mario clicks "Approve")│
    │                        │                            │
    │                        ├─ Update Consent.status="approved"
    │                        ├─ Create AccessSession (1hr TTL)
    │                        │                            │
    ├─ GET /consent/check ───►│                            │
    │◄─ { status: "approved", accessToken } ─────────────  │
    │                        │                            │
    ├─ GET /vehicle-registry/ │                            │
    │    vehicles/:vin/dpp   │                            │
    │    x-access-token: <token> ────────────────────────  │
    │◄─ { dpp payload }      │                            │
```

---

## Step-by-Step

### Step 1: Request Consent

The requester (Digit agent or any authorized party) creates a consent request:

```http
POST /api/consent/request
Authorization: Bearer <agent_jwt>
Content-Type: application/json

{
  "requesterId": "digit-agent",
  "ownerId": "mario-sanchez",
  "vin": "1HGBH41JXMN109186",
  "purpose": "insurance_underwriting",
  "requestedData": ["dpp", "ownership_history"]
}
```

Response:

```json
{
  "consentId": "consent-uuid",
  "status": "pending",
  "expiresAt": "2026-03-20T11:00:00Z"
}
```

The backend creates a `Consent` record with `status: "pending"`.

**Idempotency:** Before creating, the backend checks `GET /api/consent/check?requesterId=...&ownerId=...&vin=...`. If a pending consent already exists for the same requester/owner/VIN, it returns the existing one instead of creating a duplicate.

### Step 2: Requester Polls for Status

The requester's portal polls for status changes:

```http
GET /api/consent/check?requesterId=digit-agent&ownerId=mario-sanchez&vin=1HGBH41
```

Returns:
```json
{
  "consentId": "consent-uuid",
  "status": "pending"   // pending | approved | denied
}
```

The `portal-insurance` `ConsentWait` page does this every 5 seconds.

### Step 3: Owner Sees Pending Consent

Mario's wallet portal polls:

```http
GET /api/consent/pending/mario-sanchez
```

Returns array of pending consents. Any pending items appear as a modal overlay in `portal-wallet`.

### Step 4: Owner Approves or Denies

**Approve:**

```http
PUT /api/consent/consent-uuid/approve
Authorization: Bearer <mario_jwt>
```

The backend:
1. Updates `Consent.status = "approved"` and `resolvedAt = now()`
2. Creates an `AccessSession`:

```typescript
{
  id: crypto.randomUUID(),   // This IS the access token
  consentId: "consent-uuid",
  vin: "1HGBH41JXMN109186",
  requesterId: "digit-agent",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),  // 1 hour
  used: false
}
```

**Deny:**

```http
PUT /api/consent/consent-uuid/deny
Authorization: Bearer <mario_jwt>
```

Updates `Consent.status = "denied"`. No `AccessSession` is created. The requester's poll returns `status: "denied"`.

### Step 5: Requester Gets Access Token

On the next poll cycle, `GET /api/consent/check` returns:

```json
{
  "consentId": "consent-uuid",
  "status": "approved",
  "accessToken": "sess-uuid-here",
  "expiresAt": "2026-03-20T11:00:00Z"
}
```

### Step 6: Access Protected Endpoint

The requester uses the access token to call protected vehicle registry endpoints:

```http
GET /api/vehicle-registry/vehicles/1HGBH41JXMN109186/dpp
x-access-token: sess-uuid-here
```

The backend validates:
1. `AccessSession` exists with matching `vin` and `requesterId`
2. Session is not expired (`expiresAt > now()`)
3. Session is not already `used` (for single-use sessions)

If valid, returns the full DPP payload.

---

## Access Session Details

| Field | Value | Notes |
|---|---|---|
| TTL | 1 hour | Starts from approval time |
| Token format | UUID v4 | Used as both ID and bearer token |
| Single-use | Optional | `used` flag can be checked by endpoint handlers |
| Scope | Per-VIN | Session only grants access to the specific VIN it was created for |

---

## Consent History

Both parties can view their consent history:

```http
GET /api/consent/history/mario-sanchez
```

Returns all consents where `ownerId = mario-sanchez`, with status and resolution timestamp.

---

## Failure Scenarios

| Scenario | Behavior |
|---|---|
| Duplicate consent request | Returns existing pending consent (idempotent) |
| Owner denies | Requester poll returns `{ status: "denied" }` |
| Consent expires before decision | Marked `expired` (TTL-based cleanup) |
| Access token expired | `401` — "Access session expired" |
| Wrong requester uses token | `403` — `requesterId` mismatch |
| VIN mismatch | `403` — session is scoped to specific VIN |

---

## Related

- [docs/flows/insurance-verification.md](insurance-verification.md) — This flow is Phase 1–2 of insurance verification
- [docs/backend.md#consent](../backend.md#consent) — API reference
- [docs/database.md](../database.md) — `Consent`, `AccessSession` models
