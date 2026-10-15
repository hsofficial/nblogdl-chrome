# Agent instructions

## Required startup and per-turn history

- Before inspecting or changing implementation, read `RESEARCH_NOTES.md` in this folder. It is the handoff record and must be read again after a context reset or agent change.
- At the start of each work turn, append a dated entry to `RESEARCH_NOTES.md` with the user's request, current state, and intended work. At the end of that turn, update the entry with concrete changes, verification results, limitations, and next steps.
- Preserve previous entries. Record decisions and why they changed; never present an unverified hypothesis or planned check as a completed result.
- Cite files and commands for local evidence; cite author, access date, and URL for external evidence. Do not include credentials or private browsing data in the history.

## Communication and implementation

- Respond in Korean using formal language unless the user requests another language.
- Distinguish confirmed facts, implementation assumptions, and unverified behavior.
- No emojis in code, comments, or output. Runtime logs and stdout strings must be ASCII only. Korean user-facing UI and documentation are allowed.
- Add useful progress/error logging and inline comments for non-obvious logic and parameters.
- Prefer native Chrome APIs and standard JavaScript. Keep dependencies and permissions minimal.
