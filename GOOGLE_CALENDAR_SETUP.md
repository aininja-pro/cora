# Google Calendar Integration Setup

## Prerequisites
You need to set up Google OAuth credentials to enable calendar integration.

## Steps to Configure Google Calendar OAuth

### 1. Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

### 2. Enable Google Calendar API
1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Google Calendar API"
3. Click on it and press "Enable"

### 3. Create OAuth 2.0 Credentials
1. Go to "APIs & Services" > "Credentials"
2. Click "+ CREATE CREDENTIALS" > "OAuth client ID"
3. If prompted, configure the OAuth consent screen first:
   - Choose "External" user type
   - Fill in required fields (app name, email, etc.)
   - Add scopes: `https://www.googleapis.com/auth/calendar`
   - Add test users if in development
4. For Application type, choose "Web application"
5. Add authorized redirect URIs:
   - For development: `http://localhost:3000/api/calendar/callback`
   - For production: `https://your-domain.com/api/calendar/callback`
6. Click "Create"

### 4. Save Your Credentials
After creation, you'll receive:
- Client ID
- Client Secret

Save these securely!

### 5. Add Credentials to Your Environment
Add these to your server `.env` file:

```env
# Google Calendar OAuth
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/callback
```

### 6. Update Frontend URL (if needed)
In your frontend code, update the calendar service URL if your backend runs on a different port.

## Testing the Integration

1. Restart your server after adding environment variables
2. Click "Connect Google Calendar" in the app
3. You'll be redirected to Google to authorize
4. After authorization, you'll be redirected back to your app
5. Your calendar events will sync automatically

## Troubleshooting

### Error 500 from Google
- Check that your Client ID and Secret are correct
- Verify the redirect URI matches exactly what's in Google Console
- Ensure the Google Calendar API is enabled

### "Not authenticated" errors
- User needs to connect their Google Calendar first
- Token may have expired - reconnect calendar

### Events not syncing
- Check Supabase connection
- Verify calendar_events table exists
- Check browser console for errors

## Security Notes

- Never commit Google credentials to version control
- Use environment variables for all sensitive data
- In production, use HTTPS for all OAuth flows
- Regularly rotate your client secret

## For Production

1. Update redirect URI to your production domain
2. Move from "Testing" to "Production" in Google Console
3. Complete OAuth verification if needed
4. Use proper SSL certificates