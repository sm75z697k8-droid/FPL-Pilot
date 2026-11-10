/* FPLPilot / Squad Intelligence — lightweight section navigation.
   Native anchor links remain functional if JavaScript is unavailable. */
(() => {
  "use strict";

  const SECTION_IDS = [
    "squad-team-summary",
    "squad-starting-section",
    "squad-bench-section"
  ];

  function activeSectionAt(positions, threshold) {
    if (!positions.length) return null;
    let current = positions[0].id;
    for (const section of positions) {
      if (section.top <= threshold) current = section.id;
    }
    return current;
  }

  function initSquadNavigation() {
    const nav = document.getElementById("squad-quick-nav");
    const data = document.getElementById("squad-data");
    if (!nav || !data) return;

    const sections = SECTION_IDS.map(id => document.getElementById(id));
    const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
    if (sections.some(section => !section) || links.length !== sections.length) return;

    let scheduled = false;
    function update() {
      scheduled = false;
      if (data.hidden) return;
      const threshold = nav.getBoundingClientRect().bottom + 12;
      const active = activeSectionAt(
        sections.map(section => ({
          id: section.id,
          top: section.getBoundingClientRect().top
        })),
        threshold
      );
      for (const link of links) {
        if (link.getAttribute("href") === `#${active}`) {
          if (link.getAttribute("aria-current") !== "location") {
            link.setAttribute("aria-current", "location");
          }
        } else if (link.hasAttribute("aria-current")) {
          link.removeAttribute("aria-current");
        }
      }
    }

    function scheduleUpdate() {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(update);
    }

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    // The squad appears only after a verified API response. Update the
    // section highlight when it becomes visible; no data/API changes needed.
    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(scheduleUpdate);
      observer.observe(data, { attributes: true, attributeFilter: ["hidden"] });
    }
    scheduleUpdate();
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { activeSectionAt, initSquadNavigation };
  }
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", initSquadNavigation);
  }
})();
