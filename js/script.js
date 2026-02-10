/* =========================
   PAS Logistics — UI Scripts
   ========================= */

const $ = (sel, parent = document) => parent.querySelector(sel);
const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));

/* Footer year */
$("#year").textContent = new Date().getFullYear();

/* Mobile nav toggle */
const nav = $("#nav");
const hamburger = $("#hamburger");

hamburger.addEventListener("click", () => {
  const open = nav.classList.toggle("isOpen");
  hamburger.setAttribute("aria-expanded", String(open));
});

$$('#nav a').forEach(a => {
  a.addEventListener("click", () => {
    nav.classList.remove("isOpen");
    hamburger.setAttribute("aria-expanded", "false");
  });
});

const quoteForm = $("#quoteForm");
if (quoteForm) {
  quoteForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type='submit']");
    const original = btn.textContent;
    btn.textContent = "Submitted ✓";
    btn.disabled = true;

    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
      e.target.reset();
      alert("Request submitted (demo). Connect this form to your backend/email/CRM.");
    }, 1200);
  });
}

/* Tracking demo */
const trackForm = $("#trackForm");
if (trackForm) trackForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = new FormData(e.target).get("tracking")?.toString().trim() || "";
  const out = $("#trackResult");

  if (!code) return;

  // Simple demo timeline
  const steps = [
    { s: "Received", d: "We received your tracking request." },
    { s: "Processing", d: "Shipment data matched in our system." },
    { s: "In Transit", d: "Cargo is moving through the next checkpoint." },
    { s: "ETA", d: "Estimated arrival based on current route & carrier updates." },
  ];

  const pick = Math.min(steps.length - 1, Math.floor(Math.random() * steps.length));
  const now = new Date().toLocaleString();

  out.innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start;">
      <div style="flex:1;min-width:240px;">
        <div style="font-weight:900;letter-spacing:.2px;">Tracking: ${escapeHtml(code)}</div>
        <div style="opacity:.8;margin-top:4px;">Last update: ${escapeHtml(now)}</div>
      </div>
      <div style="min-width:240px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);">
        <div style="font-weight:900;">Status: ${steps[pick].s}</div>
        <div style="opacity:.78;margin-top:4px;font-size:13px;">${steps[pick].d}</div>
      </div>
    </div>
  `;
});

/* Clients marquee: duplicate content for seamless scroll */
(function initMarquee(){
  const track = $("#clientTrack");
  if(!track) return;
  // Duplicate children once
  const items = Array.from(track.children);
  items.forEach(node => track.appendChild(node.cloneNode(true)));
})();

/* Gallery Lightbox */
const lightbox = $("#lightbox");
const lightboxImg = $("#lightboxImg");
const lightboxClose = $("#lightboxClose");

const galleryGrid = $("#galleryGrid");
if (galleryGrid) galleryGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".galleryItem");
  if (!btn) return;
  const src = btn.getAttribute("data-full");
  if (!src) return;

  lightboxImg.src = src;
  lightbox.classList.add("isOpen");
  lightbox.setAttribute("aria-hidden", "false");
});

function closeLightbox(){
  lightbox.classList.remove("isOpen");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImg.src = "";
}

lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && lightbox.classList.contains("isOpen")) closeLightbox();
});

/* Hero slider — TRUE crossfade (ultra smooth) */
const heroSlides = [
  {
    headline: "The Solution Of Global Logistic And Cargo Transport",
    accent: "The Solution",
    sub: "International freight forwarder with end-to-end visibility across air, sea, customs, and project cargo."
  },
  {
    headline: "Fast Air, Reliable Sea, Total Visibility.",
    accent: "Total Visibility",
    sub: "Carrier coordination, documentation, and tracking built for enterprise supply chains."
  },
  {
    headline: "Customs Expertise + Project Cargo Precision.",
    accent: "Project Cargo",
    sub: "Compliance-focused brokerage and heavy-lift logistics planning with operational discipline."
  }
];

const layerA = document.getElementById("heroLayerA");
const layerB = document.getElementById("heroLayerB");

let heroIndex = 0;
let useA = true;
let heroTimer = null;

function setLayerContent(layer, slide){
  if (!layer) return;
  const h1 = layer.querySelector("h1");
  const p  = layer.querySelector("p");

  h1.innerHTML = slide.headline.replace(
    slide.accent,
    `<span class="accent">${slide.accent}</span>`
  );
  p.textContent = slide.sub;
}

function showHeroSlide(nextIndex){
  if (!layerA || !layerB) return;

  heroIndex = (nextIndex + heroSlides.length) % heroSlides.length;
  const slide = heroSlides[heroIndex];

  const incoming = useA ? layerA : layerB;
  const outgoing = useA ? layerB : layerA;

  setLayerContent(incoming, slide);

  // force reflow → memastikan animasi selalu jalan
  void incoming.offsetWidth;

  incoming.classList.add("isActive");
  outgoing.classList.remove("isActive");

  useA = !useA;
}

function startHero(){
  clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    showHeroSlide(heroIndex + 1);
  }, 7000);
}

// INIT
showHeroSlide(0);
startHero();

// Pause ketika tab tidak aktif
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearInterval(heroTimer);
  } else {
    startHero();
  }
});

/* helpers */
function escapeHtml(str){
  return str
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}