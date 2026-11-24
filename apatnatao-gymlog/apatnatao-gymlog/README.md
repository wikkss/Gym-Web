# APATNATAO GymLog

Check-in logging for a gym. Static frontend in `public/`, Vercel Functions in `api/`, Postgres on Neon.

## Deploy

1. Put this folder in a GitHub repository.
2. In Vercel, choose Add New Project and import the repository. Framework preset: Other. No build command.
3. Add a database: in the Vercel project, open Storage or the Marketplace, add Neon, and connect it to the project. This creates the `DATABASE_URL` variable (`POSTGRES_URL` also works). If you use neon.tech directly, add `DATABASE_URL` yourself under Settings, Environment Variables, using the connection string from the Neon dashboard.
4. Before the first visit, add two more variables so the staff account is yours: `STAFF_EMAIL` and `STAFF_PASSWORD`. If you skip this, the test login is `staff@apatnatao.com` with password `staff123`. Change it before real use.
5. Deploy (or redeploy). The tables are created automatically on the first request.

## Use

- Staff log in with the staff email and password. They register walk-ins (temporary password `welcome123`), add membership time, suspend accounts, and scan member IDs at the desk.
- Members create an account with name, email, mobile number, and a password. Staff then add membership time at the desk, and check-in is allowed.
- The gym floor capacity is the `cap` number at the top of the script in `public/index.html`.

## Local test

```
npm i -g vercel
npm install
vercel env pull .env.local
vercel dev
```

## Demo mode

If the page cannot find the API (for example the file is opened directly, or no server is deployed), it switches to demo mode and keeps accounts in the browser. Staff login in demo mode: `staff@apatnatao.com`, password `staff123`. When the API exists, the app always uses it, even if the database reports an error.

## Pages

All pages are in `public/` and share `style.css` and `app.js`.

| Page | Who | What |
| --- | --- | --- |
| index.html | everyone | log in |
| signup.html | everyone | create account |
| member.html | members | today: pass, check-in, floor, stats |
| visits.html | members | visit history |
| staff.html | staff | front desk: stats, scan, inside now |
| members.html | staff | register, search, add membership time, suspend |
| reports.html | staff | peak hours, recent activity |

Each page checks who is logged in. Logged out visitors go to `index.html`, and a member or staff account opening the other role's page is sent to its own home page.

Demo mode needs the pages served from one origin. Opening the files directly works in Chrome. In Firefox, use a local server (for example `npx serve public`) or deploy to Vercel.

## Members page

Staff can change a member's time by any number of days (positive to add, negative to remove), suspend, or remove a member. Remove is soft: the member disappears from the main list, their login stops working, and they can be restored from the Removed tab. Every change is stored in the `member_log` table with a before and after snapshot, shown as History per member and as Recent changes. Undo reverses the latest change to a member, and an undo can itself be undone. The new `deleted_at` column and `member_log` table are created automatically on the first request after you redeploy.
