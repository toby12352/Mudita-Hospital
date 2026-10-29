import { useEffect, useRef, useState } from "react";
import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { t, useI18n } from "@/shared/i18n";
import { getGuideRun, stopGuide, subscribeGuide } from "./guideControl";
import { writeGuideProgress } from "./progress";
import { findGuideLesson, guideScreensEqual, type GuideLesson, type GuideScreen } from "./registry";
import "./guide.css";

/** Time for a named screen to mount before a missing anchor is skipped. */
const SCREEN_WAIT_MS = 1000;

const TOUR_BLOCKED_KEYS = new Set(["F2", "F5", "F6", "F7", "F8", "F9", "F10"]);

/** Clinic scrim is rgba(26, 31, 46, 0.4). The popover itself is styled in guide.css. */
const OVERLAY_COLOR = "#1a1f2e";
const OVERLAY_OPACITY = 0.4;

function toDriverProgress(text: string): string {
  return text.replace(/\{current\}/g, "{{current}}").replace(/\{total\}/g, "{{total}}");
}

function swallowTourKeys(event: KeyboardEvent): void {
  if (!TOUR_BLOCKED_KEYS.has(event.key)) return;
  event.preventDefault();
  // Desk shortcuts listen on the bubble phase. Stop the key here so they do not run.
  event.stopPropagation();
}

function openLessonScreen(
  lesson: GuideLesson,
  stepIndex: number,
  openScreen: ((screen: GuideScreen) => void) | undefined,
): void {
  const step = lesson.steps[stepIndex];
  if (step?.screen) openScreen?.(step.screen);
}

/**
 * Mounted beside Help. Renders nothing. A tour runs only after startGuide.
 */
export function GuidanceHost({
  userId,
  openScreen,
}: {
  userId: number;
  /** Opens a step's screen. Omitted screens stay on the desk already open. */
  openScreen?: (screen: GuideScreen) => void;
}) {
  const { locale } = useI18n();
  const [lessonId, setLessonId] = useState<string | null>(null);
  const stepRef = useRef(0);
  const rebuilding = useRef(false);
  const openScreenRef = useRef(openScreen);
  openScreenRef.current = openScreen;

  useEffect(() => {
    const unsubscribe = subscribeGuide(() => {
      const next = getGuideRun();
      if (!next) {
        setLessonId(null);
        return;
      }
      stepRef.current = next.stepIndex;
      setLessonId(next.lessonId);
    });
    return () => {
      unsubscribe();
      stopGuide();
    };
  }, []);

  useEffect(() => {
    if (!lessonId) return;
    const lesson = findGuideLesson(lessonId);
    if (!lesson || lesson.steps.length === 0) return;

    const movesScreen = lesson.steps.some((step) => step.screen != null);
    const steps: DriveStep[] = lesson.steps.map((step, stepIndex) => {
      const prev = lesson.steps[stepIndex - 1];
      const screenChanges = step.screen != null && (stepIndex === 0 || !guideScreensEqual(prev?.screen, step.screen));
      return {
        element: step.element,
        ...(screenChanges ? { waitForElement: SCREEN_WAIT_MS } : {}),
        popover: {
          title: t(step.titleKey),
          description: t(step.bodyKey),
          side: step.side,
          ...(movesScreen
            ? {
                onNextClick: (_element, _step, opts) => {
                  const current = opts.driver.getActiveIndex();
                  const nextIndex = (typeof current === "number" ? current : 0) + 1;
                  openLessonScreen(lesson, nextIndex, openScreenRef.current);
                  opts.driver.moveNext();
                },
                onPrevClick: (_element, _step, opts) => {
                  const current = opts.driver.getActiveIndex();
                  const prevIndex = (typeof current === "number" ? current : 0) - 1;
                  if (prevIndex >= 0) openLessonScreen(lesson, prevIndex, openScreenRef.current);
                  opts.driver.movePrevious();
                },
              }
            : {}),
        },
      };
    });
    const index = Math.min(Math.max(stepRef.current, 0), steps.length - 1);
    let tour: Driver | null = null;

    tour = driver({
      steps,
      disableActiveInteraction: true,
      skipMissingElement: true,
      popoverClass: "mudita-guide-popover",
      showProgress: true,
      showButtons: ["next", "previous", "close"],
      allowClose: true,
      overlayClickBehavior: "close",
      overlayColor: OVERLAY_COLOR,
      overlayOpacity: OVERLAY_OPACITY,
      nextBtnText: t("guideNext"),
      prevBtnText: t("guideBack"),
      doneBtnText: t("guideDone"),
      closeBtnLabel: t("guideClose"),
      progressText: toDriverProgress(t("guideProgress")),
      onHighlighted: () => {
        const active = tour?.getActiveIndex();
        if (typeof active !== "number") return;
        stepRef.current = active;
        writeGuideProgress(userId, lessonId, active);
      },
      onDestroyed: () => {
        if (rebuilding.current) return;
        stopGuide();
      },
    });

    openLessonScreen(lesson, index, openScreenRef.current);
    tour.drive(index);
    window.addEventListener("keydown", swallowTourKeys, true);

    return () => {
      window.removeEventListener("keydown", swallowTourKeys, true);
      const active = tour?.getActiveIndex();
      if (typeof active === "number") stepRef.current = active;
      rebuilding.current = true;
      tour?.destroy();
      rebuilding.current = false;
    };
  }, [lessonId, locale, userId]);

  return null;
}
