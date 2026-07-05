# Rowboat 🛶

Paddle through your rows. A VS Code extension for querying databases — Postgres, Redis and DynamoDB behind one extensible adapter interface.

## Status

Walking skeleton: Postgres end-to-end (config → tree → query → grid). Redis/DynamoDB adapters, autocomplete and history are next.

## Development

```bash
npm install
npm run db:postgres      # dockerized postgres, seeded (password: rowboat)
npm run watch            # esbuild watch
# press F5 → Extension Development Host opens; this repo is its own test workspace (.rowboat.json)
```

Tests:

```bash
npm test                 # unit (vitest)
RB_IT=1 npx vitest run   # + integration (needs db:postgres)
npm run test:vscode      # extension-host smoke
```

## Config

`.rowboat.json` at your workspace root — committable, secret-free. Passwords are prompted once and stored in your OS keychain (VS Code SecretStorage). See the JSON schema for fields (IntelliSense works in the file).
