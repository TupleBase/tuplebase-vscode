# Install and get started

1. Install TupleBase from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=tuplebase.tuplebase) or [Open VSX](https://open-vsx.org/extension/tuplebase/tuplebase).
2. Open a folder in VS Code, select the TupleBase activity-bar icon, and choose **Create Config**.
3. Add a PostgreSQL connection from the explorer. TupleBase writes its non-secret settings to `.tuplebase.json` and prompts for the password when you first connect.
4. Open a `.sql` file and use the **Run** CodeLens or `cmd+enter` / `ctrl+enter`. TupleBase remembers the connection selected for that file.

## Minimal configuration

```jsonc
{
  "version": 1,
  "groups": {
    "development": {
      "readonly": true,
      "app-db": {
        "adapter": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "app",
        "user": "developer"
      }
    }
  }
}
```

Passwords and private keys do not belong in this file. TupleBase stores credentials through VS Code Secret Storage and also supports `${env:VARIABLE}` references for non-secret configuration values.
