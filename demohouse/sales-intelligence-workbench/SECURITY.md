# Security Policy

## Supported scope

The current `v0.10.0` self-hosted open-source release supports one workspace and one local administrator. It includes Supabase Auth, browser and CLI sessions, CSRF protection for cookie-authenticated mutations, and an internal account binding for workspace isolation. It does not expose public registration, email confirmation, password-recovery email, member, or role-management flows.

This is not a managed multi-tenant SaaS release. The default listener remains `127.0.0.1`. Do not expose the backend port directly to the public Internet; place the application behind an HTTPS reverse proxy and complete the deployment checks below.

## Reporting a vulnerability

Do not open a public issue containing credentials, customer data, Feishu content, Supabase identifiers, OpenViking resources, or exploitable details. Contact the repository owner through a private channel and include:

- affected version or commit;
- impact and reproduction steps;
- whether real data or credentials may have been exposed;
- a minimal redacted proof of concept.

Rotate any credential that appeared in chat, screenshots, logs, commits, or issue content. Removing a secret from the latest file does not remove it from Git history.

## Deployment requirements

- Keep Provider keys and the Supabase Service Role Key on the backend only.
- Keep the default loopback bind unless HTTPS, Secure Cookie, exact Origin allowlists, request limits, and network access controls are configured.
- Reset a forgotten password only through the interactive local reset command; never pass a password in shell arguments or logs.
- Use a dedicated Supabase Workspace and OpenViking namespace for each deployment.
- Import only Feishu content the operator is authorized to process.
- Store backups as private data and test restores on an isolated target.
- Keep audit events enabled for business writes, Provider probes, and workspace exports; audit payloads must remain metadata-only.
- Run configuration doctor, database migration smoke checks, the repository test suite, and release verification before upgrading.
- Do not describe this self-hosted release as a managed multi-tenant SaaS or an SLA-backed service.
