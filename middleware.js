export default async function middleware(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  
  // 1. LISTA DE ARQUIVOS PROTEGIDOS (Que exigem login/token)
  // Apenas a página interna (auxilio) deve exigir token. 
  // O index.html é a tela de login, então ele precisa ser público (mas protegido de robôs).
  const paginasRestritas = ["/auxilio.html", "/auxílio.html"];

  // 2. BLOQUEIO AVANÇADO DE ROBÔS E CLONADORES
  // Lista expandida de User-Agents usados por programas de clonagem
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const robosBloqueados = [
    "httrack", "wget", "curl", "python", "scrapy", "http-client", 
    "axios", "go-http-client", "java", "libwww", "download", 
    "copier", "site-grabber", "nmap", "sqlmap"
  ];

  if (robosBloqueados.some(bot => ua.includes(bot))) {
    return new Response("Acesso Negado - Proteção Anti-Clonagem Ativa", { status: 403 });
  }

  // 3. PROTEÇÃO DOS ARQUIVOS JAVASCRIPT (.js)
  // Impede que baixem seus scripts diretamente digitando a URL ou usando clonadores.
  // O script só será entregue se a requisição vier de dentro do seu próprio domínio.
  if (path.endsWith(".js")) {
    const referer = req.headers.get("referer") || "";
    const currentHost = url.hostname;

    // Se não tiver referer ou o referer não contiver seu domínio, bloqueia.
    // Isso impede "Salvar site como" de pegar os JS corretamente em muitos casos.
    if (!referer || !referer.includes(currentHost)) {
       return new Response("Acesso Direto a Scripts Bloqueado", { status: 403 });
    }
  }

  // 4. VERIFICAÇÃO DE SESSÃO (Apenas para páginas restritas)
  // Se não for uma página restrita (como index.html ou imagens), deixa passar.
  if (!paginasRestritas.includes(path)) {
    return fetch(req);
  }

  // Verifica o cookie de sessão para acessar o auxilio.html
  const cookies = req.headers.get("cookie") || "";
  const match = cookies.match(/sessionId=([^;]+)/);
  const token = match ? match[1] : null;

  // Se não tem token e tentou entrar na restrita, manda pro Login (index)
  if (!token) {
    return Response.redirect(new URL("/", req.url), 302);
  }

  try {
    // Validação remota do token
    const verify = await fetch("https://keysdash.espanhaserrita.workers.dev/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const data = await verify.json().catch(() => ({}));

    if (verify.ok && data.ok) {
      // Token válido -> libera acesso ao auxilio.html
      return fetch(req);
    } else {
      // Token inválido -> manda pro Login
      return Response.redirect(new URL("/", req.url), 302);
    }
  } catch (e) {
    console.error("Erro na verificação remota:", e);
    // Em caso de erro no servidor de validação, por segurança, manda pro login
    return Response.redirect(new URL("/", req.url), 302);
  }
}
