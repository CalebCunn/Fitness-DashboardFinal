# Sign-in setup: passwords and Google

## 1. Push (1 minute)
GitHub Desktop → **Push origin**. Wait about 3 minutes. Your personal app is not affected.

## 2. Supabase email settings (5 minutes)
supabase.com → your project → **Authentication**

1. **Sign In / Providers → Email**
   - Email: **on**
   - Confirm email: **on**
   - Minimum password length: **8**
   - Save.
2. **Emails → Reset Password**
   - Subject: `Your Apex password reset code`
   - Message: open `supabase/email-reset-password.html` in TextEdit, select all, copy, and paste over everything in the box.
   - Save.
3. **Emails → Confirm signup**
   - Should already be the branded "sign-in code" email from before. If not, paste in `supabase/email-sign-in-code.html`.

## 3. Test on your phone
1. Open apexrunning.app in a private tab. The arch draws, then the form rises.
2. **Create account** with a new email and a password. You get a code. Enter it.
3. Sign out, then **Sign in** with that email and password. No email needed.
4. **Forgot password?** → you get a code → enter it plus a new password.
5. Your existing account: Customise → Account → **Set password**. From then on you can sign in with a password.

## 4. Google sign-in (about 15 minutes, optional, free)

**A. Google Cloud**
1. console.cloud.google.com → create a project called **Apex**.
2. **APIs & Services → OAuth consent screen**
   - User type: External
   - App name: Apex
   - Support email: hello@apexrunning.app
   - Logo: `apex-app-icon-512.png` (in the brand folder)
   - Authorised domain: `apexrunning.app`
   - Privacy policy: https://apexrunning.app/#privacy
   - Terms: https://apexrunning.app/#terms
   - Save, then **Publish app**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Type: **Web application**
   - Authorised JavaScript origins: `https://apexrunning.app`
   - Authorised redirect URIs: the **Callback URL** shown in Supabase (step B1). It looks like `https://YOURPROJECT.supabase.co/auth/v1/callback`.
   - Create, then copy the **Client ID** and **Client secret**.

**B. Supabase**
1. Authentication → Sign In / Providers → **Google** → enable.
2. Paste the Client ID and Client secret. Copy the Callback URL it shows into Google (A3). Save.
3. Authentication → URL Configuration: make sure `https://apexrunning.app/**` is in Redirect URLs.

**C. Netlify** (the new public site)
1. Environment variables → add `REACT_APP_AUTH_GOOGLE` = `true` (not secret).
2. Deploys → Trigger deploy.

The white **Continue with Google** button now appears. If someone first signed up with an email and password, then later uses Google with the same email, Supabase links them to the same account.

**Note:** on the iPhone home-screen version, Google sign-in opens a browser sheet and then returns. Test it once there.

## Apple sign-in
Later, with the iPhone app: it needs the $99 Apple Developer account.
