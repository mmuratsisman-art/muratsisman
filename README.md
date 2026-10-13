# MURAT/LAB

**IDEAS INTO REALITY.**

A personal digital playground for exploring ideas, building AI-powered tools, developing automations, and turning real-world problems into working digital products.

**Live Website:** https://muratsisman.com.tr

---

## About the Project

MURAT/LAB is my personal portfolio and experimental workspace.

It brings together selected projects, practical experiments, and the ideas behind them.

The website is designed to be more than a static portfolio. It includes a content management system, project showcases, notes, and a dedicated space for experiments.

## Features

- **Project Portfolio** — Showcase selected digital products and experiments.
- **Content Management** — Supabase-backed administration for managing website content.
- **Lab & Notes** — Dedicated sections for experiments and written content.
- **Visitor Analytics** — Privacy-focused visitor measurement and reporting.
- **Responsive Design** — Mobile-friendly layouts with light and dark themes.
- **SEO Foundations** — Metadata, sitemap, robots.txt, and social sharing support.

## Technology

- Next.js 15
- TypeScript
- Tailwind CSS
- Supabase
- Vercel

## Local Development

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run build

```

Local development server: http://localhost:3000

Environment configuration examples are available in `.env.example`. Actual credentials and environment-specific values must remain outside version control.

## Project Structure

| Directory | Purpose |
|---|---|
| `src/app` | Application routes and pages |
| `src/components` | Reusable interface components |
| `src/data` | Default website content and configuration |
| `src/lib` | Application utilities and integrations |
| `supabase` | Database migrations and related setup |
| `docs/cms` | CMS architecture and operational documentation |
| `scripts` | Verification and development utilities |

## Development Approach

MURAT/LAB is developed iteratively, with an emphasis on practical solutions, clean interfaces, and safe deployment workflows.

Changes are validated locally, reviewed through GitHub pull requests, and tested in Vercel Preview environments before production deployment.

---

**Always learning. Always building. Always in beta.**