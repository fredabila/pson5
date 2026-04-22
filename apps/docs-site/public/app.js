import { site } from "./site-data.js";

const state = {
  query: "",
  slug: location.hash.replace(/^#\//u, "") || "introduction/overview"
};

const pageTitle = document.querySelector("#page-title");
const pageContent = document.querySelector("#page-content");
const pageToc = document.querySelector("#page-toc");
const sidebarNav = document.querySelector("#sidebar-nav");
const pager = document.querySelector("#pager");
const searchInput = document.querySelector("#search-input");

const allPages = site.sections.flatMap((section) =>
  section.pages.map((page) => ({ ...page, section: section.title }))
);

function renderSidebar() {
  const query = state.query.trim().toLowerCase();
  const html = site.sections
    .map((section) => {
      const visiblePages = section.pages.filter((page) => {
        if (!query) return true;
        return `${page.title} ${page.summary} ${section.title}`.toLowerCase().includes(query);
      });

      if (!visiblePages.length) {
        return "";
      }

      return `
        <div class="nav-group">
          <div class="nav-group-title">${section.title}</div>
          ${visiblePages
            .map(
              (page) => `
                <a class="nav-link ${page.slug === state.slug ? "active" : ""}" href="#/${page.slug}">
                  ${page.title}
                </a>
              `
            )
            .join("")}
        </div>
      `;
    })
    .join("");

  sidebarNav.innerHTML = html;
}

function buildToc() {
  const headings = [...pageContent.querySelectorAll("h2, h3")];
  pageToc.innerHTML = headings
    .map((heading) => `<a href="#${heading.id}">${heading.textContent}</a>`)
    .join("");
}

function buildPager(currentIndex) {
  const previous = allPages[currentIndex - 1];
  const next = allPages[currentIndex + 1];

  pager.innerHTML = `
    ${previous ? `<a href="#/${previous.slug}"><small>Previous</small><strong>${previous.title}</strong></a>` : "<span></span>"}
    ${next ? `<a href="#/${next.slug}"><small>Next</small><strong>${next.title}</strong></a>` : "<span></span>"}
  `;
}

function renderPage() {
  const page = allPages.find((entry) => entry.slug === state.slug) ?? allPages[0];
  const currentIndex = allPages.findIndex((entry) => entry.slug === page.slug);

  if (page.slug !== state.slug) {
    state.slug = page.slug;
    location.hash = `/${page.slug}`;
    return;
  }

  document.title = `${page.title} | PSON5 Docs`;
  pageTitle.textContent = page.title;
  pageContent.innerHTML = `
    <p class="eyebrow">${page.section}</p>
    <p>${page.summary}</p>
    ${page.content}
  `;

  renderSidebar();
  buildToc();
  buildPager(currentIndex);
}

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderSidebar();
});

window.addEventListener("hashchange", () => {
  state.slug = location.hash.replace(/^#\//u, "") || "introduction/overview";
  renderPage();
});

renderPage();
