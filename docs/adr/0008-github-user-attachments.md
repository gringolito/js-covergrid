# Upload the Grid Map as a GitHub user attachment

A pull request comment can't carry the Grid Map itself. GitHub's comment sanitizer strips inline
`<svg>`, forbids `<style>` and `style=`, and allowlists URI **schemes** on `img src`, which rules out
`data:` URIs whatever the payload. PNG fails the same way as SVG: the `<img>` survives with `src`
deleted. Job summaries behave the same as comments. The image has to be hosted somewhere and linked.

The action uploads the Grid Map to the user-attachments endpoint, `POST
https://uploads.github.com/user-attachments/assets` on github.com. This is the endpoint behind
drag-and-drop in the GitHub UI and behind `gh`'s `--attach` flag. The comment embeds the
`https://github.com/user-attachments/assets/<uuid>` URL it returns.

The hosts follow the server the run is on. If the API is `api.<server host>` (github.com, GHE.com), the
upload goes to `uploads.<server host>`. Otherwise, as on GitHub Enterprise Server, it goes to
`<server>/api/uploads`. Only asset URLs on the server's host are accepted. See
[ADR-0009](./0009-github-enterprise-server.md).

## Why

GitHub serves its own attachments through `private-user-images.githubusercontent.com` with a JWT signed
per page view, and it decides who can see them by who can read the repository. We measured this:

- A fresh upload answers `404` to an anonymous request, even in a public repository. Once a comment
  references it, anonymous requests get a `302` to the file.
- For private and internal repositories, GitHub
  [documents](https://github.blog/changelog/2023-05-09-more-secure-private-attachments) that only people
  with access to the repository can view attachments.

So the picture is visible to exactly the people who can read the pull request, and it doesn't expire.

## Considered Options

- **A public image host.** Images from third-party hosts go through GitHub's camo proxy, which can't
  reach *"a server that requires authentication"*, so the URL has to be anonymously readable. For a
  private repository that discloses the package tree and coverage to anyone with the URL. Free hosts
  that need no account keep files only temporarily, and permanent ones reject anonymous uploads from
  GitHub Actions address ranges.
- **Embed the bytes.** Rejected by the sanitizer, as above. A comment character limit and a rasterizer
  dependency ([ADR-0006](./0006-composite-action-zero-dependencies.md)) would add further problems.

## Requirements for the document

**Presentation attributes only.** No `<style>`, `<script>`, `xlink:href`, or external references. Inside
`<img>`, scripts don't run and remote references don't load, so unsupported features fail silently.

## Consequences

**It needs a personal token.** The endpoint answers `404` to `GITHUB_TOKEN` and to GitHub App
installation tokens, whatever their permissions. GitHub
[confirmed this is intended](https://github.com/cli/cli/issues/14309). It also answers `404` to a personal
token whose owner lacks write access ([cli/cli#14302](https://github.com/cli/cli/issues/14302)). A
fine-grained token scoped to the repository needs only "Pull requests: Read and write", which the
maintainer verified. A classic token needs `repo`. The action therefore takes an `attachment-token`
input, and the upload is attributed to that token's owner. Only the upload uses it. The comment is still
posted with `github-token`, and the picture renders in a comment authored by `github-actions[bot]`.

**No token, no picture.** Without `attachment-token`, the publish step doesn't run, and the comment
explains how to enable the picture. There is no fallback host. A fallback would put private coverage on
a public URL whenever the token is missing, expired, or refused.

**The token is a credential.** It reaches the script through the environment, because composite `run:`
lines are echoed to the log. It reaches `curl` on stdin, so it never appears in argv. It is never
printed, even on failure.

**The endpoint has no REST documentation.** `gh` depends on it, so silent removal is less likely. Every
failure still degrades to a comment without the picture instead of a failed job. The warnings
distinguish a `401` (bad token) from a `404` (no write access, or not a personal token).

**No Content-Type check.** GitHub serves the attachment with the `content_type` we upload with. The
redirect target is a pre-signed S3 `GET` URL that answers `HEAD` with `403`, so a pre-check can't work.

**Unreferenced uploads.** Every pull request run uploads a new asset. Earlier assets stay attached to
older comment revisions or to nothing. GitHub has no API to delete them, and only people who can read
the repository can see them.

**Fork pull requests** get no secrets, so they get no picture. They also get no comment, because their
`GITHUB_TOKEN` is read-only.
