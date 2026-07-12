// ============================================================
// AYRUS — Camada de API (única porta de saída para o backend)
//
// Por que Content-Type text/plain: evita preflight CORS
// (OPTIONS), que o Apps Script não responde. O GAS faz
// JSON.parse do corpo manualmente. (doc 02 §2)
//
// Envelope de resposta: { ok: true, data } | { ok: false, error: { code, msg } }
// O GAS sempre responde HTTP 200 — o erro vem no corpo.
//
// Na migração futura de stack, este é o ÚNICO arquivo do
// frontend que muda (junto com config.js).
// ============================================================

import { AYRUS_CONFIG } from "./config.js";

const TIMEOUT_MS = 25000;

/**
 * Chama uma ação do backend.
 * @param {string} action  ex.: "lead.criar", "cliente.vincular"
 * @param {object} payload dados da ação
 * @param {object|null} user usuário do Firebase Auth (para ações autenticadas)
 */
export async function callApi(action, payload = {}, user = null) {
  const body = { action, payload };

  if (user) {
    try {
      body.idToken = await user.getIdToken(); // renovado automaticamente pelo SDK
    } catch {
      return { ok: false, error: { code: "AUTH", msg: "Sessão expirada. Entre novamente." } };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(AYRUS_CONFIG.gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow", // GAS redireciona para script.googleusercontent.com
      signal: controller.signal,
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: { code: "FORMATO", msg: "Resposta inesperada do servidor." } };
    }
    if (typeof json.ok !== "boolean") {
      return { ok: false, error: { code: "FORMATO", msg: "Resposta inesperada do servidor." } };
    }
    return json;
  } catch (err) {
    const timedOut = err && err.name === "AbortError";
    return {
      ok: false,
      error: {
        code: timedOut ? "TIMEOUT" : "REDE",
        msg: timedOut
          ? "O servidor demorou para responder. Tente de novo."
          : "Sem conexão agora. Verifique sua internet e tente de novo.",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
