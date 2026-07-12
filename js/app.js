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
const views = { auth: $("view-auth"), verify: $("view-verify"), dash: $("view-dash"), loading: $("view-loading") };

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

$("auth-toggle-link").addEventListener("click", (ev) => {
  ev.preventDefault();
  mode = mode === "login" ? "signup" : "login";
  $("auth-title").textContent = mode === "login" ? "Entrar no Ayrus" : "Criar sua conta";
  authBtn.textContent = mode === "login" ? "Entrar" : "Criar conta";
  $("auth-toggle-text").textContent = mode === "login" ? "Primeira vez aqui?" : "Já tem conta?";
  $("auth-toggle-link").textContent = mode === "login" ? "Criar conta" : "Entrar";
  $("forgot-link").classList.toggle("hidden", mode !== "login");
});

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
  if (mode === "signup" && senha.length < 8) return toast("Use uma senha com pelo menos 8 caracteres.", "error");

  authBtn.disabled = true;
  try {
    if (mode === "signup") {
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      await sendEmailVerification(cred.user);
      toast("Conta criada! Enviamos um link de confirmação para seu e-mail.", "success");
    } else {
      await signInWithEmailAndPassword(auth, email, senha);
    }
    // onAuthStateChanged assume daqui
  } catch (err) {
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
  if (!user.emailVerified) {
    $("verify-email-label").textContent = user.email || "";
    show("verify");
    return;
  }

  show("loading");

  // Vincula a conta Firebase ao cadastro feito pelo admin (idempotente no servidor).
  const vinculo = await callApi("cliente.vincular", {}, user);
  if (!vinculo.ok && vinculo.error?.code === "SEM_CADASTRO") {
    show("dash");
    render($("dash-content"), el("div", { class: "card" }, [
      el("h3", { text: "Quase lá!" }),
      el("p", { class: "muted", text: "Sua conta foi criada, mas este e-mail ainda não está em nossa base de clientes. Fale com nosso time para ativar seu plano." }),
    ]));
    return;
  }

  iniciarDashboard(user);
});

function iniciarDashboard(user) {
  show("dash");

  // Perfil (nome, economia acumulada, status)
  unsubCliente = onSnapshot(doc(db, "clientes", user.uid), (snap) => {
    const c = snap.data();
    if (!c) return;
    $("dash-hello").textContent = c.nome ? `Olá, ${c.nome}!` : "Olá!";
    $("eco-total").textContent = money(c.economiaAcumulada || 0);
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
