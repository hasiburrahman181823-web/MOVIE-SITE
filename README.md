# CineNova+ Advanced Full-Stack Streaming Platform

## New features
- Real local movie/video upload through the Admin Panel
- Poster image upload
- HTTP Range-based video streaming at `/stream/:id`
- Streaming seek support with HTML5 video controls
- Movie draft/published status
- Movie editing and deletion
- View counter
- Admin statistics: users, movies, published, drafts, views and uploaded file count
- Registered-user management view
- SQLite persistence
- JWT authentication and admin-only APIs

## Run
1. Install Node.js 18+
2. Open this folder in VS Code
3. Run:
   ```bash
   npm install
   copy .env.example .env
   npm start
   ```
4. Open http://localhost:5000

Default admin:
- Email: `admin@cinenova.local`
- Password: `Admin@123`

Change these values in `.env` before using the project outside local testing.

## Upload workflow
1. Login using the admin account.
2. Open **Admin**.
3. Fill in title, metadata, poster and video.
4. Click **Save movie**.
5. A locally uploaded video will stream through `/stream/:id`.

## Important production notes
This is a working local/self-hosted starter, not a Netflix-scale production service. For deployment, add object storage/CDN, transcoding to HLS/DASH, signed URLs, DRM if required, rate limiting, virus scanning, stronger validation, backups, HTTPS, monitoring, payment/entitlement logic and only use content you are legally licensed to distribute.
