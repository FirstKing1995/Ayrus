// ============================================================
// AYRUS — Helpers de UI
// Regra de ouro anti-XSS: dado dinâmico entra no DOM via
// textContent / atributos — NUNCA via innerHTML.
// ============================================================

/** Cria elemento com props e filhos de forma segura. */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "text") node.textContent = v == null ? "" : String(v);
    else if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v != null) node.setAttribute(k, String(v));
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/** Limpa um container e insere novos filhos. */
export function render(container, children) {
  container.replaceChildren(...[].concat(children).filter(Boolean));
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? fmtBRL.format(n) : "—";
}

export function kwh(v) {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toLocaleString("pt-BR")} kWh` : "—";
}

/** "2026-07" → "julho de 2026" */
export function mesRefLabel(mesRef) {
  if (!/^\d{4}-\d{2}$/.test(String(mesRef || ""))) return String(mesRef || "—");
  const [y, m] = mesRef.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "2026-07-10" → "10/07/2026" */
export function dateLabel(iso) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(iso || ""))) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

let toastTimer = null;

export function toast(message, type = "info") {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const node = el("div", { class: `toast ${type}`, role: "status", text: message });
  document.body.appendChild(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), 4200);
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback para contextos sem clipboard API
    const ta = el("textarea", { style: "position:fixed;opacity:0" });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function statusBadge(status) {
  const map = {
    PAGO: ["badge badge-pago", "Paga"],
    PENDENTE: ["badge badge-pendente", "Aguardando pagamento"],
    VENCIDO: ["badge badge-vencido", "Vencida"],
    CANCELADO: ["badge badge-neutro", "Cancelada"],
  };
  const [cls, label] = map[status] || ["badge badge-neutro", String(status || "—")];
  return el("span", { class: cls, text: label });
}
