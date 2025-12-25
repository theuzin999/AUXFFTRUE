export default async function middleware(req, context) {
  const url = new URL(req.url);
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const referer = req.headers.get("referer") || "";
  const cookies = req.headers.get("cookie") || "";

  // 1. LISTA NEGRA DE FERRAMENTAS DE CÓPIA
  const blacklistedUA = [
    "httrack", "wget", "curl", "offline explorer", 
    "site-grabber", "teleport", "webcopier", "python-requests"
  ];

  if (blacklistedUA.some(bot => ua.includes(bot))) {
    return new Response("Acesso negado: Clonagem proibida.", { status: 403 });
  }

  // 2. PROTEÇÃO DE SCRIPTS (.js)
  if (url.pathname.endsWith(".js")) {
    // Permite acesso se for interno (mesmo host) OU se o cookie de login estiver presente
    const isInternal = referer.includes(url.hostname);
    if (!isInternal && !cookies.includes("isLoggedIn=true")) { 
      return new Response("Acesso direto a scripts bloqueado.", { status: 403 });
    }
  }

  // 3. PROTEÇÃO DA PÁGINA AUXILIO.HTML
  // Bloqueia qualquer variação da página de auxílio
  const protegidas = ["/auxilio.html", "/auxílio.html", "/auxilio", "/auxílio"];
  
  if (protegidas.some(path => url.pathname.startsWith(path))) {
    // Verifica estritamente se o cookie isLoggedIn=true existe
    if (!cookies.includes("isLoggedIn=true")) {
      // Se não tiver o cookie, chuta de volta para o index
      return Response.redirect(new URL("/index.html", req.url), 302);
    }
  }

  // 4. Se acessar a raiz (Index), opcionalmente não fazemos nada, 
  // pois o script do index.html já vai limpar os cookies.

  return; // Continua normalmente
}

export const config = {
  matcher: ["/((?!_next/static|favicon.ico).*)"], // Aplica em tudo exceto arquivos estáticos do next (se houver) e favicon
};
