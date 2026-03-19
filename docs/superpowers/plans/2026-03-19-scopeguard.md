# ScopeGuard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI-powered client portal MVP that generates SOWs, guards scope with a three-tier AI gatekeeper, and routes payments through Raenest.

**Architecture:** Next.js App Router with API routes for all mutations. Upstash Redis stores one JSON object per project. Mistral AI handles SOW generation and scope comparison. shadcn/ui for all components.

**Tech Stack:** Next.js 14, Tailwind CSS, shadcn/ui, Upstash Redis, Mistral API, nanoid

---

## File Structure

```
src/
  app/
    layout.tsx                    # Root layout with Inter font + dark theme
    page.tsx                      # Redirect to /create
    create/
      page.tsx                    # Freelancer setup form (client component)
    project/
      [id]/
        page.tsx                  # Freelancer dashboard (client component)
    portal/
      [id]/
        page.tsx                  # Client portal (client component)
    api/
      generate-sow/route.ts      # POST: Mistral SOW generation + Redis save
      project/[id]/route.ts      # GET: Fetch project from Redis
      share/route.ts             # POST: DRAFT → PENDING
      approve/route.ts           # POST: PENDING → LOCKED
      update/route.ts            # POST: Freelancer update + optional complete
      check-scope/route.ts       # POST: Mistral gatekeeper (verdict only, no save)
      add-request/route.ts       # POST: Save confirmed client request to activity log
      review/route.ts            # POST: Freelancer approves/rejects gray area
  lib/
    redis.ts                     # Upstash Redis client singleton
    mistral.ts                   # Mistral client + SOW/gatekeeper prompts
    types.ts                     # All TypeScript interfaces
  components/
    sow-card.tsx                 # SOW display (in-scope, out-of-scope, price)
    activity-timeline.tsx        # Timeline with typed badges
    status-badge.tsx             # Project status badge
    review-card.tsx              # Gray-area review card with actions
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tailwind.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `.env.local` (template), `.gitignore`

- [ ] **Step 1: Create Next.js app**

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install @upstash/redis @mistralai/mistralai nanoid@3
```

Note: `nanoid@3` for CommonJS-compatible import.

- [ ] **Step 3: Initialize shadcn/ui**

Run:
```bash
npx shadcn@latest init -d
```

Select: New York style, Zinc color, CSS variables enabled.

- [ ] **Step 4: Add required shadcn components**

Run:
```bash
npx shadcn@latest add card button input textarea badge separator alert-dialog label
```

- [ ] **Step 5: Create .env.local template**

Create `.env.local`:
```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
MISTRAL_API_KEY=
```

- [ ] **Step 6: Update root layout for dark theme**

Edit `src/app/layout.tsx` — add `dark` class to `<html>` tag and set metadata:
```tsx
export const metadata: Metadata = {
  title: "ScopeGuard",
  description: "Eliminate scope creep. Get paid.",
};

// In the html tag:
<html lang="en" className="dark">
```

- [ ] **Step 7: Set root page to redirect**

Replace `src/app/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/create");
}
```

- [ ] **Step 8: Verify dev server starts**

Run: `npm run dev`
Expected: App loads at localhost:3000, redirects to /create (404 is fine — page not built yet).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: scaffold Next.js app with shadcn/ui, Upstash, Mistral deps"
```

---

### Task 2: Types & Library Layer

**Files:**
- Create: `src/lib/types.ts`, `src/lib/redis.ts`, `src/lib/mistral.ts`

- [ ] **Step 1: Define TypeScript interfaces**

Create `src/lib/types.ts`:
```typescript
export type ProjectStatus = "DRAFT" | "PENDING" | "LOCKED" | "COMPLETED";

export type LogEntryType = "SYSTEM" | "FREELANCER_UPDATE" | "CLIENT_REQUEST";

export type ScopeVerdict = "IN_SCOPE" | "GRAY_AREA" | "OUT_OF_SCOPE";

export type ReviewStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

export interface SowData {
  summary: string;
  inScope: string[];
  outOfScope: string[];
  totalPrice: number;
}

export interface ActivityLogEntry {
  id: string;
  date: string;
  type: LogEntryType;
  message: string;
  scopeVerdict: ScopeVerdict | null;
  reviewStatus: ReviewStatus | null;
  surcharge: number | null;
  aiReasoning: string | null;
}

export interface Project {
  projectId: string;
  status: ProjectStatus;
  createdAt: string;
  freelancerName: string;
  raenestLink: string;
  freelancerUrl: string;
  clientUrl: string;
  sowData: SowData;
  activityLog: ActivityLogEntry[];
}
```

- [ ] **Step 2: Create Redis client**

Create `src/lib/redis.ts`:
```typescript
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function getProject(projectId: string) {
  return redis.get<Project>(`project:${projectId}`);
}

export async function saveProject(project: Project) {
  await redis.set(`project:${project.projectId}`, project);
  return project;
}
```

Add the import for `Project` type at the top.

- [ ] **Step 3: Create Mistral client with prompts**

Create `src/lib/mistral.ts`:
```typescript
import { Mistral } from "@mistralai/mistralai";

const client = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY!,
});

const SOW_SYSTEM_PROMPT = `You are a professional project analyst. Analyze the client notes provided and extract a structured Statement of Work (SOW).

Return ONLY valid JSON matching this exact schema:
{
  "summary": "One sentence project summary",
  "inScope": ["Deliverable 1", "Deliverable 2"],
  "outOfScope": ["Item 1", "Item 2"],
  "totalPrice": <number from user input>
}

Rules:
- inScope: concrete deliverables the client explicitly asked for
- outOfScope: related work not mentioned or explicitly excluded
- summary: one clear sentence describing the project
- totalPrice: use the exact price provided
- Return ONLY the JSON object, no markdown, no explanation`;

const GATEKEEPER_SYSTEM_PROMPT = `You are a scope gatekeeper for a freelance project. Compare the client's request against the locked Statement of Work (SOW).

Return ONLY valid JSON matching this exact schema:
{
  "verdict": "IN_SCOPE" | "GRAY_AREA" | "OUT_OF_SCOPE",
  "reasoning": "Brief explanation of your decision",
  "estimatedSurcharge": <number or null>
}

Verdict criteria:
- IN_SCOPE: Request is clearly covered by items listed in inScope
- GRAY_AREA: Request is related to scope items but not explicitly listed — needs freelancer decision
- OUT_OF_SCOPE: Request matches outOfScope items or is entirely new work not covered

For OUT_OF_SCOPE, estimate a reasonable surcharge based on complexity relative to the total project price.
For GRAY_AREA, set estimatedSurcharge to null.
For IN_SCOPE, set estimatedSurcharge to null.

Return ONLY the JSON object, no markdown, no explanation`;

export async function generateSow(clientNotes: string, basePrice: number) {
  const response = await client.chat.complete({
    model: "mistral-small-latest",
    messages: [
      { role: "system", content: SOW_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Client notes:\n${clientNotes}\n\nBase price: $${basePrice}`,
      },
    ],
    responseFormat: { type: "json_object" },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Failed to generate SOW from Mistral");
  }
  return JSON.parse(content);
}

export async function checkScope(
  requestText: string,
  sowData: { summary: string; inScope: string[]; outOfScope: string[]; totalPrice: number }
) {
  const response = await client.chat.complete({
    model: "mistral-small-latest",
    messages: [
      { role: "system", content: GATEKEEPER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `SOW:\n${JSON.stringify(sowData, null, 2)}\n\nClient request: "${requestText}"`,
      },
    ],
    responseFormat: { type: "json_object" },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Failed to check scope from Mistral");
  }
  return JSON.parse(content);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/ && git commit -m "feat: add types, Redis client, and Mistral AI prompts"
```

---

### Task 3: API Routes — Project CRUD

**Files:**
- Create: `src/app/api/generate-sow/route.ts`
- Create: `src/app/api/project/[id]/route.ts`
- Create: `src/app/api/share/route.ts`
- Create: `src/app/api/approve/route.ts`
- Create: `src/app/api/update/route.ts`

- [ ] **Step 1: Create generate-sow route**

Create `src/app/api/generate-sow/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { generateSow } from "@/lib/mistral";
import { saveProject } from "@/lib/redis";
import { Project } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { freelancerName, clientNotes, basePrice, raenestLink } =
      await request.json();

    if (!freelancerName || !clientNotes || !basePrice || !raenestLink) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const sowData = await generateSow(clientNotes, basePrice);
    const projectId = nanoid(12);

    const project: Project = {
      projectId,
      status: "DRAFT",
      createdAt: new Date().toISOString(),
      freelancerName,
      raenestLink,
      freelancerUrl: `/project/${projectId}`,
      clientUrl: `/portal/${projectId}`,
      sowData,
      activityLog: [
        {
          id: nanoid(8),
          date: new Date().toISOString(),
          type: "SYSTEM",
          message: "Project created. SOW generated by AI.",
          scopeVerdict: null,
          reviewStatus: null,
          surcharge: null,
          aiReasoning: null,
        },
      ],
    };

    await saveProject(project);

    return NextResponse.json(project);
  } catch (error) {
    console.error("Generate SOW error:", error);
    return NextResponse.json(
      { error: "Failed to generate SOW" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Create get project route**

Create `src/app/api/project/[id]/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getProject } from "@/lib/redis";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await getProject(id);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}
```

- [ ] **Step 3: Create share route**

Create `src/app/api/share/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getProject, saveProject } from "@/lib/redis";

export async function POST(request: Request) {
  const { projectId } = await request.json();
  const project = await getProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Project already shared" },
      { status: 400 }
    );
  }

  project.status = "PENDING";
  project.activityLog.push({
    id: nanoid(8),
    date: new Date().toISOString(),
    type: "SYSTEM",
    message: "Project shared. Awaiting client approval.",
    scopeVerdict: null,
    reviewStatus: null,
    surcharge: null,
    aiReasoning: null,
  });

  await saveProject(project);
  return NextResponse.json(project);
}
```

- [ ] **Step 4: Create approve route**

Create `src/app/api/approve/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getProject, saveProject } from "@/lib/redis";

export async function POST(request: Request) {
  const { projectId } = await request.json();
  const project = await getProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.status !== "PENDING") {
    return NextResponse.json(
      { error: "Project cannot be approved in current state" },
      { status: 400 }
    );
  }

  project.status = "LOCKED";
  project.activityLog.push({
    id: nanoid(8),
    date: new Date().toISOString(),
    type: "SYSTEM",
    message: "Client approved SOW. Scope locked.",
    scopeVerdict: null,
    reviewStatus: null,
    surcharge: null,
    aiReasoning: null,
  });

  await saveProject(project);
  return NextResponse.json(project);
}
```

- [ ] **Step 5: Create update route**

Create `src/app/api/update/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getProject, saveProject } from "@/lib/redis";

export async function POST(request: Request) {
  const { projectId, message, markComplete } = await request.json();
  const project = await getProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.status !== "LOCKED") {
    return NextResponse.json(
      { error: "Project is not in active state" },
      { status: 400 }
    );
  }

  project.activityLog.push({
    id: nanoid(8),
    date: new Date().toISOString(),
    type: "FREELANCER_UPDATE",
    message,
    scopeVerdict: null,
    reviewStatus: null,
    surcharge: null,
    aiReasoning: null,
  });

  if (markComplete) {
    project.status = "COMPLETED";
    project.activityLog.push({
      id: nanoid(8),
      date: new Date().toISOString(),
      type: "SYSTEM",
      message: "Project marked as complete.",
      scopeVerdict: null,
      reviewStatus: null,
      surcharge: null,
      aiReasoning: null,
    });
  }

  await saveProject(project);
  return NextResponse.json(project);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ && git commit -m "feat: add API routes for project CRUD (generate, get, share, approve, update)"
```

---

### Task 4: API Routes — AI Gatekeeper & Review

**Files:**
- Create: `src/app/api/check-scope/route.ts`
- Create: `src/app/api/review/route.ts`

- [ ] **Step 1: Create check-scope route (verdict only, no save)**

Create `src/app/api/check-scope/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { checkScope } from "@/lib/mistral";
import { getProject } from "@/lib/redis";

export async function POST(request: Request) {
  try {
    const { projectId, requestText } = await request.json();
    const project = await getProject(projectId);

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }
    if (project.status !== "LOCKED") {
      return NextResponse.json(
        { error: "Scope checking only available for locked projects" },
        { status: 400 }
      );
    }

    const result = await checkScope(requestText, project.sowData);

    return NextResponse.json({
      verdict: result.verdict,
      reasoning: result.reasoning,
      estimatedSurcharge: result.estimatedSurcharge ?? null,
    });
  } catch (error) {
    console.error("Check scope error:", error);
    return NextResponse.json(
      { error: "Failed to check scope" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Create add-request route (saves to activity log)**

Create `src/app/api/add-request/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getProject, saveProject } from "@/lib/redis";
import { ScopeVerdict } from "@/lib/types";

export async function POST(request: Request) {
  const { projectId, requestText, verdict, reasoning, estimatedSurcharge } =
    await request.json();
  const project = await getProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  project.activityLog.push({
    id: nanoid(8),
    date: new Date().toISOString(),
    type: "CLIENT_REQUEST",
    message: requestText,
    scopeVerdict: verdict as ScopeVerdict,
    reviewStatus: verdict === "IN_SCOPE" ? null : "PENDING_REVIEW",
    surcharge: estimatedSurcharge ?? null,
    aiReasoning: reasoning,
  });

  await saveProject(project);
  return NextResponse.json(project);
}
```

- [ ] **Step 3: Create review route**

Create `src/app/api/review/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getProject, saveProject } from "@/lib/redis";

export async function POST(request: Request) {
  const { projectId, logEntryId, action, surcharge } = await request.json();
  const project = await getProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const entry = project.activityLog.find((e) => e.id === logEntryId);
  if (!entry) {
    return NextResponse.json(
      { error: "Log entry not found" },
      { status: 404 }
    );
  }
  if (entry.reviewStatus !== "PENDING_REVIEW") {
    return NextResponse.json(
      { error: "Entry is not pending review" },
      { status: 400 }
    );
  }

  entry.reviewStatus = action;
  if (surcharge !== undefined && surcharge !== null) {
    entry.surcharge = surcharge;
  }

  await saveProject(project);
  return NextResponse.json(project);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/check-scope/ src/app/api/add-request/ src/app/api/review/ && git commit -m "feat: add AI gatekeeper, add-request, and freelancer review API routes"
```

---

### Task 5: Shared UI Components

**Files:**
- Create: `src/components/sow-card.tsx`
- Create: `src/components/activity-timeline.tsx`
- Create: `src/components/status-badge.tsx`
- Create: `src/components/review-card.tsx`

- [ ] **Step 1: Create status badge component**

Create `src/components/status-badge.tsx`:
```tsx
import { Badge } from "@/components/ui/badge";
import { ProjectStatus } from "@/lib/types";

const statusConfig: Record<
  ProjectStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "DRAFT",
    className: "bg-zinc-800 text-zinc-400 border-zinc-700",
  },
  PENDING: {
    label: "PENDING",
    className: "bg-yellow-950 text-yellow-500 border-yellow-800",
  },
  LOCKED: {
    label: "LOCKED",
    className: "bg-green-950 text-green-500 border-green-800",
  },
  COMPLETED: {
    label: "COMPLETED",
    className: "bg-blue-950 text-blue-500 border-blue-800",
  },
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
```

- [ ] **Step 2: Create SOW card component**

Create `src/components/sow-card.tsx`:
```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SowData } from "@/lib/types";

export function SowCard({
  sowData,
  description,
}: {
  sowData: SowData;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scope of Work</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <p className="text-xs font-semibold text-green-500 mb-2">IN SCOPE</p>
          <ul className="text-sm text-foreground list-disc pl-5 space-y-1">
            {sowData.inScope.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="mb-4">
          <p className="text-xs font-semibold text-red-500 mb-2">OUT OF SCOPE</p>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            {sowData.outOfScope.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
        <Separator className="my-4" />
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total Price</span>
          <span className="text-lg font-bold">${sowData.totalPrice}</span>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create activity timeline component**

Create `src/components/activity-timeline.tsx`:
```tsx
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityLogEntry } from "@/lib/types";

const typeBadge: Record<string, { label: string; className: string }> = {
  SYSTEM: {
    label: "SYSTEM",
    className: "bg-zinc-800 text-zinc-400 border-zinc-700",
  },
  FREELANCER_UPDATE: {
    label: "FREELANCER",
    className: "bg-violet-950 text-violet-400 border-violet-800",
  },
  CLIENT_REQUEST: {
    label: "CLIENT",
    className: "bg-blue-950 text-blue-400 border-blue-800",
  },
};

const verdictBadge: Record<string, { label: string; className: string }> = {
  IN_SCOPE: {
    label: "IN SCOPE",
    className: "bg-green-950 text-green-500 border-green-800",
  },
  GRAY_AREA: {
    label: "GRAY AREA",
    className: "bg-yellow-950 text-yellow-500 border-yellow-800",
  },
  OUT_OF_SCOPE: {
    label: "OUT OF SCOPE",
    className: "bg-red-950 text-red-500 border-red-800",
  },
};

export function ActivityTimeline({ entries }: { entries: ActivityLogEntry[] }) {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border-l-2 border-border pl-4 space-y-4">
          {sorted.map((entry) => (
            <div key={entry.id}>
              <p className="text-xs text-muted-foreground">
                {new Date(entry.date).toLocaleString()}
              </p>
              <p className="text-sm text-foreground">{entry.message}</p>
              <div className="flex gap-1 mt-1 flex-wrap">
                <Badge
                  variant="outline"
                  className={typeBadge[entry.type]?.className}
                >
                  {typeBadge[entry.type]?.label}
                </Badge>
                {entry.scopeVerdict && (
                  <Badge
                    variant="outline"
                    className={verdictBadge[entry.scopeVerdict]?.className}
                  >
                    {verdictBadge[entry.scopeVerdict]?.label}
                  </Badge>
                )}
                {entry.reviewStatus === "PENDING_REVIEW" && (
                  <Badge
                    variant="outline"
                    className="bg-yellow-950 text-yellow-500 border-yellow-800"
                  >
                    AWAITING REVIEW
                  </Badge>
                )}
                {entry.reviewStatus === "APPROVED" && (
                  <Badge
                    variant="outline"
                    className="bg-green-950 text-green-500 border-green-800"
                  >
                    APPROVED
                  </Badge>
                )}
                {entry.reviewStatus === "REJECTED" && (
                  <Badge
                    variant="outline"
                    className="bg-red-950 text-red-500 border-red-800"
                  >
                    REJECTED
                  </Badge>
                )}
                {entry.surcharge && (
                  <Badge
                    variant="outline"
                    className="bg-yellow-950 text-yellow-500 border-yellow-800"
                  >
                    +${entry.surcharge}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create review card component**

Create `src/components/review-card.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ActivityLogEntry } from "@/lib/types";

export function ReviewCard({
  entry,
  projectId,
  onReviewed,
}: {
  entry: ActivityLogEntry;
  projectId: string;
  onReviewed: () => void;
}) {
  const [surchargeAmount, setSurchargeAmount] = useState("");
  const [showSurcharge, setShowSurcharge] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleReview(action: "APPROVED" | "REJECTED", surcharge?: number) {
    setLoading(true);
    await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        logEntryId: entry.id,
        action,
        surcharge: surcharge ?? null,
      }),
    });
    setLoading(false);
    onReviewed();
  }

  return (
    <div className="border border-yellow-800 bg-yellow-950 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-semibold text-yellow-500">Needs Your Review</p>
        <Badge variant="outline" className="bg-zinc-800 text-zinc-400 border-zinc-700">
          GRAY AREA
        </Badge>
      </div>
      <p className="text-sm text-foreground mb-1">&ldquo;{entry.message}&rdquo;</p>
      {entry.aiReasoning && (
        <p className="text-xs text-muted-foreground mb-3">
          AI: {entry.aiReasoning}
        </p>
      )}
      {showSurcharge ? (
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Surcharge $"
            value={surchargeAmount}
            onChange={(e) => setSurchargeAmount(e.target.value)}
            className="w-32"
          />
          <Button
            size="sm"
            disabled={loading || !surchargeAmount}
            onClick={() =>
              handleReview("APPROVED", Number(surchargeAmount))
            }
          >
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSurcharge(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={loading}
            onClick={() => handleReview("APPROVED")}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => setShowSurcharge(true)}
          >
            + Surcharge
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={loading}
            onClick={() => handleReview("REJECTED")}
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ && git commit -m "feat: add shared UI components (SOW card, timeline, status badge, review card)"
```

---

### Task 6: Freelancer Setup Page (`/create`)

**Files:**
- Create: `src/app/create/page.tsx`

- [ ] **Step 1: Build the create page**

Create `src/app/create/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SowCard } from "@/components/sow-card";
import { Project } from "@/lib/types";

export default function CreatePage() {
  const router = useRouter();
  const [freelancerName, setFreelancerName] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [raenestLink, setRaenestLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generate-sow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freelancerName,
          clientNotes,
          basePrice: Number(basePrice),
          raenestLink,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate SOW");
      }
      const data = await res.json();
      setProject(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleShare() {
    if (!project) return;
    setLoading(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.projectId }),
      });
      if (!res.ok) throw new Error("Failed to share project");
      router.push(project.freelancerUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">ScopeGuard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Eliminate scope creep. Get paid.
          </p>
        </div>

        {!project ? (
          <Card>
            <CardHeader>
              <CardTitle>New Project</CardTitle>
              <CardDescription>
                Paste your client notes and we&apos;ll generate a professional
                SOW.
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label htmlFor="name">Your Name</Label>
                <Input
                  id="name"
                  placeholder="Emmanuel"
                  value={freelancerName}
                  onChange={(e) => setFreelancerName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="notes">Client Notes / Chat History</Label>
                <Textarea
                  id="notes"
                  placeholder="Paste your client conversation, project brief, or requirements here..."
                  className="min-h-[120px]"
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="price">Base Price ($)</Label>
                  <Input
                    id="price"
                    type="number"
                    placeholder="500"
                    value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="raenest">Raenest Payment Link</Label>
                  <Input
                    id="raenest"
                    placeholder="https://pay.raenest.com/..."
                    value={raenestLink}
                    onChange={(e) => setRaenestLink(e.target.value)}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={
                  loading ||
                  !freelancerName ||
                  !clientNotes ||
                  !basePrice ||
                  !raenestLink
                }
              >
                {loading ? "Generating..." : "Generate SOW with AI"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <SowCard
              sowData={project.sowData}
              description="AI-generated from your client notes. Review before sharing."
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button className="w-full" onClick={handleShare} disabled={loading}>
              {loading ? "Sharing..." : "Generate Client Portal Link"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Run: `npm run dev`
Navigate to `http://localhost:3000/create`. Verify the form renders with all fields and the button.

- [ ] **Step 3: Commit**

```bash
git add src/app/create/ && git commit -m "feat: add freelancer setup page with SOW generation"
```

---

### Task 7: Freelancer Dashboard Page (`/project/[id]`)

**Files:**
- Create: `src/app/project/[id]/page.tsx`

- [ ] **Step 1: Build the freelancer dashboard**

Create `src/app/project/[id]/page.tsx`:
```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SowCard } from "@/components/sow-card";
import { ActivityTimeline } from "@/components/activity-timeline";
import { StatusBadge } from "@/components/status-badge";
import { ReviewCard } from "@/components/review-card";
import { Project } from "@/lib/types";

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [updateText, setUpdateText] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/project/${projectId}`);
    if (res.ok) {
      setProject(await res.json());
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
    const interval = setInterval(fetchProject, 10000);
    return () => clearInterval(interval);
  }, [fetchProject]);

  async function handleUpdate(markComplete = false) {
    if (!updateText && !markComplete) return;
    setLoading(true);
    await fetch("/api/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        message: markComplete
          ? updateText || "Project complete."
          : updateText,
        markComplete,
      }),
    });
    setUpdateText("");
    await fetchProject();
    setLoading(false);
  }

  function handleCopy() {
    if (!project) return;
    navigator.clipboard.writeText(
      `${window.location.origin}${project.clientUrl}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  const pendingReviews = project.activityLog.filter(
    (e) => e.reviewStatus === "PENDING_REVIEW"
  );

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Project Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              {project.status === "PENDING"
                ? "Waiting for client approval"
                : project.status === "LOCKED"
                ? "Client portal is live"
                : project.status === "COMPLETED"
                ? "Project complete"
                : "Review SOW before sharing"}
            </p>
          </div>
          <div className="flex gap-2">
            <StatusBadge status={project.status} />
            {pendingReviews.length > 0 && (
              <Badge
                variant="outline"
                className="bg-yellow-950 text-yellow-500 border-yellow-800"
              >
                {pendingReviews.length} Review
                {pendingReviews.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: SOW */}
          <SowCard
            sowData={project.sowData}
            description="AI-generated from client notes"
          />

          {/* Right Column */}
          <div className="space-y-4">
            {/* Pending Reviews */}
            {pendingReviews.map((entry) => (
              <ReviewCard
                key={entry.id}
                entry={entry}
                projectId={projectId}
                onReviewed={fetchProject}
              />
            ))}

            {/* Post Update (only when LOCKED) */}
            {project.status === "LOCKED" && (
              <Card>
                <CardContent className="pt-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Post an update..."
                      value={updateText}
                      onChange={(e) => setUpdateText(e.target.value)}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={loading || !updateText}
                      onClick={() => handleUpdate(false)}
                    >
                      Post
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full mt-2 border-blue-500 text-blue-500 hover:bg-blue-950"
                    disabled={loading}
                    onClick={() => handleUpdate(true)}
                  >
                    Mark Project Complete
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            <ActivityTimeline entries={project.activityLog} />
          </div>
        </div>

        {/* Client Link Bar */}
        <Card className="mt-4">
          <CardContent className="py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">
                Share with your client
              </p>
              <p className="text-sm font-mono text-blue-500">
                {typeof window !== "undefined"
                  ? `${window.location.origin}${project.clientUrl}`
                  : project.clientUrl}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy Link"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Run: `npm run dev`
Navigate to `http://localhost:3000/project/test` — should show "Loading project..." (no data yet, which is fine).

- [ ] **Step 3: Commit**

```bash
git add src/app/project/ && git commit -m "feat: add freelancer dashboard with reviews, updates, and timeline"
```

---

### Task 8: Client Portal Page (`/portal/[id]`)

**Files:**
- Create: `src/app/portal/[id]/page.tsx`

- [ ] **Step 1: Build the client portal**

Create `src/app/portal/[id]/page.tsx`:
```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SowCard } from "@/components/sow-card";
import { ActivityTimeline } from "@/components/activity-timeline";
import { StatusBadge } from "@/components/status-badge";
import { Project } from "@/lib/types";

export default function PortalPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [requestText, setRequestText] = useState("");
  const [loading, setLoading] = useState(false);
  const [scopeDialog, setScopeDialog] = useState<{
    open: boolean;
    verdict: string;
    reasoning: string;
    estimatedSurcharge: number | null;
    requestText: string;
  }>({ open: false, verdict: "", reasoning: "", estimatedSurcharge: null, requestText: "" });

  async function saveRequest(
    text: string,
    verdict: string,
    reasoning: string,
    estimatedSurcharge: number | null
  ) {
    await fetch("/api/add-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        requestText: text,
        verdict,
        reasoning,
        estimatedSurcharge,
      }),
    });
    await fetchProject();
  }

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/project/${projectId}`);
    if (res.ok) {
      setProject(await res.json());
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
    const interval = setInterval(fetchProject, 10000);
    return () => clearInterval(interval);
  }, [fetchProject]);

  async function handleApprove() {
    setLoading(true);
    await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    await fetchProject();
    setLoading(false);
  }

  async function handleSubmitRequest() {
    if (!requestText) return;
    setLoading(true);
    const res = await fetch("/api/check-scope", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, requestText }),
    });
    const data = await res.json();

    if (data.verdict === "IN_SCOPE") {
      // Auto-save, no interruption
      await saveRequest(requestText, data.verdict, data.reasoning, null);
    } else if (data.verdict === "GRAY_AREA") {
      // Save as pending review, no dialog needed
      await saveRequest(requestText, data.verdict, data.reasoning, null);
    } else if (data.verdict === "OUT_OF_SCOPE") {
      // Show dialog — only save if client clicks "Request Anyway"
      setScopeDialog({
        open: true,
        verdict: data.verdict,
        reasoning: data.reasoning,
        estimatedSurcharge: data.estimatedSurcharge,
        requestText,
      });
    }

    setRequestText("");
    setLoading(false);
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Your Project</h1>
            <p className="text-sm text-muted-foreground">
              Managed by {project.freelancerName}
            </p>
          </div>
          <StatusBadge status={project.status} />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: SOW */}
          <SowCard
            sowData={project.sowData}
            description={
              project.status === "PENDING"
                ? "Review and approve to lock scope"
                : "Approved and locked"
            }
          />

          {/* Right Column */}
          <div className="space-y-4">
            {/* Approve Button (PENDING) */}
            {project.status === "PENDING" && (
              <Button
                className="w-full"
                size="lg"
                disabled={loading}
                onClick={handleApprove}
              >
                {loading ? "Approving..." : "Approve SOW & Lock Scope"}
              </Button>
            )}

            {/* Submit Request (LOCKED) */}
            {project.status === "LOCKED" && (
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm font-medium mb-2">Submit a Request</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Describe what you need..."
                      value={requestText}
                      onChange={(e) => setRequestText(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={loading || !requestText}
                      onClick={handleSubmitRequest}
                    >
                      {loading ? "..." : "Submit"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Requests are checked against the locked scope by AI.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            <ActivityTimeline entries={project.activityLog} />
          </div>
        </div>

        {/* Payment Button (COMPLETED) */}
        {project.status === "COMPLETED" ? (
          <a
            href={project.raenestLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-4"
          >
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              size="lg"
            >
              Release Payment via Raenest — ${project.sowData.totalPrice}
            </Button>
          </a>
        ) : (
          <div className="mt-4 border border-green-800 bg-green-950 rounded-lg p-5 text-center opacity-40">
            <p className="text-base font-bold text-green-500">
              Release Payment via Raenest — ${project.sowData.totalPrice}
            </p>
            <p className="text-xs text-green-400 mt-1 opacity-70">
              Activates when project is marked complete
            </p>
          </div>
        )}
      </div>

      {/* Out-of-Scope Alert Dialog */}
      <AlertDialog
        open={scopeDialog.open}
        onOpenChange={(open) =>
          setScopeDialog((prev) => ({ ...prev, open }))
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Out of Scope</AlertDialogTitle>
            <AlertDialogDescription>
              This request falls outside the agreed scope of work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="bg-muted rounded-lg p-4 my-2">
            <p className="text-sm text-foreground mb-2">
              &ldquo;{scopeDialog.requestText}&rdquo;
            </p>
            <p className="text-xs text-muted-foreground">
              {scopeDialog.reasoning}
            </p>
          </div>
          {scopeDialog.estimatedSurcharge && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">
                Estimated surcharge
              </span>
              <span className="text-lg font-bold text-yellow-500">
                +${scopeDialog.estimatedSurcharge}
              </span>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Withdraw</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await saveRequest(
                  scopeDialog.requestText,
                  scopeDialog.verdict,
                  scopeDialog.reasoning,
                  scopeDialog.estimatedSurcharge
                );
              }}
            >
              Request Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Run: `npm run dev`
Navigate to `http://localhost:3000/portal/test` — should show "Loading project...".

- [ ] **Step 3: Commit**

```bash
git add src/app/portal/ && git commit -m "feat: add client portal with scope gatekeeper and payment button"
```

---

### Task 9: End-to-End Manual Test

**Files:** None (testing only)

- [ ] **Step 1: Set up Upstash Redis**

Go to https://console.upstash.com, create a free Redis database. Copy the REST URL and token to `.env.local`.

- [ ] **Step 2: Set up Mistral API**

Go to https://console.mistral.ai, create an API key. Copy to `.env.local`.

- [ ] **Step 3: Run the full flow**

Run: `npm run dev`

1. Go to `/create` → fill in name, paste sample client notes, set price to 500, add any Raenest link
2. Click "Generate SOW with AI" → verify SOW appears with in-scope/out-of-scope items
3. Click "Generate Client Portal Link" → verify redirect to `/project/[id]`
4. Copy the client portal link → open in incognito/new tab
5. On client portal: click "Approve SOW & Lock Scope" → verify status changes to LOCKED
6. Submit an in-scope request (e.g., "Change the font on the landing page") → verify it's added without interruption
7. Submit an out-of-scope request (e.g., "Add user authentication with Google login") → verify AlertDialog appears
8. Submit a gray-area request (e.g., "Can you add a newsletter signup?") → verify it shows as AWAITING REVIEW
9. Back on freelancer dashboard: verify the gray-area review card appears → click Approve
10. Post a freelancer update → verify it appears in timeline
11. Click "Mark Project Complete" → verify status changes to COMPLETED
12. On client portal: verify payment button is now active and links to Raenest

- [ ] **Step 4: Fix any bugs found during testing**

- [ ] **Step 5: Commit any fixes**

```bash
git add -A && git commit -m "fix: end-to-end testing fixes"
```

---

### Task 10: Deploy to Vercel

**Files:** None (deployment only)

- [ ] **Step 1: Push to GitHub**

```bash
git remote add origin https://github.com/<your-username>/ScopeGuard.git
git push -u origin master
```

- [ ] **Step 2: Deploy on Vercel**

1. Go to https://vercel.com/new
2. Import the ScopeGuard repository
3. Add environment variables: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `MISTRAL_API_KEY`
4. Deploy

- [ ] **Step 3: Verify production deployment**

Run through the same flow from Task 9 on the `.vercel.app` URL.

- [ ] **Step 4: Commit .gitignore update if needed**

Add `.superpowers/` to `.gitignore` if not already there.

```bash
echo ".superpowers/" >> .gitignore
git add .gitignore && git commit -m "chore: add .superpowers to gitignore"
```
