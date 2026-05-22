# Sirius - AI Studio App

## Deploy to Render

### Prerequisites
- GitHub repository connected to Render
- Gemini API key

### Deployment Steps

1. **Go to [Render Dashboard](https://dashboard.render.com)**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository (`eriksokolowski1-cell/Sirius-`)

2. **Configure the Web Service**
   - **Name:** `sirius-app` (or your preferred name)
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run dev`
   - **Plan:** Free or Starter (depending on your needs)

3. **Set Environment Variables**
   - In Render dashboard, go to **Environment** tab
   - Add: `GEMINI_API_KEY` = `<your-gemini-api-key>`
   - You can get your key from [Google AI Studio](https://ai.google.dev/)

4. **Deploy**
   - Click "Create Web Service"
   - Render will automatically deploy when you push to `main` branch

### After Deployment
- Your app will be live at: `https://<your-service-name>.onrender.com`
- Render automatically rebuilds on each push to `main`
- Check logs in the Render dashboard if you encounter issues

### Troubleshooting
- **Build fails:** Ensure `package.json` is valid (we just fixed it)
- **App crashes:** Check environment variables are set correctly
- **Port issues:** The app listens on port 3000 by default (Render assigns its own port via `PORT` env var)

### Local Testing Before Deployment
```bash
npm install
npm run build
npm run dev
```

Visit `http://localhost:3000` to test locally.
