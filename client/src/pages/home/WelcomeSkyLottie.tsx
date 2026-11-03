import { useEffect, useRef } from "react";
import { Lottie, type LottieHandle } from "lottie-react";

export function WelcomeSkyLottie({
  animationData,
  className,
}: {
  animationData: object;
  className?: string;
}) {
  const lottieRef = useRef<LottieHandle>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const api = lottieRef.current;
      if (!api) return;
      if (mq.matches) {
        api.pause();
        api.seek(0);
      } else {
        api.play();
      }
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <Lottie
      lottieRef={lottieRef}
      src={animationData}
      loop
      autoplay
      className={className}
      rendererSettings={{ preserveAspectRatio: "xMidYMax meet" }}
    />
  );
}
