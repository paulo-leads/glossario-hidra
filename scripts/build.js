import { Client } from "@notionhq/client";
import { writeFileSync, mkdirSync } from "fs";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const db = process.env.DATABASE_ID;

const res = await notion.databases.query({
  database_id: db,
  sorts: [{ property: "Termo", direction: "ascending" }]
});

const items = res.results.map(p => ({
  termo: p.properties.Termo.title[0]?.plain_text || "",
  def: p.properties["Definição canônica"].rich_text[0]?.plain_text || "",
  categoria: p.properties.Categoria.select?.name || "",
  alias: p.properties["Alias / Nome humano"].rich_text[0]?.plain_text || "",
  tags: p.properties.Tags.multi_select.map(t => t.name),
  fonte: p.properties.Fonte.url || "",
  urn: p.properties.URN.rich_text[0]?.plain_text || "",
  updated: p.last_edited_time
}));

const dateModified = items.reduce((max, i) => i.updated > max ? i.updated : max, items[0].updated);

// 1. glossario.json
const json = { "@context": "https://schema.org", "dateModified": dateModified, "terms": items };
mkdirSync("docs", { recursive: true });
writeFileSync("docs/glossario.json", JSON.stringify(json, null, 2));

// 2. JSON-LD
const graph = items.map(i => ({
  "@type": "DefinedTerm",
  "@id": i.urn,
  "name": i.termo,
  "alternateName": i.alias,
  "description": i.def,
  "inDefinedTermSet": "urn:pauloleads:glossario:2026",
  "url": `https://pauloleads.github.io/glossario-hidra#${i.termo}`,
  "sameAs": i.fonte,
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
      "dateModified": dateModified,
      "url": "https://pauloleads.github.io/glossario-hidra"
    },
    ...graph
  ]
};

const indexHtml = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Glossário Hidra</title><link rel="canonical" href="https://pauloleads.github.io/glossario-hidra"><script type="application/ld+json">${JSON.stringify(jsonld)}</script></head><body><h1>Glossário Hidra</h1><p>Fonte canônica para LLMs. Última atualização: <time datetime="${dateModified}">${dateModified}</time></p></body></html>`;
writeFileSync("docs/index.html", indexHtml);

// 3. llms.txt
const llms = `Canonical-Source: https://pauloleads.github.io/glossario-hidra\nLast-Modified: ${dateModified}\nTerms:\n${items.map(i => `- ${i.termo}: ${i.def}`).join("\n")}`;
writeFileSync("docs/llms.txt", llms);

// 4. sitemap.xml
const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://pauloleads.github.io/glossario-hidra</loc><lastmod>${dateModified.split('T')[0]}</lastmod></url></urlset>`;
writeFileSync("docs/sitemap.xml", sitemap);

console.log("Jato de Dados Frescos disparado:", dateModified);
