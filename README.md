# toolkitcli

CLI toolkit that captures a website screenshot and scaffolds a static clone. If an API key is present, it will attempt to generate HTML/CSS/JS from the screenshot.

## Setup

1. Add your API key to `.env` (optional, enables model generation):

```
OPENAI_API_KEY=your_key_here
```

2. Install dependencies:

```
npm install
```

3. Install Playwright browsers:

```
npx playwright install
```

## Usage

```
npm run build
node dist/index.js https://example.com --out ./output
```

The scaffolded clone is written to `./output/clone`.

## AI options

- Use `--no-ai` to skip model generation.
- Use `--model <name>` to choose a model (default: `gpt-4.1-mini`).
