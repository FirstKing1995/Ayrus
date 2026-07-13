// ============================================================
// AYRUS — Dashboard do cliente (app.html)
// Leitura: Firestore em tempo real (onSnapshot).
// Ações: GAS via api.js (com ID Token).
// Renderização 100% via textContent — sem innerHTML (anti-XSS).
// ============================================================

import {
  auth, db,
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, sendEmailVerification, signOut,
  doc, collection, query, where, orderBy, limit, onSnapshot,
} from "./firebase-init.js";
import { callApi } from "./api.js";
import { el, render, money, kwh, mesRefLabel, dateLabel, toast, copyToClipboard, statusBadge } from "./ui.js";

const $ = (id) => document.getElementById(id);
const views = { auth: $("view-auth"), verify: $("view-verify"), onboard: $("view-onboard"), dash: $("view-dash"), loading: $("view-loading") };

// Plano escolhido na landing (?plano=ouro) e código de afiliado — sobrevivem
// à ida ao e-mail de verificação via localStorage.
const planoUrl = (new URLSearchParams(location.search).get("plano") || "").toUpperCase();
if (["BRONZE", "PRATA", "OURO"].includes(planoUrl)) {
  try { localStorage.setItem("ayrus_plano", planoUrl); } catch { /* modo privado */ }
}
function planoEscolhido() {
  try { return localStorage.getItem("ayrus_plano") || "OURO"; } catch { return "OURO"; }
}
function refSalvo() {
  try { return localStorage.getItem("ayrus_ref") || null; } catch { return null; }
}

let unsubCliente = null;
let unsubFaturas = null;

function show(name) {
  Object.entries(views).forEach(([k, v]) => v.classList.toggle("hidden", k !== name));
}

function cleanupSnapshots() {
  if (unsubCliente) { unsubCliente(); unsubCliente = null; }
  if (unsubFaturas) { unsubFaturas(); unsubFaturas = null; }
}

// ============================================================
// AUTENTICAÇÃO
// ============================================================

const authForm = $("auth-form");
const authBtn = $("auth-btn");
let mode = "login"; // login | signup
let pendingSignup = null; // dados do cadastro aguardando a criação da conta Firebase

const PLANO_INFO = {
  BRONZE: ["Bronze", "R$ 0,85", "~10%"],
  PRATA: ["Prata", "R$ 0,75", "~21%"],
  OURO: ["Ouro", "R$ 0,65", "~32%"],
};

function atualizarResumoPlano() {
  const [nome, preco, eco] = PLANO_INFO[$("auth-plano").value] || PLANO_INFO.OURO;
  $("plan-summary").textContent = `Plano ${nome} — ${preco}/kWh · economia estimada de ${eco}`;
}

function setMode(m) {
  mode = m;
  const signup = m === "signup";
  $("auth-title").textContent = signup ? "Criar conta e reservar seu plano" : "Entrar no Ayrus";
  authBtn.textContent = signup ? "Criar conta e reservar plano" : "Entrar";
  $("auth-toggle-text").textContent = signup ? "Já tem conta?" : "Primeira vez aqui?";
  $("auth-toggle-link").textContent = signup ? "Entrar" : "Criar conta";
  $("forgot-link").classList.toggle("hidden", signup);
  document.querySelectorAll(".signup-only").forEach((n) => n.classList.toggle("hidden", !signup));
  if (signup) {
    $("auth-plano").value = planoEscolhido();
    atualizarResumoPlano();
  }
}

$("auth-toggle-link").addEventListener("click", (ev) => {
  ev.preventDefault();
  setMode(mode === "login" ? "signup" : "login");
});

$("auth-plano").addEventListener("change", () => {
  try { localStorage.setItem("ayrus_plano", $("auth-plano").value); } catch { /* modo privado */ }
  atualizarResumoPlano();
});

// Veio da landing com plano escolhido? Abre direto no cadastro.
if (["BRONZE", "PRATA", "OURO"].includes(planoUrl)) setMode("signup");

const AUTH_ERRORS = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/email-already-in-use": "Este e-mail já tem conta. Use “Entrar”.",
  "auth/weak-password": "Senha muito curta — use pelo menos 8 caracteres.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
};

authForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = authForm.email.value.trim().toLowerCase();
  const senha = authForm.senha.value;
  if (!email) return toast("Digite seu e-mail.", "error");

  if (mode === "signup") {
    const nome = authForm.nome.value.trim();
    const whatsapp = authForm.whatsapp.value.replace(/\D/g, "");
    if (nome.length < 3) return toast("Digite seu nome completo.", "error");
    if (whatsapp.length < 10 || whatsapp.length > 13) return toast("Digite um WhatsApp válido com DDD.", "error");
    if (senha.length < 8) return toast("Use uma senha com pelo menos 8 caracteres.", "error");
    if (!authForm.consent.checked) return toast("É preciso aceitar os termos para continuar.", "error");
    pendingSignup = {
      nome: nome.slice(0, 80),
      whatsapp,
      plano: authForm.plano.value,
      consent: true,
      ref: refSalvo(),
    };
  }

  authBtn.disabled = true;
  try {
    if (mode === "signup") await createUserWithEmailAndPassword(auth, email, senha);
    else await signInWithEmailAndPassword(auth, email, senha);
    // onAuthStateChanged assume daqui (e consome pendingSignup)
  } catch (err) {
    pendingSignup = null;
    toast(AUTH_ERRORS[err.code] || "Não foi possível entrar agora. Tente de novo.", "error");
  } finally {
    authBtn.disabled = false;
  }
});

$("forgot-link").addEventListener("click", async (ev) => {
  ev.preventDefault();
  const email = authForm.email.value.trim().toLowerCase();
  if (!email) return toast("Digite seu e-mail no campo acima e clique de novo.", "error");
  try {
    await sendPasswordResetEmail(auth, email);
  } catch { /* resposta idêntica para não revelar quais e-mails existem */ }
  toast("Se este e-mail tiver conta, o link de redefinição chega em instantes.", "success");
});

$("verify-resend").addEventListener("click", async () => {
  if (!auth.currentUser) return;
  try {
    await sendEmailVerification(auth.currentUser);
    toast("Link reenviado. Olhe também o spam.", "success");
  } catch {
    toast("Aguarde um pouco antes de reenviar.", "error");
  }
});

$("verify-done").addEventListener("click", async () => {
  await auth.currentUser?.reload();
  if (auth.currentUser?.emailVerified) location.reload();
  else toast("Ainda não confirmado. Clique no link do e-mail primeiro.", "error");
});

document.querySelectorAll(".btn-sair").forEach((b) =>
  b.addEventListener("click", async () => { cleanupSnapshots(); await signOut(auth); })
);

// ============================================================
// FLUXO PRINCIPAL
// ============================================================

onAuthStateChanged(auth, async (user) => {
  cleanupSnapshots();
  $("topo-sair").classList.toggle("hidden", !user);

  if (!user) { show("auth"); return; }

  show("loading");

  // Conta recém-criada no formulário de cadastro → autocadastro imediato
  if (pendingSignup) {
    const dados = pendingSignup;
    pendingSignup = null;
    const res = await callApi("cliente.autocadastro", dados, user);
    if (res.ok) {
      toast("Plano reservado! Bem-vindo ao Ayrus. ⚡", "success");
      iniciarDashboard(user);
      return;
    }
    // Falhou (rede/limite): cai no onboarding pré-preenchido para tentar de novo
    $("onb-nome").value = dados.nome || "";
    $("onb-whats").value = dados.whatsapp || "";
    $("onb-plano").value = dados.plano || planoEscolhido();
    toast(res.error?.msg || "Quase lá — confirme seus dados e tente de novo.", "error");
    show("onboard");
    return;
  }

  // Login normal: vincula a conta ao cadastro (idempotente no servidor).
  const vinculo = await callApi("cliente.vincular", {}, user);
  if (!vinculo.ok && vinculo.error?.code === "SEM_CADASTRO") {
    // Conta sem cadastro (ex.: abandono no meio) → onboarding
    $("onb-plano").value = planoEscolhido();
    show("onboard");
    return;
  }
  if (!vinculo.ok && vinculo.error?.code === "EMAIL_NAO_VERIFICADO") {
    // Caso raro: cadastro pré-criado pela equipe — confirmar posse do e-mail
    $("verify-email-label").textContent = user.email || "";
    show("verify");
    return;
  }

  iniciarDashboard(user);
});

// ---------- Onboarding (autocadastro com plano) ----------
$("onboard-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = ev.currentTarget;
  const btn = $("onboard-btn");
  const user = auth.currentUser;
  if (!user) return show("auth");

  const nome = form.nome.value.trim();
  if (nome.length < 3) return toast("Digite seu nome completo.", "error");
  if (!form.consent.checked) return toast("É preciso aceitar os termos para continuar.", "error");

  btn.disabled = true;
  btn.textContent = "Reservando…";

  const res = await callApi("cliente.autocadastro", {
    nome: nome.slice(0, 80),
    whatsapp: form.whatsapp.value.replace(/\D/g, ""),
    plano: form.plano.value,
    consent: true,
    ref: refSalvo(),
  }, user);

  if (res.ok) {
    toast("Plano reservado! Bem-vindo ao Ayrus. ⚡", "success");
    iniciarDashboard(user);
  } else {
    toast(res.error?.msg || "Não deu certo agora. Tente de novo.", "error");
    btn.disabled = false;
    btn.textContent = "Reservar meu plano";
  }
});

function iniciarDashboard(user) {
  show("dash");

  // Perfil (nome, economia acumulada, status, plano)
  unsubCliente = onSnapshot(doc(db, "clientes", user.uid), (snap) => {
    const c = snap.data();
    if (!c) return;
    $("dash-hello").textContent = c.nome ? `Olá, ${c.nome}!` : "Olá!";
    $("eco-total").textContent = money(c.economiaAcumulada || 0);
    renderStatusBanner(c);
  }, () => toast("Não foi possível carregar seu perfil agora.", "error"));

  // Faturas (últimas 24, mais recente primeiro)
  const q = query(
    collection(db, "faturas"),
    where("uid", "==", user.uid),
    orderBy("mesRef", "desc"),
    limit(24)
  );
  unsubFaturas = onSnapshot(q, (snap) => {
    const faturas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderFaturaAtual(faturas[0] || null, user);
    renderHistorico(faturas.slice(1));
  }, () => {
    render($("fatura-atual"), el("div", { class: "empty-state", text: "Não foi possível carregar suas faturas. Recarregue a página." }));
  });
}

// ============================================================
// RENDERIZAÇÃO
// ============================================================

const PLANO_LABEL = { BRONZE: "Bronze", PRATA: "Prata", OURO: "Ouro" };

function renderStatusBanner(c) {
  const box = $("status-banner");
  if (c.status === "AGUARDANDO") {
    const plano = PLANO_LABEL[c.plano] || c.plano || "—";
    render(box, el("div", { class: "card card-highlight" }, [
      el("h3", { text: `Plano ${plano} reservado ✓` }),
      el("p", { class: "muted", text: "Sua conta está criada e seu plano garantido. Falta pouco: nossa equipe vai chamar você para a assinatura digital do contrato e o primeiro pagamento. Enquanto isso, explore o app à vontade." }),
    ]));
  } else if (c.status === "INADIMPLENTE") {
    render(box, el("div", { class: "card" }, [
      el("p", { class: "muted", text: "Há uma fatura em aberto. Regularize pelo PIX abaixo para manter sua economia ativa." }),
    ]));
  } else {
    render(box, []);
  }
}

function renderFaturaAtual(f, user) {
  const box = $("fatura-atual");
  if (!f) {
    render(box, el("div", { class: "empty-state", text: "Nenhuma fatura ainda. Sua primeira fatura aparece aqui assim que fechar o mês. ⚡" }));
    return;
  }

  const children = [
    el("div", { class: "fatura-head" }, [
      el("div", {}, [
        el("h3", { text: mesRefLabel(f.mesRef) }),
        el("small", { class: "muted", text: `${kwh(f.consumoKwh)} · vence ${dateLabel(f.vencimento)}` }),
      ]),
      statusBadge(f.status),
    ]),
    el("p", { class: "big-number money", text: money(f.valorTotal) }),
  ];

  if (f.status === "PAGO") {
    children.push(el("p", { class: "muted", text: `Pagamento confirmado ✓ Você economizou ${money(f.economiaEstimada)} este mês.` }));
  } else if (f.status === "VENCIDO") {
    // PIX expira no vencimento — não exibir QR morto
    children.push(el("p", { class: "muted", text: "Esta fatura venceu e o PIX expirou. Fale com nosso suporte para gerar uma nova cobrança." }));
  } else if (f.pixCopiaECola) {
    const qrWrap = el("div", { class: "qr-box" });
    if (f.qrBase64) {
      qrWrap.appendChild(el("img", { alt: "QR Code PIX", src: `data:image/png;base64,${f.qrBase64}` }));
    }
    qrWrap.appendChild(el("div", { class: "pix-code", text: f.pixCopiaECola }));
    qrWrap.appendChild(el("button", {
      class: "btn btn-primary btn-block",
      text: "Copiar código PIX",
      onclick: async () => {
        const ok = await copyToClipboard(f.pixCopiaECola);
        toast(ok ? "Código PIX copiado! Cole no app do seu banco." : "Não foi possível copiar. Selecione o código manualmente.", ok ? "success" : "error");
      },
    }));
    qrWrap.appendChild(el("button", {
      class: "btn btn-ghost btn-block btn-sm",
      text: "Já paguei — verificar agora",
      onclick: async (ev) => {
        const b = ev.currentTarget;
        b.disabled = true; b.textContent = "Verificando…";
        const res = await callApi("pagamento.verificar", { idFatura: f.id }, user);
        if (res.ok && res.data?.status === "PAGO") toast("Pagamento confirmado! 🎉", "success");
        else if (res.ok) toast("Ainda não identificamos o pagamento. O PIX pode levar alguns instantes.", "info");
        else toast(res.error?.msg || "Não foi possível verificar agora.", "error");
        b.disabled = false; b.textContent = "Já paguei — verificar agora";
      },
    }));
    children.push(qrWrap);
    children.push(el("small", { class: "muted", text: `Pagando hoje, sua economia estimada do mês é ${money(f.economiaEstimada)}.` }));
  }

  render(box, children);
}

function renderHistorico(faturas) {
  const box = $("historico");
  if (!faturas.length) {
    render(box, el("div", { class: "empty-state", text: "Seu histórico aparecerá aqui." }));
    return;
  }
  render(box, faturas.map((f) =>
    el("div", { class: "hist-item" }, [
      el("div", {}, [
        el("strong", { text: mesRefLabel(f.mesRef), style: "color:var(--text)" }),
        el("div", {}, [el("small", { class: "muted", text: `${kwh(f.consumoKwh)} · ${money(f.valorTotal)}` })]),
      ]),
      statusBadge(f.status),
    ])
  ));
}
