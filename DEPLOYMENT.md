# Deployment Guide

This guide helps you deploy your training platform to various hosting services.

## ⚠️ Critical: Environment Variables

Before deploying, you **MUST** configure these environment variables:

```bash
VITE_API_BASE_PATH=https://api-production.creao.ai
VITE_MCP_API_BASE_PATH=https://api-production.creao.ai
```

**Without these variables, login and all API calls will fail with "failed to fetch" errors.**

## 🚀 Deployment Steps by Platform

### Vercel

1. **Build Settings:**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

2. **Environment Variables:**
   Go to Project Settings → Environment Variables and add:
   ```
   VITE_API_BASE_PATH=https://api-production.creao.ai
   VITE_MCP_API_BASE_PATH=https://api-production.creao.ai
   ```

3. **Deploy:**
   ```bash
   vercel
   ```

### Netlify

1. **Build Settings (netlify.toml):**
   ```toml
   [build]
     command = "npm run build"
     publish = "dist"
   ```

2. **Environment Variables:**
   Go to Site Settings → Build & Deploy → Environment and add:
   ```
   VITE_API_BASE_PATH=https://api-production.creao.ai
   VITE_MCP_API_BASE_PATH=https://api-production.creao.ai
   ```

3. **Deploy:**
   ```bash
   netlify deploy --prod
   ```

### Cloudflare Pages

1. **Build Configuration:**
   - Build command: `npm run build`
   - Build output directory: `dist`

2. **Environment Variables:**
   In the Cloudflare dashboard, add:
   ```
   VITE_API_BASE_PATH=https://api-production.creao.ai
   VITE_MCP_API_BASE_PATH=https://api-production.creao.ai
   ```

### GitHub Pages

1. **Update `vite.config.ts`:**
   ```typescript
   export default defineConfig({
     base: '/your-repo-name/',
     // ... rest of config
   })
   ```

2. **Create `.env.production`:**
   ```bash
   VITE_API_BASE_PATH=https://api-production.creao.ai
   VITE_MCP_API_BASE_PATH=https://api-production.creao.ai
   ```

3. **Deploy:**
   ```bash
   npm run build
   # Use gh-pages package or GitHub Actions
   ```

## 🔧 Troubleshooting

### "Failed to fetch" error on login

**Cause:** Missing or incorrect `VITE_API_BASE_PATH` environment variable.

**Solution:**
1. Check that environment variables are set in your hosting platform
2. Redeploy after adding the variables
3. Clear browser cache and try again
4. Check browser console for exact error messages

### Environment variables not working

**Remember:** Vite environment variables:
- Must start with `VITE_` to be exposed to the client
- Are baked into the build at build time (not runtime)
- Require a rebuild after changes

**Solution:**
1. Ensure variables start with `VITE_`
2. Rebuild the project: `npm run build`
3. Redeploy

### CORS errors

**Cause:** API server doesn't allow requests from your domain.

**Solution:**
1. Configure CORS on the API server to allow your deployment domain
2. Or use a proxy in production

## 📝 Pre-Deployment Checklist

- [ ] Environment variables configured in hosting platform
- [ ] `.env.example` copied to `.env.local` or `.env.production`
- [ ] API URLs verified and accessible
- [ ] Build command tested locally: `npm run build`
- [ ] Build output verified in `dist/` folder
- [ ] TypeScript checks pass: `npm run check:safe`

## 🌐 Custom API Server

If you're using a custom backend instead of `api-production.creao.ai`:

1. Update environment variables with your API URL:
   ```bash
   VITE_API_BASE_PATH=https://your-api-domain.com
   VITE_MCP_API_BASE_PATH=https://your-api-domain.com
   ```

2. Ensure your API server:
   - Accepts requests from your deployment domain (CORS)
   - Has the required endpoints (`/me`, `/data/store/v1/*`)
   - Supports JWT authentication with `Authorization: Bearer <token>` header

## 🔐 Authentication Flow

1. App loads and checks for existing auth token in localStorage
2. If token exists, validates it by calling `GET /me` endpoint
3. If valid, user is authenticated; if invalid, token is cleared
4. On login, user credentials are sent to API
5. API returns JWT token, which is stored in localStorage

**Important:** All API calls require the `VITE_API_BASE_PATH` to be set correctly.
