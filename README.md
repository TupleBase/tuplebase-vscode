# Rowboat 🛶

Paddle through your rows. A VS Code extension for querying databases — Postgres, Redis and DynamoDB behind one extensible adapter interface.

## Status

Walking skeleton: Postgres end-to-end (config → tree → query → grid). Redis/DynamoDB adapters, autocomplete and history are next.

## Development

```bash
npm install
npm run db:postgres      # dockerized postgres, seeded (password: rowboat)
npm run watch            # esbuild watch
# press F5 → Extension Development Host opens dev/playground (its .rowboat.json points at the docker postgres)
```

Testing (manual dev-host flow, test layers, resetting state): see [docs/TESTING.md](docs/TESTING.md).

## Config

`.rowboat.json` at your workspace root — committable, secret-free. Passwords are prompted once and stored in your OS keychain (VS Code SecretStorage). See the JSON schema for fields (IntelliSense works in the file).

Shape: `{ "version": 1, "groups": { "<group>": { "<connection>": { "adapter": "postgres" | "redis" | "dynamodb", ... } } } }`. Groups are folders that organise connections; a query runs against the connection bound to its file (there is no active environment). Set `"readonly": true` on a connection — or as a group default — to block writes.

Multi-root workspaces: config resolves from the **first** workspace folder only.
