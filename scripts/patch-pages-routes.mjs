import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const staticOutputDir = ".vercel/output/static";
const routesPath = ".vercel/output/static/_routes.json";
const routes = JSON.parse(await readFile(routesPath, "utf8"));

routes.description = `${routes.description ?? "Cloudflare Pages routes"} Static pages are served directly; only runtime API/image requests invoke the worker.`;
routes.include = ["/api/*", "/_next/image*"];
routes.exclude = [];

await writeFile(routesPath, `${JSON.stringify(routes)}\n`);

async function collectHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const htmlFiles = [];

  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name === "cdn-cgi") {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      htmlFiles.push(...(await collectHtmlFiles(entryPath)));
      continue;
    }

    if (entry.name.endsWith(".html")) {
      htmlFiles.push(entryPath);
    }
  }

  return htmlFiles;
}

for (const htmlFile of await collectHtmlFiles(staticOutputDir)) {
  const relativePath = path.relative(staticOutputDir, htmlFile);
  if (
    relativePath === "index.html" ||
    relativePath === "404.html" ||
    relativePath === "500.html" ||
    relativePath === "_not-found.html"
  ) {
    continue;
  }

  const routePath = relativePath.slice(0, -".html".length);
  const indexPath = path.join(staticOutputDir, routePath, "index.html");
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, await readFile(htmlFile));
}

await rm(path.join(staticOutputDir, "_redirects"), { force: true });
