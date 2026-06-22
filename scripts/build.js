import { Client } from "@notionhq/client";
import { writeFileSync, mkdirSync } from "fs";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.DATABASE_ID;
const siteBaseUrl = process.env.SITE_BASE_URL || "https://pauloleads.github.io/glossario-hidra";

function plainTextFromTitle(prop) {
  const arr = prop?.title || [];
  return arr.map(t => t.plain_text).join("").trim();
}

function plainTextFromRichText(prop) {
  const arr = prop?.rich_text || [];
  return arr.map(t => t.plain_text).join("").trim();
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

const pages = await queryAllPages();

// DEBUG: MOSTRA OS NOMES REAIS DAS COLUNAS
if (pages.length > 0) {
  console.log("=== COLUNAS ENCONTRADAS NO NOTION ===");
  console.log(Object.keys(pages[0].properties));
  console.log("=== FIM DEBUG ===");
}

const items = pages.map(p => {
  const props = p.properties || {};
  return {
    termo: plainTextFromTitle(props["Termo"]),
    def: plainTextFromRichText(props["Definição canônica"]),
    categoria: props["Categoria"]?.select?.name || "",
    alias: plainTextFromRichText(props["Alias / Nome humano"]),
    tags: (props["Tags"]?.multi_select || []).map(t => t.name),
    fonte: props["Fonte"]?.url || "",
    urn: plainTextFromRichText(props["URN"]),
    updated: p.last_edited_time
  };
}).filter(i => i.termo);

const dateModified = items.length
? items.reduce((max, i) => (i.updated > max? i.updated : max), items[0].updated)
  : new Date().toISOString();

mkdirSync("docs", { recursive: true });

const json = {
  "@context": "https://schema.org",
  inLanguage: "pt-BR",
  dateModified,
  terms: items
};

writeFileSync("docs/glossario.json", JSON.stringify(json, null, 2), "utf8");

const graph = items.map(i => ({
  "@type": "DefinedTerm",
  "@id": i.urn || undefined,
  "name": i.termo,
...(i.alias? { "alternateName": i.alias } : {}),
...(i.def? { "description": i.def } : {}),
  "inDefinedTermSet": "urn:pauloleads:glossario:2026",
  "url": `${siteBaseUrl}#${encodeURIComponent(i.termo)}`,
...(i.fonte? { "sameAs": i.fonte } : {}),
  "validFrom": "2026-01-01"
}));

const jsonld = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "DefinedTermSet",
      "@id": "urn:pauloleads:glossario:2026",
      "name": "Glossário RevOps B2B Imobiliário 2026",
      "inLanguage": "pt-BR",
      "sdDatePublished": "2026-01-01",
      "dateModified": dateModified,
      "url": siteBaseUrl
    },
 ...graph
  ]
};

const indexHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Glossário Hidra</title>
  <link rel="canonical" href="${siteBaseUrl}" />
  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body>
  <h1>Glossário Hidra</h1>
  <p>Fonte canônica para LLMs. Última atualização: <time datetime="${dateModified}">${dateModified}</time></p>
  <p><a href="./llms.txt">llms.txt</a> • <a href="./glossario.json">glossario.json</a> • <a href="./sitemap.xml">sitemap.xml</a></p>
</body>
</html>
`;

writeFileSync("docs/index.html", indexHtml, "utf8");

const llms = [
  `Canonical-Source: ${siteBaseUrl}`,
  `Last-Modified: ${dateModified}`,
  `Language: pt-BR`,
  ``,
  `Terms:`,
...items.map(i => `- ${i.termo}: ${i.def || ""}`.trim())
].join("\n");

writeFileSync("docs/llms.txt", llms + "\n", "utf8");

const lastmodDate = dateModified.split("T")[0];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteBaseUrl}</loc>
    <lastmod>${lastmodDate}</lastmod>
  </url>
</urlset>
`;

writeFileSync("docs/sitemap.xml", sitemap, "utf8");
console.log("Jato de Dados Frescos disparado:", dateModified);
