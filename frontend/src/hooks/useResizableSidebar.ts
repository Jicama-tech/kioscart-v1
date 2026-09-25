import { useCallback, useEffect, useRef, useState } from "react";

/**
 * True at Tailwind's `lg` and up — the exact width at which the sidebar stops
 * being a slide-over drawer and becomes a static, resizable column. Defined
 * here rather than reusing `useIsMobile` (768px) because that breakpoint is
 * the wrong one: between 768 and 1024 the sidebar is still a drawer.
 *
 * Seeded from matchMedia during the first render so the sidebar does not paint
 * at the wrong width and then snap.
 */
export function useIsLargeScreen(): boolean {
  const query = "(min-width: 1024px)";
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return true;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return matches;
}

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_DEFAULT_WIDTH = 256; // matches the old fixed `w-64`

/**
 * Drag the handle left of this and releasing closes the sidebar outright.
 * Deliberately well below SIDEBAR_MIN_WIDTH so it takes a decisive pull past
 * the point where the sidebar visibly stops shrinking — you cannot trip it by
 * nudging the edge to its narrowest.
 */
export const SIDEBAR_COLLAPSE_AT = 140;

/** Keyboard nudge per arrow press, and the larger Page/Home-style jump. */
const STEP = 16;

const clamp = (n: number) =>
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(n)));

/**
 * Drag-to-resize for a left sidebar, with the width remembered across reloads.
 *
 * Pointer events rather than mouse events, so a trackpad, a pen and a touch
 * drag all work from one code path, and `setPointerCapture` keeps the drag
 * alive when the cursor outruns the 4px handle — without it, a fast drag
 * "sticks" the moment the pointer leaves the strip.
 *
 * `dragging` is exposed so the sidebar can drop its width transition while a
 * drag is live; leaving a 300ms ease on means the edge lags behind the cursor.
 */
/** Keeps the tab clear of the container's very top and bottom edge. */
const TAB_EDGE_GAP = 8;

/**
 * Past this much pointer travel the gesture counts as a drag, not a click, and
 * the click that follows pointerup is swallowed. Without it, every reposition
 * would also re-open the sidebar — the tab is a button as well as a handle.
 */
const TAB_DRAG_SLOP = 4;

/** Arrow-key nudge for the tab, matching the resize handle's STEP. */
const TAB_STEP = 16;

/**
 * Vertical drag for the collapsed sidebar's re-open tab, remembered across
 * reloads.
 *
 * The tab is pinned to the left edge where the sidebar used to be, so at its
 * default height it can sit right on top of whatever heading the content
 * screen starts with. Letting it slide up and down means it can be parked
 * clear of the heading instead of the layout having to guess a safe offset.
 *
 * Bounds come from the offset parent at drag time rather than being stored,
 * because the container height changes with the viewport — a stored bound
 * would strand the tab off-screen after a resize.
 */
export function useDraggableTab(storageKey: string, defaultTop = 16) {
  const [top, setTopState] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(stored) && stored >= 0) return stored;
    } catch {
      // private mode / storage disabled — fall through to the default
    }
    return defaultTop;
  });
  const [dragging, setDragging] = useState(false);
  const elRef = useRef<HTMLElement | null>(null);
  const frame = useRef<number | null>(null);
  // Where the pointer and the tab were when this drag began, so the tab moves
  // with the cursor instead of snapping its top edge under it.
  const startRef = useRef({ pointerY: 0, top: 0 });
  // Read by the click handler to tell a reposition from a real click.
  const movedRef = useRef(false);

  const clampTo = useCallback((next: number, el: HTMLElement | null) => {
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return Math.max(TAB_EDGE_GAP, Math.round(next));
    const max = parent.clientHeight - el.offsetHeight - TAB_EDGE_GAP;
    return Math.min(Math.max(TAB_EDGE_GAP, max), Math.max(TAB_EDGE_GAP, Math.round(next)));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(top));
    } catch {
      // non-fatal: the position just won't survive a reload
    }
  }, [storageKey, top]);

  // A shorter viewport can leave a previously-valid position below the fold.
  useEffect(() => {
    const onResize = () => setTopState((t) => clampTo(t, elRef.current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampTo]);

  useEffect(() => {
    if (!dragging) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    elRef.current = el;
    el.setPointerCapture(e.pointerId);
    startRef.current = { pointerY: e.clientY, top };
    movedRef.current = false;
    setDragging(true);
  }, [top]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!dragging) return;
      const dy = e.clientY - startRef.current.pointerY;
      if (Math.abs(dy) > TAB_DRAG_SLOP) movedRef.current = true;
      const el = e.currentTarget;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setTopState(clampTo(startRef.current.top + dy, el));
      });
    },
    [dragging, clampTo],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    setDragging(false);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const delta =
        e.key === "ArrowUp" ? -TAB_STEP : e.key === "ArrowDown" ? TAB_STEP : 0;
      if (!delta) return;
      e.preventDefault();
      setTopState((t) => clampTo(t + delta, elRef.current));
    },
    [clampTo],
  );

  /**
   * Call first in the tab's onClick: true means the click closed out a drag
   * and the button's real action should be skipped.
   */
  const consumeDragClick = useCallback(() => {
    if (!movedRef.current) return false;
    movedRef.current = false;
    return true;
  }, []);

  return {
    top,
    dragging,
    consumeDragClick,
    /** Spread onto the tab element. */
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown,
    },
  };
}

export function useResizableSidebar(
  storageKey: string,
  /** Called on release when the drag ended past the close threshold. */
  onCollapse?: () => void,
) {
  const [width, setWidthState] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(stored) && stored > 0) return clamp(stored);
    } catch {
      // private mode / storage disabled — fall through to the default
    }
    return SIDEBAR_DEFAULT_WIDTH;
  });
  const [dragging, setDragging] = useState(false);
  // True mid-drag once the pointer is past the close threshold, so the sidebar
  // can telegraph "let go here and I close" before it actually happens.
  const [willCollapse, setWillCollapse] = useState(false);
  const frame = useRef<number | null>(null);
  // Read at pointerup. State would be stale there — the last rAF-coalesced
  // update may not have committed by the time the release fires.
  const willCollapseRef = useRef(false);
  const onCollapseRef = useRef(onCollapse);
  onCollapseRef.current = onCollapse;

  const setWidth = useCallback(
    (next: number) => setWidthState(clamp(next)),
    [],
  );

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      // non-fatal: the width just won't survive a reload
    }
  }, [storageKey, width]);

  // While dragging, keep the resize cursor and kill text selection everywhere —
  // otherwise the pointer flickers between cursors over the content and the
  // drag selects whatever text it crosses.
  useEffect(() => {
    if (!dragging) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    // Left button / primary contact only — a right-click on the handle should
    // not start a drag that can only be ended with another left click.
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!dragging) return;
      const x = e.clientX;
      // Coalesce to one update per frame: pointermove can fire well above
      // 60Hz on a high-poll mouse, and each one would otherwise re-render.
      const closing = x < SIDEBAR_COLLAPSE_AT;
      willCollapseRef.current = closing;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setWillCollapse(closing);
        // Below the threshold the width stops tracking the cursor and holds at
        // the minimum: the sidebar is about to close, so shrinking it further
        // would just animate the content out twice.
        if (!closing) setWidthState(clamp(x));
      });
    },
    [dragging],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    setDragging(false);
    if (willCollapseRef.current) {
      willCollapseRef.current = false;
      setWillCollapse(false);
      // `width` is deliberately left untouched, and is always a valid >= MIN
      // value, so re-opening restores the chosen width rather than the default.
      onCollapseRef.current?.();
    }
  }, []);

  /** Arrow keys resize; Home/End jump to the bounds. */
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    const map: Record<string, number | "min" | "max"> = {
      ArrowLeft: -STEP,
      ArrowRight: STEP,
      Home: "min",
      End: "max",
    };
    const action = map[e.key];
    if (action === undefined) return;
    e.preventDefault();
    setWidthState((w) =>
      action === "min"
        ? SIDEBAR_MIN_WIDTH
        : action === "max"
          ? SIDEBAR_MAX_WIDTH
          : clamp(w + action),
    );
  }, []);

  const reset = useCallback(() => setWidthState(SIDEBAR_DEFAULT_WIDTH), []);

  return {
    width,
    setWidth,
    dragging,
    willCollapse,
    reset,
    /** Spread onto the drag strip. */
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown,
      onDoubleClick: reset,
      role: "separator" as const,
      "aria-orientation": "vertical" as const,
      "aria-valuenow": width,
      "aria-valuemin": SIDEBAR_MIN_WIDTH,
      "aria-valuemax": SIDEBAR_MAX_WIDTH,
      tabIndex: 0,
    },
  };
}
