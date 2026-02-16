#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { Command } from "commander";
import OpenAI from "openai";
import { chromium } from "playwright";
import dotenv from "dotenv";

dotenv.config();

const program = new Command();

program
  .name("toolkit")
  .description("Screenshot a website and scaffold a static clone")
  .argument("<url>", "Website URL to capture")
  .option("-o, --out <dir>", "Output directory", "./output")
  .option("-w, --width <px>", "Viewport width", "1280")
  .option("-h, --height <px>", "Viewport height", "720")
  .option("--full-page", "Capture full page", false)
  .option("--model <name>", "OpenAI model name", "gpt-4.1-mini")
  .option("--no-ai", "Skip model generation")
  .action(async (url, options) => {
    const apiKey = process.env.OPENAI_API_KEY;
    const enableAi = Boolean(apiKey) && options.ai;
    if (!apiKey && options.ai) {
      console.warn("OPENAI_API_KEY is not set. Continuing without model integration.");
    }

    const outDir = path.resolve(process.cwd(), options.out);
    const width = Number(options.width);
    const height = Number(options.height);

    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error("Width and height must be numbers.");
    }

    fs.mkdirSync(outDir, { recursive: true });

    const screenshotPath = path.join(outDir, "screenshot.png");

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width, height } });

    try {
      await page.goto(url, { waitUntil: "networkidle" });
      await page.screenshot({ path: screenshotPath, fullPage: options.fullPage });
    } finally {
      await browser.close();
    }

    const scaffoldDir = path.join(outDir, "clone");
    fs.mkdirSync(scaffoldDir, { recursive: true });

    let assets: CloneAssets | null = null;
    if (enableAi) {
      try {
        assets = await generateCloneAssets({
          apiKey: apiKey as string,
          model: String(options.model),
          url,
          screenshotPath,
        });
      } catch (error) {
        console.warn(
          "Model generation failed, falling back to scaffold.",
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    if (assets) {
      writeGeneratedClone(scaffoldDir, assets);
    } else {
      writeScaffold(scaffoldDir, url, screenshotPath);
    }

    console.log("Done.");
    console.log(`Screenshot: ${screenshotPath}`);
    console.log(`Clone scaffold: ${scaffoldDir}`);
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function writeScaffold(dir: string, url: string, screenshotPath: string): void {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Clone of ${escapeHtml(url)}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="stage">
      <div class="frame">
        <img src="../screenshot.png" alt="Screenshot reference" />
      </div>
      <section class="notes">
        <h1>Clone scaffold</h1>
        <p>Use the screenshot as a reference to rebuild the layout.</p>
        <p>Model integration placeholder: generate HTML/CSS/JS from the screenshot.</p>
      </section>
    </main>
    <script src="script.js"></script>
  </body>
</html>
`;

  const css = `:root {
  color-scheme: light;
  font-family: "Iosevka", "JetBrains Mono", monospace;
  background: #f5f0e9;
  color: #1f1b16;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
}

.stage {
  width: min(1200px, 92vw);
  display: grid;
  gap: 2rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  align-items: start;
}

.frame {
  border: 2px solid #1f1b16;
  background: #fff9f0;
  padding: 1rem;
  box-shadow: 12px 12px 0 #e1d6c8;
}

.frame img {
  width: 100%;
  display: block;
}

.notes {
  border: 2px dashed #1f1b16;
  padding: 1.5rem;
  background: #fdf7ef;
}

.notes h1 {
  margin-top: 0;
}
`;

  const js = `// Placeholder for future autonomous reconstruction logic.
console.log("Clone scaffold ready.");
`;

  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
  fs.writeFileSync(path.join(dir, "styles.css"), css, "utf8");
  fs.writeFileSync(path.join(dir, "script.js"), js, "utf8");
}

function writeGeneratedClone(dir: string, assets: CloneAssets): void {
  fs.writeFileSync(path.join(dir, "index.html"), assets.html, "utf8");
  fs.writeFileSync(path.join(dir, "styles.css"), assets.css, "utf8");
  fs.writeFileSync(path.join(dir, "script.js"), assets.js, "utf8");
}

type CloneAssets = {
  html: string;
  css: string;
  js: string;
};

type GenerateOptions = {
  apiKey: string;
  model: string;
  url: string;
  screenshotPath: string;
};

async function generateCloneAssets(options: GenerateOptions): Promise<CloneAssets> {
  const client = new OpenAI({ apiKey: options.apiKey });
  const imageBase64 = fs.readFileSync(options.screenshotPath).toString("base64");
  const prompt = [
    "You are rebuilding a static webpage based on the screenshot.",
    "Return ONLY valid JSON with keys: html, css, js.",
    "- html must be a complete document.",
    "- css should be scoped to the generated markup.",
    "- js can be empty if not needed.",
    `Website URL: ${options.url}`,
  ].join("\n");

  const response = await client.responses.create({
    model: options.model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          {
            type: "input_image",
            image_url: `data:image/png;base64,${imageBase64}`,
            detail: "high",
          },
        ],
      },
    ],
    temperature: 0.2,
  });

  const outputText = (response as { output_text?: string }).output_text || extractOutputText(response);
  if (!outputText) {
    throw new Error("No model output returned.");
  }

  const jsonText = extractJson(outputText);
  const assets = JSON.parse(jsonText) as CloneAssets;
  validateAssets(assets);
  return assets;
}

type OutputItem = {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
};

function extractOutputText(response: OpenAI.Responses.Response): string {
  const chunks: string[] = [];
  const output = (response as { output?: OutputItem[] }).output ?? [];
  for (const item of output) {
    if (item.type !== "message") {
      continue;
    }
    for (const content of item.content ?? []) {
      if (content.type === "output_text") {
        chunks.push(content.text ?? "");
      }
    }
  }
  return chunks.join("\n").trim();
}

function extractJson(text: string): string {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No JSON object found in model output.");
  }
  return text.slice(firstBrace, lastBrace + 1);
}

function validateAssets(assets: CloneAssets): void {
  if (!assets || typeof assets !== "object") {
    throw new Error("Invalid model output.");
  }
  if (typeof assets.html !== "string" || typeof assets.css !== "string" || typeof assets.js !== "string") {
    throw new Error("Model output must include html, css, and js strings.");
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
