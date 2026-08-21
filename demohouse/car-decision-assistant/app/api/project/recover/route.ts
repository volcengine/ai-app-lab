import { readProjectView } from "@/lib/project-service";
import {
  ProjectErrorCode,
  toProjectApiError,
} from "@/lib/project-errors";
import {
  DECISION_PROJECT_COOKIE_NAME,
  DECISION_PROJECT_TTL_DAYS,
  recoverDecisionProject,
} from "@/lib/storage";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.projectId !== "string" ||
      typeof body.recoveryCode !== "string"
    ) {
      throw new Error("项目编号或恢复码无效");
    }
    const recovered = await recoverDecisionProject(
      body.projectId.trim(),
      body.recoveryCode.trim(),
    );
    const project = await readProjectView(
      recovered.projectId,
      recovered.editToken,
    );
    const response = NextResponse.json({ project });
    response.cookies.set(DECISION_PROJECT_COOKIE_NAME, recovered.editToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: DECISION_PROJECT_TTL_DAYS * 24 * 60 * 60,
      path: "/",
    });
    return response;
  } catch (error) {
    const detail = toProjectApiError(
      error,
      ProjectErrorCode.RECOVERY_CODE_INVALID,
    );
    return NextResponse.json(
      { error: detail.message, ...detail },
      { status: 400 },
    );
  }
}
