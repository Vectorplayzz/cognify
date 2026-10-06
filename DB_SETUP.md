# Cognify Database Setup - MySQL/StackCP

## Credentials Provided
- **Host:** your-mysql-host
- **Port:** <db-port>
- **User:** your_db_name
- **Password:** set `DB_PASSWORD` in `.env` (never commit it)
- **Database:** your_db_name

## ⚠️ CRITICAL: IP Whitelisting (StackCP Only)

StackCP MySQL servers require your IP to be explicitly whitelisted.

### Step 1: Find Your Public IP
Run this command or visit https://whatismyipaddress.com:
```bash
curl ifconfig.me
# or
nslookup myip.opendns.com resolver1.opendns.com
```

Your current detected IP: **10.3.33.111** (from error log)

### Step 2: Add IP to StackCP Control Panel
1. Log into your StackCP dashboard: https://my.stackcp.net
2. Navigate to **MySQL Databases** section
3. Find your database `your_db_name`
4. Click **"Manage IP Access"** or **"Remote MySQL"**
5. Add your IP address: `10.3.33.111`
6. Save changes

### Step 3: Verify Database Exists
In StackCP panel:
1. Go to **MySQL Databases**
2. Confirm database `your_db_name` exists
3. Confirm user `your_db_name` exists and is linked to this database
4. Verify `DB_PASSWORD` in `.env` matches the StackCP panel (reset it there if needed)

### Step 4: Test Connection
```bash
npm run test:db
# or
node server/db-check.js
```

---

## Common Errors & Solutions

| Error | Cause | Fix |
|-------|-------|-----|
| `ER_ACCESS_DENIED_ERROR` | IP not whitelisted | Add IP in StackCP Remote MySQL |
| `ER_BAD_DB_ERROR` | Database doesn't exist | Create DB in StackCP panel |
| `ECONNREFUSED` | Wrong host/port | Verify your-mysql-host:<db-port> |
| `ETIMEDOUT` | Firewall blocking | Open port <db-port> |

---

## File Locations
- DB config: `server/db.js` (lines 30-37)
- API routes: `server/routes/api.js`
- Diagnostics: `server/diagnostics.js`
- Quick check: `server/db-check.js`

---

## After IP is Whitelisted
1. Wait 2-5 minutes for changes to propagate
2. Run `npm run test:db` to verify
3. Start server: `npm run dev:be`
4. Check logs: `logs/cognify-db-[date].log`
