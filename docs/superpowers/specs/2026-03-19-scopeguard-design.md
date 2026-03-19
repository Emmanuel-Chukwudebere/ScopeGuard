# ScopeGuard — Design Spec

An AI-powered, two-sided asynchronous client portal that eliminates scope creep, handles the digital handshake, and routes final payments through Raenest.

## Tech Stack

- **Framework:** Next.js (App Router) + Tailwind CSS
- **UI Components:** shadcn/ui (Card, Button, Input, Textarea, Badge, Dialog/AlertDialog, Separator)
- **Database:** Upstash Redis (free tier, 10K commands/day)
- **AI Engine:** Mistral API (`mistral-small-latest`)
- **Hosting:** Vercel (free tier)
- **Auth:** None — unique URLs serve as access tokens

## Pages

### `/create` — Freelancer Setup
- Form with: name, client notes textarea, base price, Raenest payment link
- "Generate SOW with AI" button calls Mistral to produce structured SOW
- Displays generated SOW for review (in-scope, out-of-scope, summary, price)
- "Generate Client Portal Link" button saves to Redis, transitions to PENDING, shows shareable URLs

### `/project/[id]` — Freelancer Dashboard
- Header with project status badge and review notification count
- Left column: SOW card (in-scope, out-of-scope, total price)
- Right column:
  - Gray-area review cards with Approve / +Surcharge / Reject buttons
  - Post update input + "Mark Project Complete" button
  - Activity timeline with typed badges (SYSTEM, FREELANCER, CLIENT)
- Bottom bar: client portal link with copy button

### `/portal/[id]` — Client Portal
- Header with project status badge
- Left column: read-only SOW card
- Right column:
  - Submit request input (checked by AI gatekeeper)
  - Activity timeline
- Bottom: payment button (dimmed until COMPLETED, then links to Raenest)

## API Routes

### `POST /api/generate-sow`
- **Input:** `{ freelancerName, clientNotes, basePrice, raenestLink }`
- **Process:** Calls Mistral with system prompt to extract deliverables from client notes, categorize as in-scope/out-of-scope, generate summary, return strict JSON
- **Output:** Creates project in Redis with status DRAFT, returns `{ projectId, freelancerUrl, clientUrl, sowData }`

### `GET /api/project/[id]`
- **Input:** Project ID from URL param
- **Output:** Full project JSON from Redis

### `POST /api/share`
- **Input:** `{ projectId }`
- **Process:** Validates status is DRAFT, transitions to PENDING, appends system log entry "Project shared. Awaiting client approval."
- **Output:** Updated project with clientUrl

### `POST /api/approve`
- **Input:** `{ projectId }`
- **Process:** Validates status is PENDING, transitions to LOCKED, appends system log entry
- **Output:** Updated project

### `POST /api/update`
- **Input:** `{ projectId, message, markComplete? }`
- **Process:** Appends freelancer update to activity log. If `markComplete`, transitions status to COMPLETED
- **Output:** Updated project

### `POST /api/check-scope`
- **Input:** `{ projectId, requestText }`
- **Process:** Fetches locked SOW from Redis, calls Mistral with comparison prompt
- **Mistral returns:** `{ verdict: "IN_SCOPE" | "GRAY_AREA" | "OUT_OF_SCOPE", reasoning, estimatedSurcharge? }`
- **Behavior by verdict:**
  - `IN_SCOPE` — auto-added to timeline, no interruption
  - `GRAY_AREA` — added to timeline as PENDING_REVIEW, freelancer sees review notification
  - `OUT_OF_SCOPE` — returns verdict to client, client-side AlertDialog shows reasoning + surcharge. Client can "Withdraw" or "Request Anyway" (adds as PENDING_REVIEW with surcharge flagged)
- **Output:** `{ verdict, reasoning, estimatedSurcharge, logEntry }`

### `POST /api/review`
- **Input:** `{ projectId, logEntryId, action: "APPROVED" | "REJECTED", surcharge? }`
- **Process:** Updates the log entry's reviewStatus. If surcharge provided, records it on the entry.
- **Output:** Updated project

## State Machine

```
DRAFT → PENDING → LOCKED → COMPLETED
```

- **DRAFT:** SOW generated, freelancer reviewing. Client cannot see yet.
- **PENDING:** Freelancer shared link. Client can view SOW and approve.
- **LOCKED:** Client approved. Scope is frozen. Gatekeeper active.
- **COMPLETED:** Freelancer marked complete. Payment button activates.

## Database Schema (Upstash Redis)

**Key pattern:** `project:{projectId}`

```json
{
  "projectId": "abc-xyz-123",
  "status": "DRAFT | PENDING | LOCKED | COMPLETED",
  "createdAt": "2026-03-19T10:00:00Z",
  "freelancerName": "Emmanuel",
  "raenestLink": "https://pay.raenest.com/emmanuel",
  "freelancerUrl": "/project/abc-xyz-123",
  "clientUrl": "/portal/abc-xyz-123",
  "sowData": {
    "summary": "Build a landing page with contact form...",
    "inScope": ["Landing Page", "Contact Form", "Responsive Design"],
    "outOfScope": ["User Login", "Database Setup"],
    "totalPrice": 500
  },
  "activityLog": [
    {
      "id": "log-1",
      "date": "2026-03-19T10:00:00Z",
      "type": "SYSTEM | FREELANCER_UPDATE | CLIENT_REQUEST",
      "message": "Project created. Awaiting client approval.",
      "scopeVerdict": null,
      "reviewStatus": null,
      "surcharge": null,
      "aiReasoning": null
    }
  ]
}
```

## AI Prompts

### Prompt 1: SOW Generation
- **Model:** `mistral-small-latest`
- **System prompt:** Instructs Mistral to analyze raw client notes/chat, extract concrete deliverables, categorize as in-scope vs out-of-scope, generate a one-line project summary, and return strict JSON matching the `sowData` schema
- **User input:** The freelancer's pasted client notes + base price
- **Expected output:** `{ summary, inScope[], outOfScope[], totalPrice }`

### Prompt 2: Scope Gatekeeper
- **Model:** `mistral-small-latest`
- **System prompt:** Instructs Mistral to compare a client request against the locked SOW and return a three-tier verdict
- **User input:** The request text + full `sowData` object
- **Expected output:** `{ verdict: "IN_SCOPE" | "GRAY_AREA" | "OUT_OF_SCOPE", reasoning: string, estimatedSurcharge: number | null }`
- **Verdict criteria:**
  - `IN_SCOPE`: Request is clearly covered by items in `inScope`
  - `GRAY_AREA`: Request is related to scope items but not explicitly listed
  - `OUT_OF_SCOPE`: Request matches `outOfScope` items or is entirely new work

## UI Components (shadcn/ui mapping)

| Feature | shadcn Components |
|---------|------------------|
| Setup form | Card, Input, Textarea, Button, Label |
| SOW display | Card, Separator, Badge |
| Status indicators | Badge (color variants) |
| Gray-area review | Alert, Button (primary/outline/destructive) |
| Out-of-scope intercept | AlertDialog |
| Activity timeline | Card with custom timeline markup |
| Post update | Input, Button |
| Payment button | Button (full-width, green variant) |
| Link sharing | Card, Button |

## Real-Time Updates

Client and freelancer dashboards use polling (`setInterval` every 10 seconds) to fetch updated project data via `GET /api/project/[id]`. No SSE or WebSocket needed for MVP.

## Project ID Generation

Use `nanoid` (short, URL-safe IDs). Format: 12-character alphanumeric string. Example: `a1b2c3d4e5f6`.

## Error Handling

- Mistral API timeout/failure: show toast with retry option, don't save partial data
- Redis connection failure: show error page with retry
- Invalid project ID: 404 page
- Wrong status for action (e.g., approve on already-locked project): return 400 with message, UI handles gracefully

## File Structure

```
src/
  app/
    page.tsx              # Redirect to /create
    create/
      page.tsx            # Freelancer setup form
    project/
      [id]/
        page.tsx          # Freelancer dashboard
    portal/
      [id]/
        page.tsx          # Client portal
    api/
      generate-sow/
        route.ts
      project/
        [id]/
          route.ts
      share/
        route.ts
      approve/
        route.ts
      update/
        route.ts
      check-scope/
        route.ts
      review/
        route.ts
  lib/
    redis.ts              # Upstash Redis client
    mistral.ts            # Mistral API client + prompts
    types.ts              # TypeScript interfaces
  components/
    sow-card.tsx          # Reusable SOW display
    activity-timeline.tsx # Reusable timeline
    status-badge.tsx      # Status badge component
    review-card.tsx       # Gray-area review card
```
