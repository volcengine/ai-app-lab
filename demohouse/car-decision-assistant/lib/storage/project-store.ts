import * as supabaseStore from "./supabase-decision-project-store";
import type {
  CreateDecisionProjectInput,
  UpdateDecisionProjectInput,
} from "./types";

export function createDecisionProject(input: CreateDecisionProjectInput = {}) {
  return supabaseStore.createDecisionProject(input);
}

export function readDecisionProject(projectId: string, editToken: string) {
  return supabaseStore.readDecisionProject(projectId, editToken);
}

export function updateDecisionProject(
  projectId: string,
  editToken: string,
  input: UpdateDecisionProjectInput,
) {
  return supabaseStore.updateDecisionProject(projectId, editToken, input);
}

export function deleteDecisionProject(projectId: string, editToken: string) {
  return supabaseStore.deleteDecisionProject(projectId, editToken);
}

export function recoverDecisionProject(
  projectId: string,
  recoveryCode: string,
) {
  return supabaseStore.recoverDecisionProject(projectId, recoveryCode);
}

export function purgeExpiredDecisionProjects(now = Date.now()) {
  return supabaseStore.purgeExpiredDecisionProjects(now);
}
