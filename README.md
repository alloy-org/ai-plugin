# AmpleAI Plugin

AmpleAI Plugin is an [Amplenote plugin](https://www.amplenote.com/help/developing_amplenote_plugins) that adds OpenAI & Ollama interactivity with Amplenote.

![Recent History](https://www.gitclear.com/chart_glimpses/ac650e04-42c2-40e8-9504-2b5667167bf8.png)

## Installation

1. Clone this repo. `git clone git@github.com:alloy-org/openai-plugin.git`
2. Install node and npm if you haven't already. 
3. Run `npm install` to install the packages.  
4. Copy `.env.example` to `.env` and fill in the environment variable for your OpenAI key

## Testing

Run `NODE_OPTIONS=--experimental-vm-modules npm test` to run all the tests.

Or, to run a specific test file, use: `NODE_OPTIONS=--experimental-vm-modules npm test -- test/plugin.test.js`

If it complains about jsdom being absent, run `npm install -D jest-environment-jsdom` and try again.

### Testing with JetBrains

https://public.amplenote.com/F4rghypGZSXEjjFLiXQTxxcR

### Run tests continuously as modifying the plugin

```bash
NODE_OPTIONS=--experimental-vm-modules npm run test -- --watch
```

## Technologies used to help with this project

* https://esbuild.github.io/getting-started/#your-first-bundle
* https://jestjs.io/
* https://www.gitclear.com

# Run Ollama

OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve
