import {
  createProjectWithHarness,
  readProjectView,
  validateNewProjectRequest,
} from "@/lib/project-service";
import {
  ProjectErrorCode,
  ProjectServiceError,
  projectApiError,
  toProjectApiError,
} from "@/lib/project-errors";
import {
  DECISION_PROJECT_COOKIE_NAME,
  DECISION_PROJECT_TTL_DAYS,
  deleteDecisionProject,
} from "@/lib/storage";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

function setEditCookie(response: NextResponse, editToken: string) {
  response.cookies.set(DECISION_PROJECT_COOKIE_NAME, editToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DECISION_PROJECT_TTL_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim();
  const token = (await cookies()).get(DECISION_PROJECT_COOKIE_NAME)?.value;
  if (!projectId || !token) {
    return NextResponse.json({ error: "当前浏览器没有可恢复的项目" }, { status: 404 });
  }
  try {
    const project = await readProjectView(projectId, token);
    return NextResponse.json({ project });
  } catch (error) {
    const detail = toProjectApiError(
      error,
      ProjectErrorCode.PROJECT_NOT_FOUND,
    );
    return NextResponse.json(
      { error: detail.message, ...detail },
      { status: 404 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = validateNewProjectRequest(await request.json());
    const previousEditToken = (await cookies()).get(
      DECISION_PROJECT_COOKIE_NAME,
    )?.value;
    const result = await createProjectWithHarness(input);
    if (
      input.replaceProjectId &&
      !result.requiresIdentityConfirmation &&
      result.editToken
    ) {
      if (!previousEditToken) {
        await deleteDecisionProject(
          result.project.id,
          result.editToken,
        ).catch(() => {});
        throw new ProjectServiceError(
          projectApiError(ProjectErrorCode.PROJECT_SAVE_FAILED, {
            message: "当前浏览器没有原项目的编辑权限",
            action: "请先恢复原项目，再修改需求",
          }),
        );
      }
      try {
        await deleteDecisionProject(
          input.replaceProjectId,
          previousEditToken,
        );
      } catch (error) {
        await deleteDecisionProject(
          result.project.id,
          result.editToken,
        ).catch(() => {});
        throw new ProjectServiceError(
          projectApiError(ProjectErrorCode.PROJECT_SAVE_FAILED, {
            message: "新结果已回滚，原项目保持不变",
            action: "请刷新页面后重试",
          }),
          { cause: error },
        );
      }
    }
    const response = NextResponse.json({
      project: result.project,
      recoveryCode: result.recoveryCode,
      requiresIdentityConfirmation: result.requiresIdentityConfirmation,
      code: result.code,
      harness: result.harness,
    });
    if (result.editToken) {
      setEditCookie(response, result.editToken);
    }
    return response;
  } catch (error) {
    const detail = toProjectApiError(error);
    return NextResponse.json(
      { error: detail.message, ...detail },
      { status: detail.retryable ? 503 : 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim();
  const token = (await cookies()).get(DECISION_PROJECT_COOKIE_NAME)?.value;
  if (!projectId || !token) {
    return NextResponse.json({ error: "没有可删除的项目" }, { status: 404 });
  }
  try {
    await deleteDecisionProject(projectId, token);
    const response = NextResponse.json({ deleted: true });
    response.cookies.delete(DECISION_PROJECT_COOKIE_NAME);
    return response;
  } catch (error) {
    const detail = toProjectApiError(error);
    return NextResponse.json(
      { error: detail.message, ...detail },
      { status: detail.code === ProjectErrorCode.PROJECT_NOT_FOUND ? 404 : 400 },
    );
  }
}
