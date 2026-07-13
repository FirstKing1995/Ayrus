// ============================================================
// AYRUS — Config do frontend (MODELO)
//
// 1. Copie este arquivo para `config.js` nesta mesma pasta.
// 2. Preencha com os valores do SEU projeto (doc 08_DEPLOY).
// 3. `config.js` está no .gitignore — decida conscientemente
//    o que commitar (ver doc 08 §5, opções A/B).
//
// NOTA DE SEGURANÇA (doc 05):
// - O firebaseConfig é público por design; a proteção real são
//   as regras do Firestore + Firebase Auth.
// - A URL do GAS fica visível no DevTools de qualquer visitante.
//   A segurança NÃO depende de escondê-la: toda ação sensível
//   exige ID Token válido, validado no servidor.
// - O que NUNCA pode aparecer aqui: token do Mercado Pago,
//   chave de service account, WEBHOOK_TOKEN, ID da planilha.
// ============================================================

export const AYRUS_CONFIG = {
  firebase: {
    apiKey: "AIzaSyAbLksF7TIo5JYKy20XgfvknkIp7wVZpnY",
    authDomain: "ayrus-app.firebaseapp.com",
    projectId: "ayrus-app",
    storageBucket: "ayrus-app.firebasestorage.app",
    messagingSenderId: "827151910218",
    appId: "1:827151910218:web:785ac66c33a78752c4adb3",
  },

  // URL do Web App do Apps Script (termina em /exec)
  gasUrl: "https://script.google.com/macros/s/AKfycbyLCWktFGEQwgFLHIq5-hAaGje8qNe_O480Ze0oHsWLik69ktfOZZcuk16Zyxsct2DwPQ/exec",

  // Parâmetros de EXIBIÇÃO da landing (estimativas).
  // Os valores oficiais de cobrança vivem em DB_Config, no servidor.
  precoKwh: 0.65,
  tarifaReferencia: 0.95,
};
