## HRFlow PWA
Multi-organisation HR Attendance & Salary Platform

### Stack
- Frontend: Vite + React + Tailwind
- Auth + DB: Firebase Auth + Firestore
- Hosting: Vercel (auto-deploy from GitHub main branch)
- Team IDE: Firebase Studio (studio.firebase.google.com)

### Local Setup
1. git clone <repo-url>
2. npm install
3. cp .env.example .env.local → fill Firebase config
4. npm run dev

### Team Setup (Firebase Studio)
1. Go to studio.firebase.google.com
2. Import from GitHub → select hrflow-pwa repo
3. Firebase Studio auto-installs deps and loads .env
4. Start coding — push to GitHub triggers Vercel deploy

### Deploy
- Push to main → Vercel auto-deploys
- Manual: vercel --prod
