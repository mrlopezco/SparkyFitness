# Troubleshooting Missing Translations and Images

## Symptoms

- Navigation shows keys like `nav.diary`, `nav.checkin` instead of "Diary", "Check-in"
- Images are not loading
- Browser console shows 404 errors for `/locales/en/translation.json`

## Root Cause

The i18next library loads translations via HTTP requests to `/locales/{{lng}}/translation.json`. If these files aren't in the nginx HTML directory or aren't being served correctly, translations fail.

## Diagnostic Steps

### 1. Check if files exist in the container

SSH into your Coolify server and run:

```bash
# Get the container ID/name
docker ps | grep sparkyfitness-frontend

# Check if locales exist in the nginx html directory
docker exec sparkyfitness-frontend ls -la /usr/share/nginx/html/locales/

# Check if en translations exist
docker exec sparkyfitness-frontend cat /usr/share/nginx/html/locales/en/translation.json | head -20

# Check if images exist
docker exec sparkyfitness-frontend ls -la /usr/share/nginx/html/images/
```

**Expected output**: You should see the `en/` folder and `translation.json` file.

**If files are missing**: The Vite build didn't copy the `public/` folder. This is the main issue.

### 2. Check nginx configuration

```bash
# Check if SPARKY_FITNESS_FRONTEND_URL is set correctly
docker exec sparkyfitness-frontend env | grep SPARKY

# Check the generated nginx config
docker exec sparkyfitness-frontend cat /etc/nginx/conf.d/default.conf | grep -A 10 "location.*locales"
```

**Expected**: You should see your domain `https://fitness.lopez-coll.com` in the CORS headers.

### 3. Test direct access

From your browser, try accessing:

```
https://fitness.lopez-coll.com/locales/en/translation.json
```

**Expected**: You should see the JSON file with translations.

**If 404**: Files aren't in the container.

**If CORS error**: The `SPARKY_FITNESS_FRONTEND_URL` environment variable is wrong.

## Solutions

### Solution 1: Files Missing from Container (Most Likely)

This happens if Vite didn't copy the `public/` folder during build. 

**Root cause**: The build command changed from `pnpm run build` to `pnpm exec vite build`, but this should still work. However, if there's a custom `publicDir` setting or if the WORKDIR change broke the paths, it could fail.

**Fix**: Update the Dockerfile to ensure the `public/` folder is explicitly handled:

```dockerfile
# In Dockerfile.frontend, after line 58, before the build:
# Ensure public dir is in the right place
WORKDIR /app/SparkyFitnessFrontend

# Build will automatically copy public/ to dist/
RUN NODE_ENV=production pnpm exec vite build

# Verify the build output
RUN ls -la dist/ && ls -la dist/locales/ || echo "WARNING: locales not in dist!"
```

### Solution 2: CORS Configuration Issue

If files exist but browser can't load them due to CORS:

**Check**: The `SPARKY_FITNESS_FRONTEND_URL` environment variable in Coolify must EXACTLY match your browser URL:
- ✅ Correct: `https://fitness.lopez-coll.com`
- ❌ Wrong: `http://fitness.lopez-coll.com` (http vs https)
- ❌ Wrong: `https://fitness.lopez-coll.com/` (trailing slash)
- ❌ Wrong: `https://www.fitness.lopez-coll.com` (www subdomain)

**Fix in Coolify**:
1. Go to Environment Variables
2. Update `SPARKY_FITNESS_FRONTEND_URL=https://fitness.lopez-coll.com`
3. Redeploy

### Solution 3: Vite publicDir Override

If there's a custom `publicDir` in `vite.config.ts`:

```typescript
export default defineConfig({
  publicDir: 'public', // Ensure this points to the correct folder
  // ...
})
```

Currently, the config doesn't override `publicDir`, so it uses Vite's default (`public/`), which should work.

## Quick Fix Commands

If files are missing from the container, the fastest fix is to rebuild:

```bash
# In Coolify, trigger a rebuild without cache
# or from your server:
docker compose -f docker/docker-compose.coolify.yml build --no-cache sparkyfitness-frontend
docker compose -f docker/docker-compose.coolify.yml up -d sparkyfitness-frontend
```

## Prevention

To prevent this issue:

1. **Add a build verification step** in `Dockerfile.frontend`:
   ```dockerfile
   RUN NODE_ENV=production pnpm exec vite build && \
       ls dist/locales/en/translation.json || \
       (echo "ERROR: Translation files not built!" && exit 1)
   ```

2. **Test locally before deploying**:
   ```bash
   cd SparkyFitnessFrontend
   pnpm exec vite build
   ls -la dist/locales/
   ```

## Browser Console Debugging

Open browser DevTools (F12) and check:

1. **Network tab**: Look for failed requests to `/locales/en/translation.json`
   - 404 = files not in container
   - CORS error = SPARKY_FITNESS_FRONTEND_URL mismatch

2. **Console tab**: Look for i18next errors:
   - `i18next::backendConnector: loading namespace translation for language en failed` = Can't load translations

3. **Application tab → Local Storage**: Check if language preference is set:
   - Key: `i18nextLng`
   - Value: `en` (or your language)

## Still Not Working?

If translations still don't load after trying these steps:

1. **Check container logs**:
   ```bash
   docker logs sparkyfitness-frontend
   ```

2. **Check nginx error logs**:
   ```bash
   docker exec sparkyfitness-frontend tail -f /var/log/nginx/error.log
   ```

3. **Verify build output locally**:
   ```bash
   cd SparkyFitnessFrontend
   NODE_ENV=production pnpm exec vite build
   ls -R dist/
   ```
   The `dist/` folder should contain:
   - `dist/index.html`
   - `dist/assets/` (JS/CSS bundles)
   - `dist/locales/en/translation.json`
   - `dist/images/`
   - `dist/manifest.json`
