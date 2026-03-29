# MissLite CF Worker

Minimal Misskey-compatible API backend running on Cloudflare Workers with D1 (SQLite).

## Structure

```
worker/src/
├── index.ts          # Request router and main handler
├── types.ts          # Env, DbUser, DbNote, Handler type definitions
├── helpers.ts        # Shared utilities (id gen, hashing, CORS, JSON, packing, auth)
├── schema.ts         # D1 database schema and migration
└── handlers/
    ├── auth.ts       # meta, admin/accounts/create, signin, signup
    ├── users.ts      # i, i/update, users/show
    ├── notes.ts      # notes/create, show, delete, timeline, reactions
    ├── admin.ts      # suspend, moderators, show-users, invites
    └── misc.ts       # emojis, stats, ping
```

## API Coverage

Misskey API endpoints implemented vs TODO. Checked = implemented, unchecked = not yet.

### Instance
- [x] `meta` — Instance metadata
- [x] `ping` — Health check
- [x] `stats` — Instance statistics
- [x] `emojis` — Custom emoji list (returns empty)
- [x] `endpoints` — List available API endpoints
- [ ] `announcements` — Instance announcements
- [ ] `server-info` — Server resource info
- [ ] `.well-known/nodeinfo` — NodeInfo for federation discovery

### Authentication
- [x] `admin/accounts/create` — Initial admin setup
- [x] `signin` — User login (returns token)
- [x] `signup` — Register with invite code
- [ ] `signout` — Invalidate session token
- [ ] `i/change-password` — Change password
- [ ] `i/2fa/*` — Two-factor authentication

### Users
- [x] `i` — Current authenticated user
- [x] `i/update` — Update profile (name, description, avatar)
- [x] `users/show` — Get user by ID or username
- [ ] `users/search` — Search users
- [ ] `users/followers` — User's followers
- [ ] `users/following` — User's following
- [ ] `following/create` — Follow a user
- [ ] `following/delete` — Unfollow a user
- [ ] `blocking/create` — Block a user
- [ ] `blocking/delete` — Unblock a user
- [ ] `mute/create` — Mute a user
- [ ] `mute/delete` — Unmute a user
- [ ] `i/favorites` — User's favorited notes
- [ ] `i/pin` — Pin a note
- [ ] `i/unpin` — Unpin a note

### Notes
- [x] `notes/create` — Create a note (text, CW, visibility, reply, renote)
- [x] `notes/show` — Get note by ID
- [x] `notes/delete` — Delete a note (owner or admin/mod)
- [x] `notes/timeline` — Public timeline (with pagination)
- [x] `notes/local-timeline` — Alias for timeline
- [x] `notes/global-timeline` — Alias for timeline
- [x] `users/notes` — User's notes
- [ ] `notes/search` — Full-text note search
- [ ] `notes/favorites/create` — Favorite a note
- [ ] `notes/favorites/delete` — Unfavorite a note
- [ ] `notes/polls/vote` — Vote on a poll
- [ ] `notes/state` — Note read/reaction state for current user
- [ ] `notes/mentions` — Notes mentioning current user
- [ ] `notes/conversation` — Thread view (reply chain)

### Reactions
- [x] `notes/reactions/create` — Add reaction to a note
- [x] `notes/reactions/delete` — Remove reaction from a note
- [ ] `notes/reactions` — List reactions on a note

### Admin / Moderation
- [x] `admin/suspend-user` — Suspend a user
- [x] `admin/unsuspend-user` — Unsuspend a user
- [x] `admin/moderators/add` — Grant moderator role
- [x] `admin/moderators/remove` — Revoke moderator role
- [x] `admin/show-users` — List all users (admin/mod)
- [x] `invite/create` — Generate invite code
- [x] `invite/list` — List invite codes (admin/mod)
- [ ] `admin/delete-account` — Delete a user account
- [ ] `admin/reset-password` — Reset user password
- [ ] `admin/update-meta` — Update instance metadata
- [ ] `admin/show-moderation-logs` — Moderation audit log

### Drive (File Upload)
- [ ] `drive/files/create` — Upload a file
- [ ] `drive/files/show` — Get file info
- [ ] `drive/files/delete` — Delete a file
- [ ] `drive/files` — List user's files

### Notifications
- [ ] `i/notifications` — User notifications
- [ ] `notifications/mark-all-as-read` — Mark all read

### Streaming (WebSocket)
- [ ] WebSocket streaming API for real-time updates

### Federation (ActivityPub)
- [ ] Outbox / Inbox for federation
- [ ] WebFinger (`.well-known/webfinger`)
- [ ] Actor endpoints

## Development

```bash
cd worker
npm install
npx wrangler dev          # Local dev server
npx wrangler deploy       # Deploy to Cloudflare
```

## Testing

```bash
cd worker
npm test                  # Run vitest tests
```
