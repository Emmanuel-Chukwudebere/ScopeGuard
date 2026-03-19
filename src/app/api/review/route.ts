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
