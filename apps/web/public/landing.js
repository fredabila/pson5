/**
 * Copy-to-clipboard behaviour for every element carrying [data-copy].
 * The button briefly flips to a "Copied" state via [data-copied] on
 * itself (or its nearest .install-card) so the CSS can light it up.
 */
function wireCopy() {
  const targets = document.querySelectorAll("[data-copy]");
  for (const el of targets) {
    el.addEventListener("click", async () => {
      const text = el.getAttribute("data-copy") ?? "";
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch {}
        document.body.removeChild(ta);
      }

      const host = el.closest(".install-card") ?? el;
      host.setAttribute("data-copied", "true");
      const label = host.querySelector("[data-copy-label]");
      const prior = label?.textContent;
      if (label) label.textContent = "Copied";
      setTimeout(() => {
        host.removeAttribute("data-copied");
        if (label && prior) label.textContent = prior;
      }, 1600);
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireCopy);
} else {
  wireCopy();
}
