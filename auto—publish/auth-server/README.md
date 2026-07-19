# AutoPublish J4125 auth service

This directory is a deployment fixture and contract for the separately managed
J4125 service. It is not part of the Electron installer and is not connected to
the real server by local tests.

The service exposes only `/healthz` and the versioned authentication/session
endpoints. It stores only password hashes, opaque-token hashes, random device
identity hashes, sessions, product entitlements, and minimal audit data. It
does not migrate the historical `auth.json`; initialize a new SQLite database
and create the administrator explicitly. There is no public registration or
web administration UI.

Passwords must contain at least 6 characters. Temporary user passwords should
be replaced on first login; use a stronger mixed password for production
accounts because the six-character minimum is a compatibility floor.

Run the local contract tests with:

```powershell
node --test auth-server/tests/*.test.js
```

The service uses Node 22's built-in `node:sqlite` and has no runtime database
dependency. Run the local migration and backup checks with:

```powershell
node scripts/migrate.js
node scripts/backup.js /data/auth.db /backup/auth-$(Get-Date -Format yyyyMMdd).db
node scripts/restore-check.js /backup/auth-20260719.db
```

Manage accounts only over SSH, without putting passwords in arguments,
environment variables, shell history, or logs:

The deployed host wrapper provides short commands from the `auth-server`
directory:

```bash
./apctl create customer-001 --expires-at 2027-07-19T00:00:00.000Z
./apctl list
./apctl revoke customer-001
./apctl renew customer-001 2028-07-19T00:00:00.000Z
./apctl reset customer-001
./apctl devices customer-001
./apctl device-revoke customer-001 DEVICE_ROW_ID
./apctl sessions-revoke customer-001
```

`revoke` disables the account and immediately revokes its sessions. It does
not delete the account, entitlement history, or local customer workspace.

```powershell
node scripts/authctl.js admin create --login-name admin --permanent
node scripts/authctl.js user create --login-name customer-001 --expires-at 2027-07-19T00:00:00.000Z
node scripts/authctl.js user list
node scripts/authctl.js user disable --login-name customer-001
node scripts/authctl.js device list --login-name customer-001
node scripts/authctl.js device revoke --login-name customer-001 --device-id DEVICE_ROW_ID
node scripts/authctl.js session revoke-all --login-name customer-001
node scripts/authctl.js audit list
```

Use a server-only `.env` and data volume for deployment. The container runs as
non-root with a read-only root filesystem, a 512 MB memory limit, and only the
loopback host port published. Never copy these files into the Electron
workspace, package, Git repository, or client logs. Customer资料、文章、模板、
队列、发布记录、Cookie and workspace paths never enter this service.
