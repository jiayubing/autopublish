# AutoPublish J4125 auth service

This directory is a deployment fixture and contract for the separately managed
J4125 service. It is not part of the Electron installer and is not connected to
the real server by local tests.

The service exposes only `/healthz` and the versioned authentication/session
endpoints. It stores password hashes, opaque-token hashes, sessions, product
entitlements, and minimal audit data. The first version has one SSH-managed
`admin` account and no public registration or web administration UI.

Run the local contract tests with:

```powershell
node --test auth-server/tests/*.test.js
```

Use a server-only `.env` and data volume for deployment. Never copy those files
into the Electron workspace, package, Git repository, or client logs.
