import { findGuideLesson } from "./registry";

type GuideRun = {
  lessonId: string;
  stepIndex: number;
};

let run: GuideRun | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

export function getGuideRun(): GuideRun | null {
  return run ? { ...run } : null;
}

export function subscribeGuide(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Starts a registered lesson. An unknown or empty id does nothing. Nothing calls this on login. */
export function startGuide(lessonId: string): void {
  const lesson = findGuideLesson(lessonId);
  if (!lesson || lesson.steps.length === 0) return;
  run = { lessonId, stepIndex: 0 };
  emit();
}

export function stopGuide(): void {
  if (!run) return;
  run = null;
  emit();
}

/** Keeps step index in sync while a tour is running (e.g. catalog pages that open a row mid-lesson). */
export function setGuideStepIndex(stepIndex: number): void {
  if (!run) return;
  if (run.stepIndex === stepIndex) return;
  run = { ...run, stepIndex };
  emit();
}
