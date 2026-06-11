import { readFile, writeFile } from "node:fs/promises";

const routesPath = ".vercel/output/static/_routes.json";
const routes = JSON.parse(await readFile(routesPath, "utf8"));

routes.description = `${routes.description ?? "Cloudflare Pages routes"} Static pages are served directly; only runtime API/image requests invoke the worker.`;
routes.include = ["/api/*", "/_next/image*"];
routes.exclude = [];

await writeFile(routesPath, `${JSON.stringify(routes)}\n`);
