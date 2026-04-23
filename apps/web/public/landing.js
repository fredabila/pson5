(() => {
  "use strict";

  // --- Tabbed code panels ------------------------------------------------
  const tabs = document.querySelectorAll(".code-tab");
  const panels = document.querySelectorAll(".code-panel");

  function activateTab(target) {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.tab === target;
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.tabIndex = isActive ? 0 : -1;
    });
    panels.forEach((panel) => {
      const isActive = panel.id === `panel-${target}`;
      if (isActive) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "");
      }
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.tab));
    tab.addEventListener("keydown", (event) => {
      const order = Array.from(tabs);
      const index = order.indexOf(tab);
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = order[(index + 1) % order.length];
        next.focus();
        activateTab(next.dataset.tab);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        const prev = order[(index - 1 + order.length) % order.length];
        prev.focus();
        activateTab(prev.dataset.tab);
      } else if (event.key === "Home") {
        event.preventDefault();
        order[0].focus();
        activateTab(order[0].dataset.tab);
      } else if (event.key === "End") {
        event.preventDefault();
        const last = order[order.length - 1];
        last.focus();
        activateTab(last.dataset.tab);
      }
    });
  });

  // --- Scroll reveal (progressive enhancement) ---------------------------
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reveals = document.querySelectorAll(".reveal");

  if (reducedMotion || typeof IntersectionObserver === "undefined") {
    reveals.forEach((el) => el.classList.add("is-visible"));
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
    );
    reveals.forEach((el) => observer.observe(el));
  }

  // --- Subtle parallax on hero stack when cursor moves over it -----------
  const heroVisual = document.querySelector(".hero__visual");
  if (heroVisual && !reducedMotion && window.matchMedia("(hover: hover)").matches) {
    const peeks = heroVisual.querySelectorAll(".peek");
    const rect = () => heroVisual.getBoundingClientRect();

    heroVisual.addEventListener("pointermove", (event) => {
      const box = rect();
      const cx = (event.clientX - box.left) / box.width - 0.5;
      const cy = (event.clientY - box.top) / box.height - 0.5;
      peeks.forEach((peek, index) => {
        const depth = (peeks.length - index) * 4;
        peek.style.translate = `${cx * depth}px ${cy * depth}px`;
      });
    });

    heroVisual.addEventListener("pointerleave", () => {
      peeks.forEach((peek) => {
        peek.style.translate = "";
      });
    });
  }
})();
