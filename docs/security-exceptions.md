# Accepted production audit findings

## esbuild development-server request exposure

- Advisory: `GHSA-67mh-4wv8-2f99`
- Severity: moderate
- Dependency path:
  `@payloadcms/db-postgres -> drizzle-kit -> @esbuild-kit/esm-loader -> esbuild`
- Affected behavior: esbuild's optional development server can accept requests
  from arbitrary websites and expose its responses.
- Production exploit conditions: the application image runs Next standalone
  with `node server.js`; it never starts `esbuild --serve`, drizzle-kit or the
  migration development server. The migrator runs the Payload migration CLI as
  a bounded job and exposes no HTTP port.
- Decision: temporarily accepted because the advisory's stated patched
  `0.24.3` release does not exist and globally forcing an unrelated esbuild
  major could break Payload migration tooling.
- Compensating controls: drizzle/esbuild tooling is not present in the
  standalone runtime path, no development port is exposed, and production
  containers run as non-root.
- Review trigger: every Payload/db-postgres upgrade, or when drizzle-kit removes
  the legacy esbuild-kit dependency.
- Owner: platform engineering.

`pnpm audit --prod --audit-level=high` must still pass; no high or critical
finding is accepted.
