# Keeping the dashboard safe

This project is backed up in two places:

1. The Dropbox folder is a working copy.
2. GitHub is the off-computer version history.

## Before any work session

```bash
git pull --rebase
```

## After a meaningful change

```bash
git status
git add -A
git commit -m "Describe what changed"
git push
```

Never add `.env.local`. It contains live API credentials and is excluded by
`.gitignore`. Keep `.env.example` updated whenever a new environment variable
is required.

## Restore a known-good version

```bash
git log --oneline
git switch --detach <commit-id>
```

If that version is the one to keep, create a recovery branch before making
further changes:

```bash
git switch -c recover-known-good
```

## Database changes

Every database change must be a new numbered SQL file in
`supabase/migrations/`. Run the migration in Supabase before expecting the app
to save new metric columns. Migrations are committed to GitHub with the code,
so the schema can be rebuilt on a future computer.
