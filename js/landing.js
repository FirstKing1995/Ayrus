// ============================================================
// AYRUS — Landing: simulador de economia + captação de lead
// A landing NÃO carrega Firebase — só fala com o GAS (lead.criar).
// ============================================================

import { AYRUS_CONFIG } from "./config.js";
import { callApi } from "./api.js";
import { money, toast } from "./ui.js";

const tarifaReferencia = AYRUS_CONFIG.tarifaReferencia || 0.95;
const planos = AYRUS_CONFIG.planos || { bronze: 0.85, prata: 0.75, ouro: 0.65 };

// ---------- Código de afiliado (?ref=) ----------
// Guardado para o autocadastro creditar o afiliado mesmo se a pessoa
// for direto para "Assinar" (app.html lê do localStorage).
const refCode = (new URLSearchParams(location.search).get("ref") || "")
  .replace(/[^a-zA-Z0-9_-]/g, "")
  .slice(0, 24);
if (refCode) {
  try { localStorage.setItem("ayrus_ref", refCode); } catch { /* modo privado */ }
}

// ---------- Simulador (3 níveis) ----------
const simInput = document.getElementById("sim-conta");
const simResult = document.getElementById("sim-result");
const simAno = document.getElementById("sim-ano");
const tiers = {
  bronze: document.getElementById("sim-bronze"),
  prata: document.getElementById("sim-prata"),
  ouro: document.getElementById("sim-ouro"),
};

function simular() {
  const conta = Number(String(simInput.value).replace(",", "."));
  if (!Number.isFinite(conta) || conta < 50 || conta > 100000) {
    simResult.classList.add("hidden");
    return;
  }
  const kwhEstimado = conta / tarifaReferencia;
  let ecoOuro = 0;
  for (const [nome, preco] of Object.entries(planos)) {
    const economiaMes = kwhEstimado * (tarifaReferencia - preco);
    if (tiers[nome]) tiers[nome].textContent = money(economiaMes);
    if (nome === "ouro") ecoOuro = economiaMes;
  }
  simAno.textContent = money(ecoOuro * 12);
  simResult.classList.remove("hidden");
}
simInput.addEventListener("input", simular);

// ---------- Formulário de lead ----------
const form = document.getElementById("lead-form");
const btn = document.getElementById("lead-btn");
const formLoadedAt = Date.now(); // bots preenchem instantâneo; humanos não

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();

  const nome = form.nome.value.trim();
  const whatsapp = form.whatsapp.value.replace(/\D/g, "");
  const cidade = form.cidade.value.trim();
  const valorConta = Number(String(form.valor_conta.value).replace(",", "."));
  const consent = form.consent.checked;

  if (nome.length < 3) return toast("Digite seu nome completo.", "error");
  if (whatsapp.length < 10 || whatsapp.length > 13) {
    return toast("Digite um WhatsApp válido com DDD.", "error");
  }
  if (!consent) return toast("Precisamos do seu consentimento para retornar o contato.", "error");

  btn.disabled = true;
  btn.textContent = "Enviando…";

  const res = await callApi("lead.criar", {
    nome: nome.slice(0, 80),
    whatsapp,
    cidade: cidade.slice(0, 60),
    valorConta: Number.isFinite(valorConta) ? valorConta : null,
    ref: refCode || null,
    consent: true,
    // Anti-bot (validados no servidor):
    hp: form.website.value, // honeypot — humano deixa vazio
    t: Date.now() - formLoadedAt, // tempo de preenchimento
  });

  if (res.ok) {
    form.reset();
    document.getElementById("lead-ok").classList.remove("hidden");
    form.classList.add("hidden");
  } else {
    toast(res.error?.msg || "Não deu certo agora. Tente novamente.", "error");
    btn.disabled = false;
    btn.textContent = "Quero economizar";
  }
});
