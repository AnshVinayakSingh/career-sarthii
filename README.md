# Career Sarthii

A local, bilingual exam preparation website built from the supplied prototype. It includes signup/login, practice history, interview session summaries, chat history, study document storage, and optional Gemini powered tutoring and mock-paper generation. Application data is stored in MongoDB Atlas.

## Run on Windows

1. Create a MongoDB Atlas cluster and database user; add your computer's IP address to the project's IP access list, then copy the application connection URI. Atlas requires a database user and an allowed client IP. URL-encode special characters in the database user's password before putting it in the URI.
2. Install Node.js 22.13 or newer and open PowerShell in this folder.
3. Copy `.env.example` to `.env`, then paste your MongoDB connection URI into `MONGODB_URI`. Set `GEMINI_API_KEY` too if you want AI features.
4. Run `npm install`, then `npm start`, and open <http://localhost:3000>.

MongoDB collections are created automatically in the database named by `MONGODB_DB` (default `career_sarthii`). The app creates its indexes at startup. Account data, attempts, chats, interviews, and uploaded papers remain in your Atlas database. Secrets stay in `.env` and are never sent to the browser.

### Set the Gemini key

Add the key to `.env` as `GEMINI_API_KEY=your-key`.

When no Gemini key is configured, AI chat explains that Gemini is unavailable and mock-paper generation uses a small included practice set. The original question bank is only sample content; real previous-year papers should be uploaded from the Study documents section. Uploaded PDFs and text notes can be used as context for AI chat.

## Data and privacy

- Passwords are stored as scrypt hashes; login uses an HttpOnly session cookie.
- Account records and uploaded files are stored in your MongoDB database.
- Uploaded PDF, TXT, and DOCX files are limited to 8 MB each. Gemini chat currently reads PDF and TXT study documents as context.
- A configured Gemini key sends the chat message and up to three recent PDF/TXT documents to Google's Gemini API for that response. Consult Google's current terms before using real personal or copyrighted material.
- Exam alerts link to official sites; they are not automatically monitored or sent as notifications.

## Important limits

This is a runnable local application, not a production deployment. The seeded question data is illustrative and does not claim to be authentic past exam papers. Before public hosting, add HTTPS, rate limits, email verification/password reset, account export, backups, and a deployment-specific secret manager.
