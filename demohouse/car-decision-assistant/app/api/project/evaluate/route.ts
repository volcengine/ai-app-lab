import { recordProjectAnswer } from "@/lib/project-service";
import { toProjectApiError } from "@/lib/project-errors";
import { DECISION_PROJECT_COOKIE_NAME } from "@/lib/storage";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(request: NextRequest) {
  const token = (await cookies()).get(DECISION_PROJECT_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "当前浏览器没有编辑权限" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const required = ["projectId", "candidateId", "conditionId", "answer"] as const;
    if (required.some((key) => typeof body[key] !== "string" || !body[key])) {
      throw new Error("记录内容不完整");
    }
    const quoteTotalWan =
      typeof body.quoteTotalWan === "number" &&
      Number.isFinite(body.quoteTotalWan) &&
      body.quoteTotalWan > 0
        ? body.quoteTotalWan
        : undefined;
    const project = await recordProjectAnswer(body.projectId as string, token, {
      candidateId: body.candidateId as string,
      conditionId: body.conditionId as string,
      answer: body.answer as string,
      note: typeof body.note === "string" ? body.note : undefined,
      quoteTotalWan:
        body.answer === "我已有完整报价" ? quoteTotalWan : undefined,
    });
    return NextResponse.json({ project });
  } catch (error) {
    const detail = toProjectApiError(error);
    return NextResponse.json(
      { error: detail.message, ...detail },
      { status: detail.retryable ? 409 : 400 },
    );
  }
}
