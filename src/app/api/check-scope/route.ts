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
