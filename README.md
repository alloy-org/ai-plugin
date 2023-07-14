# OpenAI Plugin

OpenAI-Plugin is an [Amplenote plugin](https://www.amplenote.com/help/developing_amplenote_plugins) that 
adds OpenAI prompts to Amplenote.

## Installation

1. Clone this repo. `git clone git@github.com:alloy-org/openai-plugin.git`
2. Install node and npm if you haven't already. 
3. Run `npm install` to install the packages.  
4. Copy `.env.example` to `.env` and fill in the environment variable for your OpenAI key

## Testing

Run `NODE_OPTIONS=--experimental-vm-modules npm test` to run the tests.

If it complains about jsdom being absent, run `npm install -D jest-environment-jsdom` and try again.

### Run tests continuously as modifying the plugin

```bash
NODE_OPTIONS=--experimental-vm-modules npm run test -- --watch
```

## Technologies used to help with this project

* https://esbuild.github.io/getting-started/#your-first-bundle
* https://jestjs.io/
* https://www.gitclear.com
