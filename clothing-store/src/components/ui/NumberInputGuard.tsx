"use client";

import { useEffect } from "react";

export function NumberInputGuard() {
  useEffect(() => {
    const isNonNegativeNumberInput = (input: HTMLInputElement) => {
      if (input.type !== "number") {
        return false;
      }

      // Opt-out support for special cases that intentionally accept negatives.
      if (input.dataset.allowNegative === "true") {
        return false;
      }

      const minAttr = input.getAttribute("min");
      if (minAttr === null || minAttr.trim() === "") {
        return false;
      }

      const minValue = Number(minAttr);
      return Number.isFinite(minValue) && minValue >= 0;
    };

    const handleWheel = (event: WheelEvent) => {
      const active = document.activeElement;
      if (!(active instanceof HTMLInputElement)) {
        return;
      }

      if (active.type !== "number") {
        return;
      }

      // Prevent mouse-wheel from incrementing/decrementing number inputs unexpectedly.
      event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      if (!isNonNegativeNumberInput(target)) {
        return;
      }

      if (event.key === "-") {
        event.preventDefault();
      }
    };

    const handleBeforeInput = (event: InputEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      if (!isNonNegativeNumberInput(target)) {
        return;
      }

      if (event.data === "-") {
        event.preventDefault();
      }
    };

    document.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    });
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("beforeinput", handleBeforeInput, true);

    return () => {
      document.removeEventListener("wheel", handleWheel, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("beforeinput", handleBeforeInput, true);
    };
  }, []);

  return null;
}
