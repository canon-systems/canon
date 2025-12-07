# Sync Landing Page

This is the marketing landing page for Sync, deployed to the main domain (whatevermynamewillbe.com).

## Deployment

This landing page is configured for static export and can be deployed to any static hosting service:

- Vercel
- Netlify
- GitHub Pages
- AWS S3 + CloudFront
- etc.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The build outputs static files to the `out` directory.

## Configuration

- Update the domain references in `src/app/page.tsx` to point to your actual app subdomain
- Replace `whatevermynamewillbe.com` with your actual domain name
