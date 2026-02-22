# Vercel environment variables

For **nfcschoolbe** on Vercel, add these in the project **Settings → Environment Variables** so photo upload works:

| Name | Value | Notes |
|------|--------|--------|
| `CLOUDINARY_CLOUD_NAME` | your cloud name | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | your API key | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | your API secret | From Cloudinary dashboard |
| `MONGODB_URI` | your MongoDB connection string | Required for DB |
| `JWT_SECRET` | your JWT secret | Required for admin auth |

Copy the same values from your local `nfcschoolbe/.env`. After saving, **redeploy** the project so the new variables are applied.
