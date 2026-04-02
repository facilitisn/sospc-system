import { useEffect } from "react";

function isTypingElement(target) {
  const tag = String(target?.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || Boolean(target?.isContentEditable);
}

export default function usePDVHotkeys({
  onFocusBarcode,
  onFocusSearch,
  onFocusPayment,
  onFinalize,
  onNewSale,
  onPrint,
  onClear,
  onRemoveLastItem,
  onWalkInClient,
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      const typing = isTypingElement(e.target);

      if (e.key === "F2") {
        e.preventDefault();
        onFocusBarcode?.();
        return;
      }

      if (e.key === "F3") {
        e.preventDefault();
        onFocusSearch?.();
        return;
      }

      if (e.key === "F4") {
        e.preventDefault();
        onFocusPayment?.();
        return;
      }

      if (e.key === "F6") {
        e.preventDefault();
        onFinalize?.();
        return;
      }

      if (e.key === "F7") {
        e.preventDefault();
        onWalkInClient?.();
        return;
      }

      if (e.key === "F8") {
        e.preventDefault();
        onNewSale?.();
        return;
      }

      if (e.key === "F9") {
        e.preventDefault();
        onPrint?.();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onClear?.();
        return;
      }

      if (!typing && e.key === "Delete") {
        e.preventDefault();
        onRemoveLastItem?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    onClear,
    onFinalize,
    onFocusBarcode,
    onFocusPayment,
    onFocusSearch,
    onNewSale,
    onPrint,
    onRemoveLastItem,
    onWalkInClient,
  ]);
}
