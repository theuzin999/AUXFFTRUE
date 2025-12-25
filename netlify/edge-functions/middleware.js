export default async function middleware(req, context) {
  const url = new URL(req.url);
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const referer = req.headers.get("referer") || "";

  // 1. LISTA NEGRA DE FERRAMENTAS DE CÓPIA (HTTrack detectado no seu print)
  const blacklistedUA = [
    "httrack", "wget", "curl", "offline explorer", 
    "site-grabber", "teleport", "webcopier", "python-requests"
  ];

  if (blacklistedUA.some(bot => ua.includes(bot))) {
    return new Response("Acesso negado: Clonagem proibida.", { status: 403 });
  }

  // 2. PROTEÇÃO DE SCRIPTS (.js)
  // Bloqueia se tentarem acessar o arquivo JS diretamente fora do seu site
  if (url.pathname.endsWith(".js")) {
    const isInternal = referer.includes(url.hostname);
    if (!isInternal && !ua.includes("mozilla")) { 
      return new Response("Acesso direto a scripts bloqueado.", { status: 403 });
    }
  }

  // 3. PROTEÇÃO DA PÁGINA AUXILIO.HTML
  const protegidas = ["/auxilio.html", "/auxílio.html"];
  if (protegidas.includes(url.pathname)) {
    const cookies = req.headers.get("cookie") || "";
    // Verifica se existe o token de sessão que você define no login
    if (!cookies.includes("isLoggedIn=true")) {
      return Response.redirect(new URL("/index.html", req.url), 302);
    }
  }

  return; // Continua para a página normalmente
}

export const config = {
  path: "/*", // Aplica o middleware em todas as rotas do site
};