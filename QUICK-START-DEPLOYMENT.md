# AskMiro Quick Start Deployment
## Netlify + Namecheap + GitHub - FIXED CTA Overlap Issue

---

## ✅ ISSUE FIXED: CTA Overlap

**What was wrong:** CTA buttons were overlapping carousel navigation dots

**What I fixed:**
- ✅ Increased bottom padding on carousel content (150px)
- ✅ Moved navigation dots higher (60px from bottom)
- ✅ Added pointer-events to prevent interference
- ✅ Made caption non-interactive
- ✅ Mobile responsive adjustments (full-width buttons, proper spacing)
- ✅ Caption hidden on mobile for cleaner look

**Result:** Clean, professional carousel with no overlap ✓

---

## 🚀 DEPLOYMENT IN 3 STEPS (30 MINUTES)

### STEP 1: Buy Domain on Namecheap (5 minutes)

1. Go to **https://www.namecheap.com**
2. Search: **askmiro.co.uk**
3. Add to cart (around £8-12)
4. **Uncheck all upsells** (no hosting, email, SSL needed)
5. Checkout
6. **DON'T configure DNS yet** (we'll do this in Step 3)

---

### STEP 2: Deploy to Netlify via GitHub (15 minutes)

#### A. Create GitHub Account (if needed)

1. Go to **https://github.com**
2. Sign up (free)
3. Verify email

#### B. Create Repository

1. Click **"+"** (top right) → **"New repository"**
2. Repository name: **askmiro-website**
3. Visibility: **Public** (required for free Netlify)
4. Check: **"Add a README file"**
5. Click **"Create repository"**

#### C. Upload Files

**Upload these 6 files to your repository:**

1. **index.html** (the main website - FIXED version)
2. **robots.txt**
3. **sitemap.xml**
4. **_redirects**
5. **netlify.toml**
6. **thank-you.html**

**How to upload:**
1. Click **"Add file"** → **"Upload files"**
2. Drag all 6 files
3. Commit message: "Initial website upload"
4. Click **"Commit changes"**

#### D. Deploy to Netlify

1. Go to **https://www.netlify.com**
2. Click **"Sign up"**
3. Choose **"Sign up with GitHub"** (easiest)
4. Authorize Netlify
5. Click **"Add new site"** → **"Import an existing project"**
6. Click **"Deploy with GitHub"**
7. Select **askmiro-website** repository
8. **Build settings:** Leave everything empty
9. Click **"Deploy site"**
10. **Wait 1-2 minutes** for deployment

**You'll get a URL like:** `https://random-name-12345.netlify.app`

**Test it!** Click the URL - your website should load ✓

---

### STEP 3: Connect Custom Domain (10 minutes)

#### A. Add Domain to Netlify

1. In Netlify, go to **"Domain settings"**
2. Click **"Add custom domain"**
3. Enter: **www.askmiro.co.uk**
4. Click **"Verify"** → **"Add domain"**
5. Also add: **askmiro.co.uk** (without www)
6. Click **"Add domain"**

#### B. Get DNS Settings from Netlify

Netlify will show you:

**For askmiro.co.uk:**
- **Type:** A Record
- **Name:** @
- **Value:** (Netlify will show 4 IP addresses)

**For www.askmiro.co.uk:**
- **Type:** CNAME
- **Name:** www
- **Value:** `random-name-12345.netlify.app`

**COPY THESE VALUES!**

#### C. Configure DNS in Namecheap

1. Log in to **Namecheap**
2. Go to **"Domain List"**
3. Click **"Manage"** next to askmiro.co.uk
4. Click **"Advanced DNS"** tab
5. **Delete all existing records**

**Add A Records (you need to add 4 separate A records):**

Record 1:
- Type: **A Record**
- Host: **@**
- Value: **75.2.60.5** (first IP from Netlify)
- TTL: **Automatic**

Record 2:
- Type: **A Record**
- Host: **@**
- Value: **99.83.190.102** (second IP)
- TTL: **Automatic**

Record 3:
- Type: **A Record**
- Host: **@**
- Value: **13.225.123.35** (third IP)
- TTL: **Automatic**

Record 4:
- Type: **A Record**
- Host: **@**
- Value: **13.225.123.94** (fourth IP)
- TTL: **Automatic**

**Add CNAME Record:**
- Type: **CNAME Record**
- Host: **www**
- Value: **random-name-12345.netlify.app** (your Netlify URL)
- TTL: **Automatic**

6. Click **"Save All Changes"**

#### D. Wait for DNS Propagation (15-30 minutes)

**Check status:** https://www.whatsmydns.net
- Enter: **askmiro.co.uk**
- Should show Netlify IPs globally

#### E. Enable HTTPS in Netlify (Automatic)

1. Back in Netlify → **"Domain settings"**
2. Scroll to **"HTTPS"**
3. Click **"Verify DNS configuration"**
4. Netlify will automatically provision SSL certificate (1-5 minutes)
5. Toggle **"Force HTTPS"** to ON

---

## ✅ YOUR WEBSITE IS LIVE!

Visit: **https://www.askmiro.co.uk**

**Should see:**
- ✅ Green padlock (HTTPS)
- ✅ Professional carousel (no CTA overlap)
- ✅ All sections load correctly
- ✅ Mobile responsive
- ✅ Fast loading

---

## 🔧 QUICK UPDATES NEEDED (5 MINUTES)

### Update Google Codes

**Before going fully live, update:**

#### 1. Google Search Console Verification

**File:** index.html (line 13)

**Find:**
```html
<meta name="google-site-verification" content="ADD-CODE-HERE">
```

**Steps:**
1. Go to: https://search.google.com/search-console
2. Add property: `https://www.askmiro.co.uk`
3. Choose "HTML tag" method
4. Copy verification code
5. Replace `ADD-CODE-HERE` with your code
6. Save and commit to GitHub (Netlify auto-deploys)

#### 2. Google Analytics ID

**File:** index.html (search for `G-XXXXXXXXXX`)

**Find (appears twice):**
```javascript
script.src = 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX';
gtag('config', 'G-XXXXXXXXXX', {
```

**Steps:**
1. Go to: https://analytics.google.com
2. Create property: "AskMiro Website"
3. Get Measurement ID (e.g., `G-ABC123XYZ`)
4. Replace BOTH instances
5. Save and commit to GitHub

#### 3. Phone Number & Email

**Find and replace:**
- Phone: `020 7123 4567` → Your actual London number
- Email: `info@askmiro.co.uk` → Keep or change

---

## 📋 POST-LAUNCH CHECKLIST

### Day 1:
- [ ] Website live at https://www.askmiro.co.uk
- [ ] HTTPS enabled (green padlock)
- [ ] Test carousel (no overlap, auto-rotates)
- [ ] Test on mobile phone
- [ ] Test contact form
- [ ] GDPR cookie banner appears

### Week 1:
- [ ] Update Google verification code
- [ ] Update Google Analytics ID
- [ ] Submit sitemap to Google Search Console
- [ ] Request indexing in Search Console
- [ ] Create Google Business Profile

### Week 2:
- [ ] Submit to 10 UK directories
- [ ] Get first 3 Google reviews
- [ ] Create social media profiles
- [ ] Publish first blog post (optional)

---

## 🎯 EXPECTED TIMELINE

**Day 1:** Website is live
**Day 3:** Indexed by Google (appears in search)
**Week 2:** Ranking for brand name "AskMiro"
**Month 1:** Ranking page 5-10 for main keywords
**Month 3:** Ranking page 2-3 for "commercial cleaning London"
**Month 6:** **Page 1** for "commercial cleaning London"
**Month 12:** **#1-3** for main keywords

---

## 💰 COSTS

| Item | Cost | When |
|------|------|------|
| Domain (Namecheap) | £8-12 | Year 1 |
| Netlify Hosting | FREE | Forever |
| SSL Certificate | FREE | Auto-renew |
| GitHub | FREE | Forever |
| **TOTAL YEAR 1** | **£8-12** | One-time |
| **Renewals** | **£8-12** | Yearly |

---

## 🆘 TROUBLESHOOTING

### Website not loading after 30 minutes?

**Check:**
1. DNS propagation: https://www.whatsmydns.net
2. Netlify deploy status (should be green)
3. Namecheap DNS records match Netlify exactly
4. Clear browser cache (Ctrl+Shift+R)

### HTTPS not working?

**Fix:**
1. Wait 5-10 minutes after DNS propagates
2. In Netlify → Domain settings → HTTPS → "Verify DNS"
3. Click "Renew certificate" if needed

### CTAs still overlapping?

**Fix:**
1. Make sure you uploaded the FIXED index.html
2. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
3. Check on different browser
4. Wait for Netlify deployment to complete

### Form not working?

**Check:**
1. Form has `data-netlify="true"` attribute ✓
2. Netlify deployment successful
3. Go to Netlify dashboard → "Forms" tab
4. Test submission should appear there

---

## 📞 SUPPORT

**Namecheap:** https://www.namecheap.com/support/  
**Netlify:** https://docs.netlify.com  
**GitHub:** https://docs.github.com

---

## ✅ YOU'RE DONE!

**Your professional, SEO-optimized, GDPR-compliant website is now live for £8-12/year.**

**Next:** Follow the Google Console Setup Guide to start ranking #1 in London!

🚀 **Congratulations on launching AskMiro!**
