import type { PointerEvent as ReactPointerEvent } from "react";

// Drag-and-drop for touch screens (iPhone, iPad).
// Safari on iPhone does not support the regular HTML drag-and-drop that works with a mouse,
// so on touch screens the item is moved by following the finger instead.
//
// Every item that can be a drop target needs a `data-reorder-index` attribute with its position.
// An element with `data-reorder-tail` means "drop after the last item".

type Handlers = {
  /** The finger has moved far enough: the drag has started. */
  onStart: () => void;
  /** The place where the item would land has changed. */
  onOver: (index: number) => void;
  /** The finger was lifted over a valid place. */
  onDrop: (index: number) => void;
  /** The drag is over (always called last, also after onDrop). */
  onEnd: () => void;
};

const startDistancePx = 6;
const autoScrollEdgePx = 80;
const autoScrollStepPx = 10;

/** True when the device has a mouse or trackpad, so the regular drag-and-drop can be used. */
export function hasFinePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
}

export function startTouchReorder(event: ReactPointerEvent<HTMLElement>, handlers: Handlers): void {
  if (event.pointerType === "mouse") return;
  const pointerId = event.pointerId;
  const startX = event.clientX;
  const startY = event.clientY;
  let x = startX;
  let y = startY;
  let active = false;
  let index: number | null = null;
  let scrollTimer: number | null = null;

  function indexAt(pointX: number, pointY: number): number | null {
    const element = document.elementFromPoint(pointX, pointY)?.closest<HTMLElement>("[data-reorder-index]");
    if (!element) return null;
    const position = Number(element.dataset.reorderIndex);
    if (element.dataset.reorderTail !== undefined) return position;
    const bounds = element.getBoundingClientRect();
    return pointY > bounds.top + bounds.height / 2 ? position + 1 : position;
  }

  function update() {
    const next = indexAt(x, y);
    if (next !== null && next !== index) {
      index = next;
      handlers.onOver(next);
    }
  }

  // Scroll the page while the finger is held near the top or bottom edge of the screen.
  function autoScroll() {
    if (y < autoScrollEdgePx) window.scrollBy(0, -autoScrollStepPx);
    else if (y > window.innerHeight - autoScrollEdgePx) window.scrollBy(0, autoScrollStepPx);
    else return;
    update();
  }

  function onMove(moveEvent: PointerEvent) {
    if (moveEvent.pointerId !== pointerId) return;
    x = moveEvent.clientX;
    y = moveEvent.clientY;
    if (!active) {
      if (Math.hypot(x - startX, y - startY) < startDistancePx) return;
      active = true;
      handlers.onStart();
      scrollTimer = window.setInterval(autoScroll, 16);
    }
    moveEvent.preventDefault();
    update();
  }

  function finish(endEvent: PointerEvent, drop: boolean) {
    if (endEvent.pointerId !== pointerId) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    if (scrollTimer !== null) window.clearInterval(scrollTimer);
    if (!active) return;
    if (drop && index !== null) handlers.onDrop(index);
    handlers.onEnd();
  }

  const onUp = (upEvent: PointerEvent) => finish(upEvent, true);
  const onCancel = (cancelEvent: PointerEvent) => finish(cancelEvent, false);
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
}
