import { useEffect } from "react";

function normalizeKey(key = "") {
  const lower = String(key).toLowerCase();
  if (lower === " ") return "space";
  if (lower === "esc") return "escape";
  return lower;
}

function normalizeCombo(event) {
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push("primary");
  if (event.shiftKey) parts.push("shift");
  if (event.altKey) parts.push("alt");
  parts.push(normalizeKey(event.key));
  return parts.join("+");
}

function isEditableTarget(target) {
  const tag = String(target?.tagName || "").toLowerCase();
  return target?.isContentEditable || ["input", "textarea", "select"].includes(tag);
}

export default function usePageHotkeys(shortcuts = [], enabled = true) {
  useEffect(() => {
    if (!enabled || !Array.isArray(shortcuts) || shortcuts.length === 0) return undefined;

    function handleKeyDown(event) {
      const combo = normalizeCombo(event);
      const editable = isEditableTarget(event.target);

      const matched = shortcuts.find((shortcut) => {
        if (!shortcut?.combo || typeof shortcut.handler !== "function") return false;
        if (shortcut.combo !== combo) return false;
        if (editable && shortcut.allowInInput !== true) return false;
        return true;
      });

      if (!matched) return;

      if (matched.preventDefault !== false) {
        event.preventDefault();
      }

      matched.handler(event);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, shortcuts]);
}
