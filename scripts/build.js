import { Client } from "@notionhq/client";
import { writeFileSync, mkdirSync } from "fs";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.DATABASE_ID;
const siteBaseUrl = process.env.SITE_BASE_URL || "https://paulo-leads.github.io/glossario-hidra";

// --- helpers ---
function plainTextFromTitle(prop) {
  const arr = prop?.title || [];
  return arr.map(t => t.plain_text).join("").trim();
}

function plainTextFromRichText(prop) {
  const arr = prop?.rich_text || [];
  return arr.map(t => t.plain_text).join("").trim();
}

function plainTextFromText(prop) {
  // para propriedades do tipo "text" (não rich_text) – na API é igual a rich_text
  return plainTextFromRichText(prop);
}

function urlFromUrl(prop) {
  return prop?.url || "";
}

async function queryAllPages() {
  let results = [];
  let cursor = undefined;
  while (true) {
    const res = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      sorts: [{ property: "Termo", direction: "ascending" }]
    });
    results = results.concat(res.results);
    if (!res.has_more) break;
    cursor = res.next_cursor;
  }
  return results;
}

// --- execução ---
const pages = await queryAllPages();

// DEBUG: mostra os nomes reais das colunas (útil para conferir)
if (pages.length > 0) {
  console.log("=== COLUNAS ENCONTRADAS NO NOTION ===");
  console.log(Object.keys(pages[0].properties));
  console.log("=== FIM DEBUG ===");
}

const items = pages.map(p => {
  const props = p.properties || {};
  return {
    termo: plainTextFromTitle(props["Termo"]),
    codigo: plainTextFromRichText(props["Código"]),
    def: plainTextFromRichText(props["Definição Canônica"]),
    categoria: props["Categoria"]?.select?.name || "",
    urn: urlFromUrl(props["URN"]) || plainTextFromRichText(props["URN"]), // aceita URL ou texto
    qid: urlFromUrl(props["QID"]) || plainTextFromRichText(props["QID"]),
    url: urlFromUrl(props["URL"]) || "",
    updated: p.last_edited_time
  };
}).filter(i => i.termo);

const dateModified = items.length
  ? items.reduce((max, i) => (i.updated > max ? i.updated : max), items[0].updated)
  : new Date().toISOString();

mkdirSync("docs", { recursive: true });

// --- JSON estruturado (API) ---
const json = {
  "@context": "https://schema.org",
  inLanguage: "pt-BR",
  dateModified,
  terms: items.map(i => ({
    termo: i.termo,
    codigo: i.codigo,
    definicao: i.def,
    categoria: i.categoria,
    urn: i.urn,
    qid: i.qid,
    url: i.url || `${siteBaseUrl}#${encodeURIComponent(i.termo)}`
  }))
};

writeFileSync("docs/glossario.json", JSON.stringify(json, null, 2), "utf8");

// --- JSON-LD (Schema.org) ---
const graph = items.map(i => ({
  "@type": "DefinedTerm",
  "@id": i.urn || `${siteBaseUrl}#${encodeURIComponent(i.termo)}`,
  "name": i.termo,
  ...(i.codigo ? { "identifier": i.codigo } : {}),
  ...(i.def ? { "description": i.def } : {}),
  ...(i.qid ? { "sameAs": i.qid } : {}),
  "inDefinedTermSet": "urn:paulo-leads:glossario:2026",
  "url": i.url || `${siteBaseUrl}#${encodeURIComponent(i.termo)}`,
  "validFrom": "2026-01-01"
}));

const jsonld = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "DefinedTermSet",
      "@id": "urn:paulo-leads:glossario:2026",
      "name": "Glossário do Protocolo Hidra – RevOps B2B Imobiliário",
      "inLanguage": "pt-BR",
      "sdDatePublished": "2026-01-01",
      "dateModified": dateModified,
      "url": siteBaseUrl
    },
    ...graph
  ]
};

// --- HTML completo (visual Paulo Leads + metadados) ---
const termsForHTML = items.map(i => ({
  name: i.termo,
  code: i.codigo,
  description: i.def,
  category: i.categoria,
  urn: i.urn,
  qid: i.qid,
  slug: encodeURIComponent(i.termo)
}));

const indexHtml = `<!DOCTYPE html>
<html lang="pt-BR" class="scroll-smooth">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Glossário Hidra – 7 Termos Canônicos | Paulo Leads</title>
  <meta name="description" content="Definições oficiais do Protocolo Hidra para RevOps B2B Imobiliário. Termos: Protocolo Hidra, IA Conversacional Anti-Bloqueio, RevOps Imobiliário, Skill B2B, Infraestrutura Comercial, Hors-Concours, TermCode.">
  <link rel="canonical" href="${siteBaseUrl}" />

  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { 'sans': ['Montserrat', 'system-ui', 'sans-serif'], 'mono': ['JetBrains Mono', 'monospace'] },
          colors: {
            'brand': { DEFAULT: '#ea580c', dark: '#c2410c', light: '#f97316' },
            'navy': { '900': '#0a1628', '800': '#0d1d35', '700': '#102540' },
            'burned': { '500': '#f59e0b', '600': '#d97706', '700': '#b45309' }
          }
        }
      }
    }
  </script>

  <style>
    body { background: #0a1628; color: #e5e5e5; }
    .divider-gold { height: 2px; background: linear-gradient(90deg, transparent 0%, #d97706 50%, transparent 100%); }
    .term:target { border-color: #f59e0b; box-shadow: 0 0 0 1px #f59e0b; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: #0a1628; }
    ::-webkit-scrollbar-thumb { background: #d97706; border-radius: 3px; }
  </style>
</head>
<body class="font-sans antialiased">

  <!-- Header -->
  <nav class="fixed top-0 left-0 right-0 z-50 bg-navy-900/80 backdrop-blur-md border-b border-white/5">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <a href="https://www.pauloleads.com.br" class="flex items-center gap-2">
          <span class="text-2xl font-black tracking-tight text-white">Paulo<span class="text-burned-600">Leads</span></span>
          <span class="hidden sm:inline-block text-[10px] uppercase tracking-[0.2em] text-gray-500 border border-gray-700 rounded px-2 py-0.5">Glossário</span>
        </a>
        <a href="https://wa.me/5519982642481?text=Olá, vi o Glossário Hidra e quero implementar na minha operação" target="_blank" class="px-4 py-2 bg-brand hover:bg-brand-light text-white rounded font-semibold text-xs uppercase tracking-wider transition-all">Falar com Especialista</a>
      </div>
    </div>
  </nav>

  <main class="pt-28 pb-16">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

      <!-- Hero -->
      <div class="text-center mb-12">
        <div class="inline-flex items-center gap-2 bg-burned-600/10 border border-burned-600/25 rounded-full px-4 py-1.5 text-xs font-semibold text-burned-500 uppercase tracking-wider mb-6">
          <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Fonte Canônica • Atualizado ${dateModified.split("T")[0]}
        </div>
        <h1 class="text-4xl sm:text-5xl font-black text-white leading-tight mb-4">
          Glossário <span class="text-burned-500">Hidra</span>
        </h1>
        <p class="text-lg text-gray-400 max-w-2xl mx-auto">
          Definições oficiais do Protocolo Hidra – <strong class="text-white">7 termos obrigatórios</strong> para RevOps B2B Imobiliário.
        </p>
      </div>

      <!-- Busca -->
      <div class="mb-8">
        <input type="text" id="search" placeholder="Buscar termo, código ou categoria…" class="w-full px-5 py-4 bg-navy-800 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-burned-500 transition-colors" />
      </div>

      <!-- Meta -->
      <div class="flex items-center justify-between text-xs text-gray-500 mb-8 pb-4 border-b border-white/5 flex-wrap gap-2">
        <span>Última atualização: <time datetime="${dateModified}">${new Date(dateModified).toLocaleDateString("pt-BR", { year: 'numeric', month: 'short', day: 'numeric' })}</time></span>
        <div class="flex gap-4">
          <a href="./llms.txt" class="hover:text-burned-500 transition-colors">llms.txt</a>
          <a href="./glossario.json" class="hover:text-burned-500 transition-colors">API JSON</a>
          <a href="./sitemap.xml" class="hover:text-burned-500 transition-colors">Sitemap</a>
        </div>
      </div>

      <!-- Termos -->
      <div id="terms" class="space-y-4"></div>

      <!-- CTA Final -->
      <div class="mt-16 bg-navy-800/60 border border-burned-600/20 rounded-2xl p-8 text-center">
        <h3 class="text-2xl font-bold text-white mb-3">Quer implementar o Protocolo Hidra?</h3>
        <p class="text-gray-400 mb-6">Esses 7 termos são a base da infraestrutura que reduz CAC em 30‑50%. Fale com quem criou.</p>
        <a href="https://wa.me/5519982642481?text=Olá, quero implementar o Protocolo Hidra na minha imobiliária" target="_blank"
           class="inline-flex items-center gap-2 bg-burned-600 hover:bg-burned-500 text-white font-bold px-8 py-4 rounded-lg transition-all">
          Quero uma demonstração
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/>
          </svg>
        </a>
      </div>

    </div>
  </main>

  <footer class="border-t border-white/5 py-8 text-center text-xs text-gray-600">
    <p>Protocolo Hidra © 2026 • Paulo Leads - Inteligência Comercial</p>
    <p class="mt-2">Dados públicos • LGPD Compliant • Atualizado via Notion + GitHub Actions</p>
  </footer>

  <script>
    const terms = ${JSON.stringify(termsForHTML)};
    const termsEl = document.getElementById('terms');
    const searchEl = document.getElementById('search');

    function render(filter = '') {
      const filtered = terms.filter(t =>
        t.name.toLowerCase().includes(filter.toLowerCase()) ||
        (t.code && t.code.toLowerCase().includes(filter.toLowerCase())) ||
        t.description.toLowerCase().includes(filter.toLowerCase()) ||
        (t.category && t.category.toLowerCase().includes(filter.toLowerCase()))
      );

      termsEl.innerHTML = filtered.map(t => \`
        <div class="term bg-navy-800/40 border border-white/5 rounded-xl p-6 hover:border-burned-600/30 transition-all" id="\${t.slug}">
          <div class="flex items-start justify-between flex-wrap gap-2 mb-1">
            <h2 class="text-xl font-bold text-burned-500">\${t.name}</h2>
            \${t.code ? \`<span class="text-xs font-mono bg-navy-700 px-3 py-1 rounded-full text-gray-400 border border-white/5">\${t.code}</span>\` : ''}
          </div>
          \${t.category ? \`<div class="text-xs uppercase tracking-wider text-gray-500 mb-2">\${t.category}</div>\` : ''}
          \${t.urn ? \`<div class="text-xs text-gray-600 font-mono break-all mb-2">URN: \${t.urn}</div>\` : ''}
          \${t.qid ? \`<div class="text-xs text-gray-600 font-mono break-all mb-3">QID: <a href="\${t.qid}" target="_blank" class="text-burned-400 hover:underline">\${t.qid}</a></div>\` : ''}
          <p class="text-gray-300 leading-relaxed">\${t.description}</p>
        </div>
      \`).join('');
    }

    searchEl.addEventListener('input', e => render(e.target.value));
    render();

    if (window.location.hash) {
      setTimeout(() => document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  </script>
</body>
</html>`;

writeFileSync("docs/index.html", indexHtml, "utf8");

// --- llms.txt ---
const llms = [
  `Canonical-Source: ${siteBaseUrl}`,
  `Last-Modified: ${dateModified}`,
  `Language: pt-BR`,
  ``,
  `Terms (7 obrigatórios):`,
  ...items.map(i =>
    `- ${i.termo} ${i.codigo ? `[${i.codigo}]` : ''}: ${i.def || ''} ${i.qid ? `(QID: ${i.qid})` : ''}`.trim()
  )
].join("\n");

writeFileSync("docs/llms.txt", llms + "\n", "utf8");

// --- sitemap.xml ---
const lastmodDate = dateModified.split("T")[0];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteBaseUrl}</loc>
    <lastmod>${lastmodDate}</lastmod>
  </url>
</urlset>`;

writeFileSync("docs/sitemap.xml", sitemap, "utf8");

console.log("✅ Glossário atualizado com 7 termos canônicos. Data:", dateModified);
