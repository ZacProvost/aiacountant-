# Password Reset - Supabase Configuration

This guide covers the Supabase configuration needed for password reset functionality to work properly.

## Required Supabase Dashboard Configuration

### 1. Site URL Configuration

In your Supabase Dashboard:

1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL** to your production URL:
   - Production: `https://yourdomain.com`
   - Development: `http://localhost:5174` (or your dev port)

This is the base URL where your app is hosted. Supabase will use this to construct redirect URLs.

### 2. Redirect URLs Whitelist

1. Go to **Authentication** → **URL Configuration**
2. Under **Redirect URLs**, add your allowed redirect URLs:
   - Production: `https://yourdomain.com`
   - Development: `http://localhost:5174`
   - If using multiple domains: Add all variants (with/without www)

**Important**: The redirect URL in your code (`window.location.origin`) must match one of these whitelisted URLs, otherwise Supabase will reject the redirect.

### 3. Email Templates (Optional but Recommended)

1. Go to **Authentication** → **Email Templates**
2. Customize the **Reset Password** template:

**Subject**: 
```
Réinitialisation de votre mot de passe Fiscalia
```

**Body (HTML)**:
```html
<h2>Réinitialisation de votre mot de passe</h2>
<p>Vous avez demandé à réinitialiser votre mot de passe pour votre compte Fiscalia.</p>
<p>Cliquez sur le lien ci-dessous pour continuer :</p>
<p><a href="{{ .ConfirmationURL }}">Réinitialiser mon mot de passe</a></p>
<p>Ce lien expire dans 1 heure.</p>
<p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
```

**Body (Plain Text)**:
```
Réinitialisation de votre mot de passe

Vous avez demandé à réinitialiser votre mot de passe pour votre compte Fiscalia.

Cliquez sur le lien ci-dessous pour continuer :
{{ .ConfirmationURL }}

Ce lien expire dans 1 heure.

Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
```

### 4. Email Provider Setup

Supabase sends emails for password resets. You need to configure an email provider:

#### Option A: Use Supabase's Built-in Email (Default)
- Works out of the box for development/testing
- Limited to 3 emails per hour on free tier
- Uses `noreply@mail.app.supabase.io`

#### Option B: Custom SMTP (Recommended for Production)

1. Go to **Authentication** → **Email Templates** → **SMTP Settings**
2. Configure your SMTP provider:
   - **Sender email**: `noreply@yourdomain.com` (or your verified sender)
   - **SMTP host**: `smtp.yourprovider.com`
   - **SMTP port**: `587` (or `465` for SSL)
   - **SMTP user**: Your SMTP username
   - **SMTP password**: Your SMTP password
   - **SMTP sender name**: `Fiscalia`

**Popular SMTP Providers**:
- **SendGrid**: Free tier (100 emails/day)
- **Mailgun**: Free tier (5,000 emails/month)
- **AWS SES**: Pay-as-you-go
- **Resend**: Free tier (3,000 emails/month)

### 5. Rate Limiting (Optional)

To prevent abuse, you can configure rate limits:

1. Go to **Authentication** → **URL Configuration**
2. Configure rate limiting:
   - **Rate limit email**: Maximum password reset emails per hour per user
   - Recommended: 3-5 per hour

## Testing Password Reset

### 1. Test in Development

```bash
# Start your dev server
npm run dev

# Navigate to login page
# Click "Mot de passe oublié?"
# Enter your email
# Check your inbox for the reset email
# Click the link in the email
# You should be redirected to the reset password screen
```

### 2. Verify Redirect URL

The redirect URL in the email should look like:
```
https://yourdomain.com/#access_token=...&type=recovery&redirect_to=https://yourdomain.com
```

Or in development:
```
http://localhost:5174/#access_token=...&type=recovery&redirect_to=http://localhost:5174
```

### 3. Common Issues

**Issue**: "Invalid redirect URL"
- **Solution**: Add your URL to the Redirect URLs whitelist in Supabase dashboard

**Issue**: "Auth session missing" error
- **Solution**: Make sure Site URL is configured correctly
- **Solution**: Don't manually clear the hash - let the app handle it after session is established

**Issue**: Email not received
- **Solution**: Check spam folder
- **Solution**: Verify email provider is configured (SMTP settings)
- **Solution**: Check Supabase logs for email sending errors

**Issue**: Link expired
- **Solution**: Password reset links expire after 1 hour by default
- **Solution**: Request a new reset link

## Security Considerations

1. ✅ **Always use HTTPS in production** - Password reset links contain sensitive tokens
2. ✅ **Configure rate limiting** - Prevent email bombing
3. ✅ **Use custom SMTP** in production - More reliable and professional
4. ✅ **Verify Site URL** - Prevents redirect attacks
5. ✅ **Monitor email logs** - Watch for abuse patterns

## Production Checklist

Before going to production, ensure:

- [ ] Site URL is set to your production domain
- [ ] Redirect URLs whitelist includes your production domain
- [ ] Email provider (SMTP) is configured
- [ ] Email templates are customized (optional)
- [ ] Rate limiting is configured
- [ ] HTTPS is enabled
- [ ] Tested password reset flow end-to-end

## Environment Variables

No additional environment variables are needed for password reset. The existing Supabase configuration is sufficient:

- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon/public key

These are already configured in your `.env` file.

