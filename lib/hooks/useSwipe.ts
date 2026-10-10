import { useEffect, useRef, useState } from "react";
import { PanResponder } from "react-native";

/**
 * Horizontal swipe between tabs. Returns `panHandlers` to spread on a View.
 * `onSwipe("left")` means the finger moved left (go to the next tab), `"right"` the previous one.
 *
 * It only claims a drag that is clearly sideways, so vertical scrolling and paging keep working, and
 * it uses the bubbling phase so a child that scrolls sideways (a photo carousel) gets the gesture first.
 */
export function useSwipe(onSwipe: (direction: "left" | "right") => void) {
  const latest = useRef(onSwipe);
  useEffect(() => {
    latest.current = onSwipe;
  }, [onSwipe]);

  // the callbacks only run on touch events, never during render, so reading the ref there is safe
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_, g) => {
        const far = Math.abs(g.dx) > 60;
        const flick = Math.abs(g.dx) > 30 && Math.abs(g.vx) > 0.5;
        if (far || flick) latest.current(g.dx < 0 ? "left" : "right");
      },
    }),
  );
  return responder.panHandlers;
}
