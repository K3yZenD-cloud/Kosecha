const ICON_LEAF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 4 13c0-4 4-8 11-9 0 7-3 11-9 11 0 2 2 5 5 5"/></svg>';
const ICON_CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
const ICON_NO_IMAGE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15l-5-5L5 21"/><circle cx="9" cy="9" r="2"/><path d="M3 3l18 18"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';

const clp = (value) =>
  "$" + Number(value || 0).toLocaleString("es-CL");

function normalizar(texto) {
  return (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function el(tag, attrs = {}, content) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (content !== undefined) {
    // Solo los bloques marcados con trustedHtml() (iconos constantes) se insertan como HTML.
    if (content && typeof content === "object" && "__html" in content) {
      node.innerHTML = content.__html;
    } else {
      node.textContent = content;
    }
  }
  return node;
}

// Marca una cadena como HTML de confianza (uso exclusivo para íconos SVG constantes, nunca con datos del usuario).
function trustedHtml(html) {
  return { __html: html };
}

// Crea un <img> de forma segura: nunca interpola src/alt como HTML (evita XSS almacenado).
function elImg(src, alt) {
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt || "";
  return img;
}

function renderPriceTags(item) {
  const wrap = el("div", { class: "product-card__price" });
  wrap.appendChild(el("span", { class: "price-tag" }, `Detalle: ${clp(item.price)}`));
  if (item.wholesalePrice) {
    wrap.appendChild(
      el("span", { class: "price-tag price-tag--wholesale" }, `Mayorista: ${clp(item.wholesalePrice)}`)
    );
  }
  return wrap;
}

function renderProductCard(product) {
  const hasImage = Boolean(product.image);
  const card = el("div", {
    class: `product-card${hasImage ? "" : " product-card--compact"}`,
    tabindex: "0",
    role: "button",
    "aria-haspopup": "dialog",
  });
  card.dataset.search = normalizar(product.name);

  if (hasImage) {
    const imageWrap = el("div", { class: "product-card__image" });
    imageWrap.appendChild(elImg(product.image, product.name));
    card.appendChild(imageWrap);
  }

  const body = el("div", { class: "product-card__body" });
  if (hasImage) {
    body.appendChild(el("h3", { class: "product-card__name" }, product.name));
  } else {
    const nameRow = el("div", { class: "product-card__name-row" });
    nameRow.appendChild(el("span", { class: "product-card__leaf" }, trustedHtml(ICON_LEAF)));
    nameRow.appendChild(el("h3", { class: "product-card__name" }, product.name));
    body.appendChild(nameRow);
  }
  body.appendChild(el("p", { class: "product-card__weight" }, product.weight || ""));
  body.appendChild(renderPriceTags(product));
  if (product.variants && product.variants.length > 0) {
    body.appendChild(
      el(
        "p",
        { class: "product-card__variants-hint" },
        `${product.variants.length} variante${product.variants.length > 1 ? "s" : ""} disponible${
          product.variants.length > 1 ? "s" : ""
        } · Ver más`
      )
    );
  }

  card.appendChild(body);
  card.addEventListener("click", () => abrirModalProducto(product));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      abrirModalProducto(product);
    }
  });
  return card;
}

/* ------------------------------ Modal de producto ------------------------------ */

function crearModalProducto() {
  const overlay = el("div", { class: "product-modal-overlay" });
  overlay.hidden = true;
  const dialog = el("div", { class: "product-modal", role: "dialog", "aria-modal": "true" });
  const closeBtn = el(
    "button",
    { class: "product-modal__close", type: "button", "aria-label": "Cerrar" },
    "\u00d7"
  );
  const content = el("div", { class: "product-modal__content" });
  dialog.appendChild(closeBtn);
  dialog.appendChild(content);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function cerrar() {
    overlay.classList.remove("open");
    overlay.hidden = true;
  }

  closeBtn.addEventListener("click", cerrar);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cerrar();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrar();
  });

  return { overlay, content, cerrar };
}

const productModal = crearModalProducto();

function abrirModalProducto(product) {
  const { content } = productModal;
  content.innerHTML = "";

  const modalImageWrap = el("div", { class: "product-modal__image" });
  if (product.image) {
    modalImageWrap.appendChild(elImg(product.image, product.name));
  } else {
    modalImageWrap.innerHTML = ICON_NO_IMAGE;
  }
  content.appendChild(modalImageWrap);

  const details = el("div", { class: "product-modal__details" });
  details.appendChild(el("h3", { class: "product-modal__name" }, product.name));
  if (product.weight) {
    details.appendChild(el("p", { class: "product-modal__weight" }, product.weight));
  }
  details.appendChild(renderPriceTags(product));

  if (product.variants && product.variants.length > 0) {
    details.appendChild(el("p", { class: "product-modal__variants-title" }, "Variantes disponibles"));
    const variantsBox = el("div", { class: "product-card__variants" });
    product.variants.forEach((variant) => {
      const row = el("div", { class: "variant-row" });
      row.appendChild(el("span", { class: "variant-row__label" }, variant.label));
      row.appendChild(renderPriceTags(variant));
      variantsBox.appendChild(row);
    });
    details.appendChild(variantsBox);
  }
  content.appendChild(details);

  productModal.overlay.hidden = false;
  requestAnimationFrame(() => productModal.overlay.classList.add("open"));
}

function renderSection(section, idx) {
  const isFirst = idx === 0;
  const wrap = el("div", { class: "section", id: `sec-${idx}` });

  const toggle = el("button", { class: "section__toggle", type: "button" });
  const titleGroup = el("div", { class: "section__title-group" });
  titleGroup.appendChild(el("span", { class: "section__badge" }, trustedHtml(ICON_LEAF)));
  titleGroup.appendChild(el("span", { class: "section__name" }, section.name));
  titleGroup.appendChild(
    el("span", { class: "section__count" }, `${section.products.length} productos`)
  );
  toggle.appendChild(titleGroup);
  toggle.appendChild(el("span", { class: "section__chevron" }, trustedHtml(ICON_CHEVRON)));

  const body = el("div", { class: "section__body" });
  const bodyInner = el("div", { class: "section__body-inner" });
  if (section.products.length === 0) {
    bodyInner.appendChild(el("p", { class: "empty-note" }, "Todavía no hay productos en esta sección."));
  } else {
    const grid = el("div", { class: "product-grid" });
    section.products.forEach((p) => grid.appendChild(renderProductCard(p)));
    bodyInner.appendChild(grid);
  }
  body.appendChild(bodyInner);

  toggle.addEventListener("click", () => {
    const open = body.classList.toggle("open");
    toggle.querySelector(".section__chevron").classList.toggle("open", open);
  });

  if (isFirst) {
    body.classList.add("open");
  }

  wrap.appendChild(toggle);
  wrap.appendChild(body);
  return wrap;
}

/* ------------------------------ Indice de escritorio (scrollspy) ------------------------------ */

function abrirSeccion(sectionEl) {
  const body = sectionEl.querySelector(".section__body");
  const chevron = sectionEl.querySelector(".section__chevron");
  if (body && !body.classList.contains("open")) {
    body.classList.add("open");
    chevron && chevron.classList.add("open");
  }
}

function renderCatalogNav(sections) {
  const nav = document.getElementById("catalog-nav");
  nav.innerHTML = "";
  sections.forEach((section, idx) => {
    const item = el("a", { class: "catalog-nav__item", href: `#sec-${idx}` }, section.name);
    if (idx === 0) item.classList.add("is-active");
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const target = document.getElementById(`sec-${idx}`);
      if (!target) return;
      abrirSeccion(target);
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nav.appendChild(item);
  });
  return nav;
}

function activarScrollspy(nav) {
  const items = Array.from(nav.querySelectorAll(".catalog-nav__item"));
  const sections = document.querySelectorAll(".section");
  if (!items.length || !sections.length) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const idx = entry.target.id.replace("sec-", "");
        items.forEach((item) => item.classList.remove("is-active"));
        const active = nav.querySelector(`.catalog-nav__item[href="#sec-${idx}"]`);
        if (active) active.classList.add("is-active");
      });
    },
    { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
  );
  sections.forEach((s) => observer.observe(s));
}

/* ------------------------------ Buscador en vivo ------------------------------ */

function configurarBusqueda() {
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear");
  const container = document.getElementById("catalog");
  const nav = document.getElementById("catalog-nav");

  const emptyMsg = el(
    "p",
    { class: "loading loading--empty search-empty", hidden: "" },
    "Sin resultados."
  );
  container.appendChild(emptyMsg);

  function aplicarFiltro(valorCrudo) {
    const query = normalizar(valorCrudo.trim());
    clearBtn.hidden = query === "";

    let totalVisible = 0;
    document.querySelectorAll(".section").forEach((seccionEl) => {
      const idx = seccionEl.id.replace("sec-", "");
      const navItem = nav.querySelector(`.catalog-nav__item[href="#sec-${idx}"]`);
      const body = seccionEl.querySelector(".section__body");
      const chevron = seccionEl.querySelector(".section__chevron");
      const tarjetas = Array.from(seccionEl.querySelectorAll(".product-card"));

      if (query === "") {
        seccionEl.hidden = false;
        if (navItem) navItem.hidden = false;
        tarjetas.forEach((card) => (card.hidden = false));
        if (idx !== "0") {
          body.classList.remove("open");
          chevron && chevron.classList.remove("open");
        }
        return;
      }

      let visiblesEnSeccion = 0;
      tarjetas.forEach((card) => {
        const coincide = card.dataset.search.includes(query);
        card.hidden = !coincide;
        if (coincide) visiblesEnSeccion += 1;
      });

      const seccionTieneResultados = visiblesEnSeccion > 0;
      seccionEl.hidden = !seccionTieneResultados;
      if (navItem) navItem.hidden = !seccionTieneResultados;
      if (seccionTieneResultados) {
        body.classList.add("open");
        chevron && chevron.classList.add("open");
        totalVisible += visiblesEnSeccion;
      }
    });

    emptyMsg.hidden = query === "" || totalVisible > 0;
  }

  input.addEventListener("input", () => aplicarFiltro(input.value));
  clearBtn.addEventListener("click", () => {
    input.value = "";
    input.focus();
    aplicarFiltro("");
  });
}

/* ------------------------------ Boton volver arriba ------------------------------ */

function configurarVolverArriba() {
  const btn = document.getElementById("back-to-top");
  window.addEventListener(
    "scroll",
    () => {
      btn.hidden = window.scrollY < 480;
    },
    { passive: true }
  );
  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

async function cargarCatalogo() {
  const container = document.getElementById("catalog");
  try {
    const res = await fetch("/api/catalog");
    if (!res.ok) throw new Error("No se pudo obtener el catálogo");
    const data = await res.json();

    document.title = `${data.businessName || "Kosecha"} · Catálogo`;
    document.getElementById("business-name").textContent = data.businessName || "Kosecha";
    document.getElementById("tagline").textContent = data.tagline || "";
    document.getElementById("footer-business-name").textContent = data.businessName || "Kosecha";
    document.getElementById("footer-note").textContent = data.footerNote || "";
    document.getElementById("footer-contact").textContent = data.contact || "";

    if (data.logo) {
      const img = document.getElementById("logo-img");
      img.src = data.logo;
      img.hidden = false;
      document.getElementById("logo-fallback").style.display = "none";
    } else {
      document.getElementById("logo-fallback").textContent = (data.businessName || "K")[0];
    }

    container.innerHTML = "";
    if (!data.sections || data.sections.length === 0) {
      container.appendChild(
        el("p", { class: "loading loading--empty" }, "Todavía no hay secciones publicadas en el catálogo.")
      );
      return;
    }

    const totalProductos = data.sections.reduce((acc, s) => acc + s.products.length, 0);
    document.getElementById("catalog-summary").textContent =
      `${totalProductos} productos en ${data.sections.length} categorías`;

    const nav = renderCatalogNav(data.sections);
    data.sections.forEach((section, idx) => {
      container.appendChild(renderSection(section, idx));
    });
    activarScrollspy(nav);
    configurarBusqueda();
  } catch (e) {
    container.innerHTML = "";
    container.appendChild(
      el("p", { class: "loading loading--error" }, "No se pudo cargar el catálogo. Intenta recargar la página.")
    );
  }
}

cargarCatalogo();
configurarVolverArriba();
