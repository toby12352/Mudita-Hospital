import { useEffect, useState, type CSSProperties } from "react";
import calmSunrise from "./assets/calm-sunrise.json";
import calmMoonrise from "./assets/calm-moonrise.json";
import { WelcomeSkyLottie } from "./WelcomeSkyLottie";

const MONTH_KEYS = [
  "homeMonthJan",
  "homeMonthFeb",
  "homeMonthMar",
  "homeMonthApr",
  "homeMonthMay",
  "homeMonthJun",
  "homeMonthJul",
  "homeMonthAug",
  "homeMonthSep",
  "homeMonthOct",
  "homeMonthNov",
  "homeMonthDec",
] as const;

const SUN_RISE = 5 * 60 + 30;
const SUN_PEAK = 12 * 60;
const SUN_SET = 18 * 60 + 45;
const MOON_RISE = 18 * 60 + 30;
const MOON_SET = 5 * 60 + 30;
const FADE_MIN = 30;

function greetingKey(hour: number): string {
  if (hour < 12) return "homeGreetingMorning";
  if (hour < 17) return "homeGreetingAfternoon";
  return "homeGreetingEvening";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatWelcomeClock(now: Date, t: (k: string) => string): string {
  const month = t(MONTH_KEYS[now.getMonth()]);
  const day = now.getDate();
  const year = now.getFullYear();
  const hours24 = now.getHours();
  const minutes = pad2(now.getMinutes());
  const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const ampm = hours24 < 12 ? t("homeClockAm") : t("homeClockPm");
  return `${month} ${day}, ${year} ${pad2(hour12)}:${minutes} ${ampm}`;
}

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function riseFall(m: number, start: number, peak: number, end: number): number {
  if (m < start || m > end) return 0;
  if (m <= peak) return clamp01((m - start) / (peak - start));
  return clamp01((end - m) / (end - peak));
}

function skyPhase(now: Date): {
  sunLift: number;
  sunOpacity: number;
  moonLift: number;
  moonOpacity: number;
} {
  const m = minutesOfDay(now);
  const sunLift = riseFall(m, SUN_RISE, SUN_PEAK, SUN_SET);

  let moonLift = 0;
  if (m >= MOON_RISE) {
    moonLift = clamp01((m - MOON_RISE) / (24 * 60 - MOON_RISE));
  } else if (m <= MOON_SET) {
    moonLift = clamp01(1 - m / MOON_SET);
  }

  let sunOpacity = 0;
  if (m >= SUN_RISE && m <= SUN_SET) {
    sunOpacity = Math.min(
      clamp01((m - SUN_RISE) / FADE_MIN),
      clamp01((SUN_SET - m) / FADE_MIN),
    );
  }

  let moonOpacity = 0;
  if (m >= MOON_RISE) {
    moonOpacity = clamp01((m - MOON_RISE) / FADE_MIN);
  } else if (m <= MOON_SET) {
    moonOpacity = clamp01((MOON_SET - m) / FADE_MIN);
  }

  return { sunLift, sunOpacity, moonLift, moonOpacity };
}

export function HomePage({
  displayName,
  t,
}: {
  displayName: string;
  t: (k: string) => string;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const greeting = t(greetingKey(now.getHours()));
  const line = t("homeWelcomeLine")
    .replace("{greeting}", greeting)
    .replace("{name}", displayName);
  const clock = formatWelcomeClock(now, t);
  const sky = skyPhase(now);

  const stageStyle = {
    "--sun-lift": String(sky.sunLift),
    "--sun-opacity": String(sky.sunOpacity),
    "--moon-lift": String(sky.moonLift),
    "--moon-opacity": String(sky.moonOpacity),
  } as CSSProperties;

  return (
    <section className="desk-welcome" aria-label={t("navHome")}>
      <div className="desk-welcome-stage" style={stageStyle}>
        <div className="desk-welcome-sky" aria-hidden="true">
          <div className="desk-welcome-orb desk-welcome-orb--sun">
            <WelcomeSkyLottie
              animationData={calmSunrise}
              className="desk-welcome-lottie"
            />
          </div>
          <div className="desk-welcome-orb desk-welcome-orb--moon">
            <WelcomeSkyLottie
              animationData={calmMoonrise}
              className="desk-welcome-lottie"
            />
          </div>
        </div>
        <h2 className="desk-welcome-greeting">{line}</h2>
      </div>
      <time className="desk-welcome-clock" dateTime={now.toISOString()}>
        {clock}
      </time>
    </section>
  );
}
