type ClipboardLike = {writeText: (text: string) => Promise<void>};
type CopyDocument = Pick<Document, "body" | "createElement" | "execCommand">;

export async function copyText(text: string, clipboard?: ClipboardLike, documentRef?: CopyDocument): Promise<boolean> {
  const targetClipboard = clipboard ?? (typeof navigator !== "undefined" ? navigator.clipboard : undefined);
  try {
    if (targetClipboard) {
      await targetClipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback for restricted clipboard contexts.
  }

  const targetDocument = documentRef ?? (typeof document !== "undefined" ? document : undefined);
  if (!targetDocument) return false;
  const textarea = targetDocument.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  targetDocument.body.appendChild(textarea);
  textarea.select();
  try {
    return targetDocument.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
