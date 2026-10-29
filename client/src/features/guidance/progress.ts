/** Clinic tour progress. Not the dashboard `mudita_dash_*` namespace. */

const GUIDE_PROGRESS_PREFIX = "mudita_guide_";

export function guideProgressKey(userId: number, lessonId: string): string {
  return `${GUIDE_PROGRESS_PREFIX}${userId}_${lessonId}`;
}

export function writeGuideProgress(userId: number, lessonId: string, stepIndex: number): void {
  localStorage.setItem(guideProgressKey(userId, lessonId), String(stepIndex));
}
