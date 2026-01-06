# 🚀 DEPLOYMENT UPUTSTVO (Srpski)

## ✅ TAČNA LISTA ENVIRONMENT VARIJABLI

### Šta treba dodati u hosting platformu:

```bash
VITE_API_BASE_PATH=https://api-production.creao.ai
VITE_MCP_API_BASE_PATH=https://api-production.creao.ai
```

**TO JE SVE!** Samo ove dve varijable.

---

## ❌ ŠTA Vام **NE** TREBA

**API KEY NIJE POTREBAN!**

- ❌ VITE_API_KEY
- ❌ API_KEY
- ❌ SECRET_KEY
- ❌ CREAO_API_KEY

**Zašto?** Aplikacija koristi JWT token autentifikaciju:
1. Korisnik se loguje sa email/password
2. Server vraća JWT token
3. Token se koristi za sve API pozive
4. Token se čuva u browser localStorage

---

## 📋 KORAK PO KORAK ZA VERCEL

### 1. Otvori Vercel Dashboard
```
https://vercel.com/your-username/your-project
```

### 2. Idi na Project Settings
Klikni na **Settings** tab

### 3. Otvori Environment Variables
Leva strana → **Environment Variables**

### 4. Dodaj Varijable
Dodaj tačno ove dve varijable:

| Name | Value |
|------|-------|
| `VITE_API_BASE_PATH` | `https://api-production.creao.ai` |
| `VITE_MCP_API_BASE_PATH` | `https://api-production.creao.ai` |

**Environments:** Selektuj sve (Production, Preview, Development)

### 5. Redeploy
- Idi na **Deployments** tab
- Klikni na 3 tačkice (...) pored poslednjeg deployment-a
- Klikni **Redeploy**

---

## 📋 KORAK PO KORAK ZA NETLIFY

### 1. Otvori Netlify Dashboard
```
https://app.netlify.com/sites/your-site-name
```

### 2. Idi na Site Settings
Klikni **Site settings**

### 3. Otvori Environment Variables
**Build & deploy** → **Environment** → **Environment variables**

### 4. Dodaj Varijable
Klikni **Add a variable** i dodaj:

**Prva varijabla:**
- Key: `VITE_API_BASE_PATH`
- Value: `https://api-production.creao.ai`

**Druga varijabla:**
- Key: `VITE_MCP_API_BASE_PATH`
- Value: `https://api-production.creao.ai`

### 5. Redeploy
- Idi na **Deploys** tab
- Klikni **Trigger deploy** → **Clear cache and deploy site**

---

## 📋 KORAK PO KORAK ZA CLOUDFLARE PAGES

### 1. Otvori Cloudflare Dashboard
```
https://dash.cloudflare.com/
```

### 2. Otvori Workers & Pages
**Workers & Pages** → Izaberi svoj projekat

### 3. Otvori Settings
**Settings** → **Environment variables**

### 4. Dodaj Varijable
Klikni **Add variable** za obe:

- `VITE_API_BASE_PATH` = `https://api-production.creao.ai`
- `VITE_MCP_API_BASE_PATH` = `https://api-production.creao.ai`

Environment: **Production** (i Preview ako želiš)

### 5. Redeploy
- **Deployments** tab
- **Create deployment** ili čekaj automatski trigger

---

## 🔍 KAKO PROVERITI DA LI JE ISPRAVNO

### 1. Posle Deployment-a

Otvori browser Console (F12) na vašem sajtu i ukucaj:

```javascript
console.log(import.meta.env.VITE_API_BASE_PATH)
```

**Trebalo bi da vidiš:**
```
https://api-production.creao.ai
```

**Ako vidiš `undefined`:**
- Environment varijable nisu pravilno podešene
- Nisi rebuild-ovao posle dodavanja varijabli

### 2. Testiranje Login-a

1. Otvori sajt
2. Pokušaj da se uloguješ
3. Otvori Network tab (F12 → Network)
4. Trebalo bi da vidiš pozive ka:
   ```
   https://api-production.creao.ai/me
   ```

**Ako vidiš grešku "failed to fetch":**
- Environment varijable nisu podešene
- Rebuild nije uspeo

---

## ⚠️ ČESTE GREŠKE

### Greška #1: "failed to fetch"
**Uzrok:** Environment varijable nisu podešene

**Rešenje:**
1. Proveri da li si dodao **obe** varijable
2. Proveri da li imena počinju sa `VITE_` (ne `REACT_APP_`)
3. Rebuild/redeploy aplikaciju

### Greška #2: Varijable ne rade
**Uzrok:** Vite environment varijable se ugrađuju u build-time, ne u runtime

**Rešenje:**
1. Dodaj varijable u hosting platformu
2. **OBAVEZNO rebuild** projekta (deploy ponovo)
3. Clear browser cache

### Greška #3: CORS error
**Uzrok:** API server ne dozvoljava zahteve sa vašeg domena

**Rešenje:**
- Ovo je problem na API serveru, ne u vašoj aplikaciji
- Kontaktiraj admina API servera

---

## 📝 CHECKLIST PRE DEPLOYMENT-A

- [ ] `.env.local` ima obe varijable lokalno
- [ ] Hosting platforma ima obe varijable podešene
- [ ] Build komanda je `npm run build`
- [ ] Output folder je `dist`
- [ ] Rebuild/redeploy je pokrenut posle dodavanja varijabli
- [ ] Login funkcioniše bez "failed to fetch" greške

---

## 💡 DODATNE INFORMACIJE

### Lokalno Testiranje

Ako testiraš lokalno, kreiraj `.env.local` fajl:

```bash
VITE_API_BASE_PATH=https://api-production.creao.ai
VITE_MCP_API_BASE_PATH=https://api-production.creao.ai
```

Onda pokreni:
```bash
npm run build
npm run preview
```

### Custom API Server

Ako koristiš svoj API server umesto `api-production.creao.ai`:

```bash
VITE_API_BASE_PATH=https://tvoj-api-server.com
VITE_MCP_API_BASE_PATH=https://tvoj-api-server.com
```

### Autentifikacija - Kako Radi

```
1. User unese email/password
   ↓
2. POST /auth/login sa credentials
   ↓
3. Server vraća JWT token
   ↓
4. Token se čuva u localStorage
   ↓
5. Svaki API poziv koristi: Authorization: Bearer <token>
   ↓
6. Token se validira pozivom GET /me
```

**Ne treba vam API key** jer autentifikacija koristi JWT tokene!

---

## 🆘 POMOĆ

Ako i dalje imate problem:

1. Proveri browser Console (F12)
2. Proveri Network tab za API pozive
3. Proveri da li environment varijable postoje:
   ```javascript
   console.log(import.meta.env)
   ```

---

**Sretno sa deployment-om! 🚀**
