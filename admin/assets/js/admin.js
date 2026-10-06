const ICON_NO_IMAGE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15l-5-5L5 21"/><circle cx="9" cy="9" r="2"/><path d="M3 3l18 18"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';
const ICON_GRIP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>';
const ICON_PENCIL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICON_TRASH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';

const MAX_IMAGE_MB = 50;

let catalog = null;
let dragSectionIndex = null;
let dragProduct = null; // { sectionId, index }
let openFormFor = null; // { sectionId, product|null }

const sectionsListEl = document.getElementById("sections-list");
const saveFlagEl = document.getElementById("save-flag");
const formTemplate = document.getElementById("tpl-product-form");
const variantRowTemplate = document.getElementById("tpl-variant-row");

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

// Crea un <img> de forma segura: nunca interpola src como HTML (evita XSS almacenado).
function elImg(src) {
  const img = document.createElement("img");
  img.src = src;
  return img;
}

// Reemplaza el contenido de un contenedor por una miniatura segura (imagen o ícono de respaldo).
function pintarMiniatura(container, imageUrl) {
  container.innerHTML = "";
  if (imageUrl) {
    container.appendChild(elImg(imageUrl));
  } else {
    container.innerHTML = ICON_NO_IMAGE;
  }
}

function clp(v) {
  return "$" + Number(v || 0).toLocaleString("es-CL");
}

function flashSaved(text) {
  saveFlagEl.textContent = text;
  setTimeout(() => {
    if (saveFlagEl.textContent === text) saveFlagEl.textContent = "";
  }, 1800);
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, { ...options, credentials: "same-origin" });
  if (res.status === 401) {
    window.location.href = "./login";
    throw new Error("No autorizado");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Ocurrió un error.");
  return data;
}

/* ------------------------------ Carga inicial ------------------------------ */

async function verificarSesion() {
  const res = await fetch("/api/auth/status", { credentials: "same-origin" });
  const data = await res.json();
  if (!data.authenticated) {
    window.location.href = "./login";
    return false;
  }
  return true;
}

async function cargarCatalogo() {
  saveFlagEl.textContent = "Cargando…";
  catalog = await apiFetch("/api/catalog");
  saveFlagEl.textContent = "";
  pintarMeta();
  pintarSecciones();
}

function pintarMeta() {
  document.getElementById("business-name").value = catalog.businessName || "";
  document.getElementById("tagline").value = catalog.tagline || "";
  document.getElementById("footer-note").value = catalog.footerNote || "";
  document.getElementById("contact").value = catalog.contact || "";

  const img = document.getElementById("logo-img");
  const fallback = document.getElementById("logo-fallback");
  if (catalog.logo) {
    img.src = catalog.logo;
    img.hidden = false;
    fallback.style.display = "none";
  } else {
    img.hidden = true;
    fallback.style.display = "block";
    fallback.textContent = (catalog.businessName || "K")[0];
  }
}

/* ------------------------------ Info del negocio ------------------------------ */

document.getElementById("save-meta-btn").addEventListener("click", async () => {
  try {
    catalog = await apiFetch("/api/catalog/meta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: document.getElementById("business-name").value,
        tagline: document.getElementById("tagline").value,
        footerNote: document.getElementById("footer-note").value,
        contact: document.getElementById("contact").value,
      }),
    });
    flashSaved("Guardado ✓");
    pintarMeta();
  } catch (e) {
    alert(e.message);
  }
});

const logoInput = document.getElementById("logo-input");
document.getElementById("logo-btn").addEventListener("click", () => logoInput.click());
logoInput.addEventListener("change", async () => {
  const file = logoInput.files[0];
  if (!file) return;
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
    alert(`La imagen supera los ${MAX_IMAGE_MB} MB. Prueba con una más liviana.`);
    return;
  }
  const formData = new FormData();
  formData.append("logo", file);
  try {
    saveFlagEl.textContent = "Guardando…";
    catalog = await apiFetch("/api/catalog/logo", { method: "PUT", body: formData });
    pintarMeta();
    flashSaved("Guardado ✓");
  } catch (e) {
    alert(e.message);
    saveFlagEl.textContent = "";
  }
  logoInput.value = "";
});

/* ------------------------------ Secciones ------------------------------ */

document.getElementById("add-section-btn").addEventListener("click", agregarSeccion);
document.getElementById("new-section-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") agregarSeccion();
});

async function agregarSeccion() {
  const input = document.getElementById("new-section-name");
  const name = input.value.trim();
  if (!name) return;
  try {
    catalog = await apiFetch("/api/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    input.value = "";
    pintarSecciones();
    flashSaved("Guardado ✓");
  } catch (e) {
    alert(e.message);
  }
}

async function renombrarSeccion(id, name) {
  try {
    catalog = await apiFetch(`/api/sections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    pintarSecciones();
    flashSaved("Guardado ✓");
  } catch (e) {
    alert(e.message);
  }
}

async function eliminarSeccion(id) {
  try {
    catalog = await apiFetch(`/api/sections/${id}`, { method: "DELETE" });
    pintarSecciones();
    flashSaved("Guardado ✓");
  } catch (e) {
    alert(e.message);
  }
}

async function reordenarSecciones(order) {
  try {
    catalog = await apiFetch("/api/sections/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
    flashSaved("Guardado ✓");
  } catch (e) {
    alert(e.message);
    pintarSecciones();
  }
}

/* ------------------------------ Productos ------------------------------ */

async function eliminarProducto(id) {
  try {
    catalog = await apiFetch(`/api/products/${id}`, { method: "DELETE" });
    pintarSecciones();
    flashSaved("Guardado ✓");
  } catch (e) {
    alert(e.message);
  }
}

async function reordenarProductos(sectionId, order) {
  try {
    catalog = await apiFetch(`/api/sections/${sectionId}/products/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
    flashSaved("Guardado ✓");
  } catch (e) {
    alert(e.message);
    pintarSecciones();
  }
}

async function guardarProducto(sectionId, product, formData, existingId) {
  formData.append("name", product.name);
  formData.append("weight", product.weight);
  formData.append("price", product.price);
  formData.append("wholesalePrice", product.wholesalePrice ?? "");
  formData.append("variants", JSON.stringify(product.variants || []));
  if (existingId) formData.append("sectionId", sectionId);

  const url = existingId ? `/api/products/${existingId}` : `/api/sections/${sectionId}/products`;
  const method = existingId ? "PATCH" : "POST";
  catalog = await apiFetch(url, { method, body: formData });
}

/* ------------------------------ Render ------------------------------ */

function pintarSecciones() {
  sectionsListEl.innerHTML = "";

  if (catalog.sections.length === 0) {
    sectionsListEl.appendChild(el("p", { class: "empty-note" }, "Todavía no hay secciones. Crea la primera arriba."));
    return;
  }

  catalog.sections.forEach((section, sIdx) => {
    sectionsListEl.appendChild(renderSectionCard(section, sIdx));
  });
}

function renderSectionCard(section, sIdx) {
  const card = el("div", { class: "section-card", draggable: "true" });

  card.addEventListener("dragstart", () => { dragSectionIndex = sIdx; });
  card.addEventListener("dragover", (e) => { e.preventDefault(); card.classList.add("drag-over"); });
  card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    card.classList.remove("drag-over");
    if (dragSectionIndex === null || dragSectionIndex === sIdx) return;
    const order = catalog.sections.map((s) => s.id);
    const [moved] = order.splice(dragSectionIndex, 1);
    order.splice(sIdx, 0, moved);
    dragSectionIndex = null;
    reordenarSecciones(order);
  });

  const header = el("div", { class: "section-card__header" });
  header.appendChild(el("span", { class: "drag-handle" }, trustedHtml(ICON_GRIP)));

  const nameSpan = el("span", { class: "section-card__name" }, section.name);
  header.appendChild(nameSpan);

  const editBtn = el("button", { type: "button", title: "Editar nombre" }, trustedHtml(ICON_PENCIL));
  editBtn.addEventListener("click", () => {
    const input = el("input", { type: "text", value: section.name });
    input.value = section.name;
    nameSpan.replaceWith(input);
    input.focus();
    const confirmar = () => renombrarSeccion(section.id, input.value.trim() || section.name);
    input.addEventListener("keydown", (e) => e.key === "Enter" && confirmar());
    input.addEventListener("blur", confirmar);
  });
  header.appendChild(editBtn);

  const deleteWrap = el("span");
  const deleteBtn = el("button", { type: "button", title: "Eliminar sección" }, trustedHtml(ICON_TRASH));
  deleteBtn.addEventListener("click", () => {
    deleteWrap.innerHTML = "";
    const confirmBox = el("span", { class: "confirm-inline" });
    confirmBox.appendChild(el("span", {}, "¿Eliminar?"));
    const yesBtn = el("button", { style: "background:#d97d4d;color:#fff;" }, "Sí");
    const noBtn = el("button", { style: "background:#fff;color:#0b3d2c;" }, "No");
    yesBtn.addEventListener("click", () => eliminarSeccion(section.id));
    noBtn.addEventListener("click", () => pintarSecciones());
    confirmBox.appendChild(yesBtn);
    confirmBox.appendChild(noBtn);
    deleteWrap.appendChild(confirmBox);
  });
  deleteWrap.appendChild(deleteBtn);
  header.appendChild(deleteWrap);

  card.appendChild(header);

  const body = el("div", { class: "section-card__body" });
  const productsList = el("div", { class: "products-list" });

  if (section.products.length === 0) {
    productsList.appendChild(el("p", { class: "empty-note" }, "Sin productos todavía."));
  } else {
    section.products.forEach((p, pIdx) => {
      productsList.appendChild(renderProductRow(section, p, pIdx));
    });
  }
  body.appendChild(productsList);

  if (openFormFor && openFormFor.sectionId === section.id) {
    body.appendChild(renderProductForm(section));
  } else {
    const addBtn = el("button", { type: "button", class: "btn btn--olive add-product-btn" }, "+ Agregar producto");
    addBtn.addEventListener("click", () => {
      openFormFor = { sectionId: section.id, product: null };
      pintarSecciones();
    });
    body.appendChild(addBtn);
  }

  card.appendChild(body);
  return card;
}

function renderProductRow(section, product, pIdx) {
  const row = el("div", { class: "product-row", draggable: "true" });

  row.addEventListener("dragstart", () => { dragProduct = { sectionId: section.id, index: pIdx }; });
  row.addEventListener("dragover", (e) => { e.preventDefault(); row.classList.add("drag-over"); });
  row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    row.classList.remove("drag-over");
    if (!dragProduct || dragProduct.sectionId !== section.id || dragProduct.index === pIdx) return;
    const order = section.products.map((p) => p.id);
    const [moved] = order.splice(dragProduct.index, 1);
    order.splice(pIdx, 0, moved);
    dragProduct = null;
    reordenarProductos(section.id, order);
  });

  row.appendChild(el("span", { class: "drag-handle" }, trustedHtml(ICON_GRIP)));
  const thumb = el("div", { class: "product-row__thumb" });
  pintarMiniatura(thumb, product.image);
  row.appendChild(thumb);

  const info = el("div", { class: "product-row__info" });
  info.appendChild(el("p", { class: "product-row__name" }, product.name));
  let metaTexto = `${product.weight || ""} · ${clp(product.price)}` +
    (product.wholesalePrice ? ` · Mayorista: ${product.wholesalePrice}` : "");
  if (product.variants && product.variants.length > 0) {
    metaTexto += ` · ${product.variants.length} variante${product.variants.length > 1 ? "s" : ""}`;
  }
  info.appendChild(el("p", { class: "product-row__meta" }, metaTexto));
  row.appendChild(info);

  const editBtn = el("button", { type: "button", title: "Editar" }, trustedHtml(ICON_PENCIL));
  editBtn.addEventListener("click", () => {
    openFormFor = { sectionId: section.id, product };
    pintarSecciones();
  });
  row.appendChild(editBtn);

  const deleteWrap = el("span");
  const deleteBtn = el("button", { type: "button", title: "Eliminar" }, trustedHtml(ICON_TRASH));
  deleteBtn.addEventListener("click", () => {
    deleteWrap.innerHTML = "";
    const confirmBox = el("span", { class: "confirm-inline" });
    confirmBox.style.color = "#0b3d2c";
    confirmBox.appendChild(el("span", {}, "¿Eliminar?"));
    const yesBtn = el("button", { style: "background:#d97d4d;color:#fff;" }, "Sí");
    const noBtn = el("button", { style: "background:#fff;color:#0b3d2c;" }, "No");
    yesBtn.addEventListener("click", () => eliminarProducto(product.id));
    noBtn.addEventListener("click", () => pintarSecciones());
    confirmBox.appendChild(yesBtn);
    confirmBox.appendChild(noBtn);
    deleteWrap.appendChild(confirmBox);
  });
  deleteWrap.appendChild(deleteBtn);
  row.appendChild(deleteWrap);

  return row;
}

function renderProductForm(currentSection) {
  const fragment = formTemplate.content.cloneNode(true);
  const form = fragment.querySelector(".product-form");
  const product = openFormFor.product;

  const imagePreview = form.querySelector(".product-form__image-preview");
  const imageInput = form.querySelector(".pf-image-input");
  const uploadBtn = form.querySelector(".pf-upload-btn");
  const nameInput = form.querySelector(".pf-name");
  const weightInput = form.querySelector(".pf-weight");
  const priceInput = form.querySelector(".pf-price");
  const wholesalePriceInput = form.querySelector(".pf-wholesale-price");
  const sectionSelect = form.querySelector(".pf-section");
  const errorBox = form.querySelector(".pf-error");
  const cancelBtn = form.querySelector(".pf-cancel");
  const variantsList = form.querySelector(".pf-variants-list");
  const addVariantBtn = form.querySelector(".pf-add-variant");

  let selectedFile = null;
  pintarMiniatura(imagePreview, product?.image);
  nameInput.value = product?.name || "";
  weightInput.value = product?.weight || "";
  priceInput.value = product?.price ?? "";
  wholesalePriceInput.value = product?.wholesalePrice ?? "";

  catalog.sections.forEach((s) => {
    const opt = el("option", { value: s.id }, s.name);
    if (s.id === currentSection.id) opt.setAttribute("selected", "selected");
    sectionSelect.appendChild(opt);
  });

  function agregarFilaVariante(variant) {
    const fragment = variantRowTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".variant-row-form");
    row.querySelector(".vf-label").value = variant?.label || "";
    row.querySelector(".vf-price").value = variant?.price ?? "";
    row.querySelector(".vf-wholesale-price").value = variant?.wholesalePrice ?? "";
    row.querySelector(".vf-remove").addEventListener("click", () => row.remove());
    variantsList.appendChild(row);
  }

  (product?.variants || []).forEach(agregarFilaVariante);
  addVariantBtn.addEventListener("click", () => agregarFilaVariante());

  uploadBtn.addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      errorBox.textContent = `La imagen supera los ${MAX_IMAGE_MB} MB. Prueba con una más liviana.`;
      errorBox.hidden = false;
      return;
    }
    errorBox.hidden = true;
    selectedFile = file;
    imagePreview.innerHTML = "";
    imagePreview.appendChild(elImg(URL.createObjectURL(file)));
  });

  cancelBtn.addEventListener("click", () => {
    openFormFor = null;
    pintarSecciones();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    const name = nameInput.value.trim();
    const price = priceInput.value;
    const wholesalePrice = wholesalePriceInput.value.trim();
    if (!name) {
      errorBox.textContent = "El nombre es obligatorio.";
      errorBox.hidden = false;
      return;
    }
    if (price === "" || isNaN(Number(price)) || Number(price) < 0) {
      errorBox.textContent = "Ingresa un precio válido.";
      errorBox.hidden = false;
      return;
    }

    const variants = [];
    for (const row of variantsList.querySelectorAll(".variant-row-form")) {
      const label = row.querySelector(".vf-label").value.trim();
      const vPrice = row.querySelector(".vf-price").value;
      const vWholesalePrice = row.querySelector(".vf-wholesale-price").value.trim();
      if (!label && vPrice === "") continue; // fila vacía, se ignora
      if (!label) {
        errorBox.textContent = "Cada variante necesita un nombre o formato.";
        errorBox.hidden = false;
        return;
      }
      if (vPrice === "" || isNaN(Number(vPrice)) || Number(vPrice) < 0) {
        errorBox.textContent = `Ingresa un precio válido para la variante "${label}".`;
        errorBox.hidden = false;
        return;
      }
      variants.push({ label, price: vPrice, wholesalePrice: vWholesalePrice });
    }

    const formData = new FormData();
    if (selectedFile) formData.append("image", selectedFile);

    try {
      await guardarProducto(
        sectionSelect.value,
        { name, weight: weightInput.value.trim(), price, wholesalePrice, variants },
        formData,
        product?.id
      );
      openFormFor = null;
      pintarSecciones();
      flashSaved("Guardado ✓");
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    }
  });

  return form;
}

/* ------------------------------ Sesión ------------------------------ */

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  window.location.href = "./login";
});

/* ------------------------------ Arranque ------------------------------ */

(async function init() {
  const ok = await verificarSesion();
  if (!ok) return;
  try {
    await cargarCatalogo();
  } catch (e) {
    sectionsListEl.innerHTML = "";
    sectionsListEl.appendChild(el("p", { class: "empty-note" }, "No se pudo cargar el catálogo."));
  }
})();
