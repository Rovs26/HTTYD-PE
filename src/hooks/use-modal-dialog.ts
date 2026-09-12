"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

/**
 * Makes an overlay behave the way `aria-modal="true"` promises.
 *
 * Both overlays in this app announced themselves as modal and then behaved like ordinary
 * divs: focus stayed on the page behind them, Tab walked straight out, and Escape did
 * nothing. Claiming the role without the behaviour is worse than not claiming it, because a
 * screen-reader user is told they are somewhere they cannot actually be.
 *
 * Returns a ref to put on the dialog container.
 */
export function useModalDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Held in a ref so changing the handler identity does not re-run the effect and steal focus
  // back to the top of the dialog mid-interaction.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const container = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (element) => element.offsetParent !== null || element === document.activeElement
      );

    // Move focus in, so the next Tab starts inside the dialog rather than behind it.
    const first = focusable()[0];
    (first ?? container)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === firstItem || !container?.contains(active))) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Return focus to whatever opened the dialog, so the keyboard user is not dropped at
      // the top of the document.
      previouslyFocused?.focus?.();
    };
  }, [open]);

  return ref;
}
