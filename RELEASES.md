# Release Strategy

This monorepo uses **trunk-based releases**: cut version tags directly from `main`.

## Versioning Model

### Lockstep Versioning

All projects in this monorepo share a single SemVer version number:

```
MAJOR.MINOR.PATCH
```

**Example**: Version `1.2.3` means:
- `1` - Major version (breaking changes)
- `2` - Minor version (new features, backward-compatible)
- `3` - Patch version (bug fixes)

**Why lockstep?**
- Simplest mental model for a learning/OSS monorepo
- Single "current release" state for the entire repository
- Clear, unified release notes
- No coordination overhead

### SemVer Guidelines

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Breaking changes | MAJOR | `1.0.0` → `2.0.0` |
| New features (backward-compatible) | MINOR | `1.0.0` → `1.1.0` |
| Bug fixes | PATCH | `1.0.0` → `1.0.1` |

## Branching Model

### Trunk-Based Development

- **One long-lived branch**: `main`
- All work merges into `main` (directly or via short-lived feature branches)
- Releases are cut by tagging a commit on `main`
- No `release/*` branches — they added overhead without earning their keep

### Feature Branches (Optional)

For larger changes you may use short-lived branches (`feat/foo`, `fix/bar`) and merge via PR. These are not required for the release process.

## Tagging Model

### Tag Format

All releases use annotated git tags with SemVer:

```
v<MAJOR>.<MINOR>.<PATCH>
```

**Examples**:
- `v1.0.0` - First release
- `v1.0.2` - Patch release
- `v1.1.0` - Next minor release

### Tag Rules

1. ✅ **DO**: Use annotated tags (`git tag -a`)
2. ✅ **DO**: Tag from `main` after your changes are merged and tested
3. ✅ **DO**: Push tags to origin — the tag push triggers deployment
4. ❌ **DON'T**: Move or delete tags after publishing (force-moving a tag invalidates published artifacts)
5. ❌ **DON'T**: Tag uncommitted or unmerged work

## Release Workflow

### Standard Release

```bash
# 1. Make sure main is up to date and your changes are merged
git checkout main
git pull

# 2. Bump version in content-authoring-eval/package.json
# Edit: "version": "1.0.3"
git add content-authoring-eval/package.json
git commit -m "chore(content-authoring-eval): bump version to 1.0.3"
git push

# 3. Tag the release (annotated)
git tag -a v1.0.3 -m "Release 1.0.3"
git push origin v1.0.3
# ↑ tag push triggers the Oracle deploy workflow

# 4. Create the GitHub Release
gh release create v1.0.3 --generate-notes
# or with custom notes:
# gh release create v1.0.3 --title "v1.0.3" --notes-file notes.md
```

### Hotfix Release

A hotfix is just a normal release with a bug-fix commit. No special branching:

```bash
git checkout main
git pull
# ... fix the bug, commit, push ...
# bump version and tag as in "Standard Release" above
```

## Deployment Automation

### content-authoring-eval

Deployment to Oracle Cloud VM is automated via GitHub Actions:

**Trigger**:
- A `v*` tag is pushed AND the tag's commit touches `content-authoring-eval/**` or the workflow file itself
- Manual via `workflow_dispatch` (handy for re-deploying without a new tag)

**Workflow**: `.github/workflows/deploy-content-authoring-eval.yml`

**What happens**:
1. Multi-arch Docker build (linux/amd64, linux/arm64) from `content-authoring-eval/Dockerfile`
2. Push to GitHub Container Registry: `ghcr.io/jackzhaojin/azure-da-mcp/content-authoring-eval:vX.Y.Z` + `:latest`
3. SSH into Oracle VM, `docker pull`, `docker compose down && up -d`
4. Health check verification (60s timeout)

**Emergency / re-deploy without rebuild**: use `.github/workflows/deploy-only-content-authoring-eval.yml` to deploy a specific existing image tag (`deploy`, `restart`, or `rollback`).

### functions (Azure Functions MCP Server)

Azure Functions deploys via its own workflow (`main_jack-mcp-azure-ai-function.yml`) on pushes to `main`. Not tag-driven today.

## Version Bump Checklist

Before tagging, ensure:

- [ ] All relevant changes are merged to `main`
- [ ] Local `main` is up to date with `origin/main`
- [ ] Version updated in `content-authoring-eval/package.json` (bump committed and pushed)
- [ ] Working tree is clean
- [ ] No known critical regressions

## Release Notes

### What to Include

- **New features**: Describe what's new
- **Bug fixes**: List critical fixes
- **Breaking changes**: Highlight incompatibilities
- **Migration steps**: For major versions
- **Deployment info**: Image tag, deployment target

### Quick Generation

```bash
gh release create v1.0.3 --generate-notes
```

This pulls from commit messages and PRs since the previous tag — usually a fine starting point.

## Guardrails and Best Practices

### DO ✅

- Cut tags from `main` after work is merged and tested
- Use annotated SemVer tags (`vMAJOR.MINOR.PATCH`)
- Bump `content-authoring-eval/package.json` to match the tag
- Push commits before pushing the tag
- Use conventional commits (`feat:`, `fix:`, `chore:`)
- Cancel an in-flight deploy before re-tagging the same version

### DON'T ❌

- Tag a commit that isn't on `main`
- Move or delete a published tag (treat tags as immutable)
- Skip the `package.json` version bump
- Force-push to `main`
- Run two concurrent deploys for the same version

## Strategy Evolution

### v1.0.0 – v1.0.1: Release Branch Model

The original release strategy (2026-01-01) introduced a `release/1.0` branch with cherry-pick-back-to-main hotfix flow. Patterned after large-monorepo conventions.

### v1.0.2+: Trunk-Based (Current)

On 2026-05-12, `release/1.0` was merged back into `main` and deleted. Reasons:

- The release branch hadn't been touched in 4 months — it had drifted ~29 commits behind `main`
- The deploy workflow keys off tag push regardless of branch, so the branch wasn't load-bearing
- For a single-maintainer monorepo, the overhead of cherry-picking and keeping two branches in sync outweighed any benefit
- Tagging from `main` is the standard convention and matches what most teams expect

If a future minor version needs an LTS line (e.g., supporting both `v1.x` and `v2.x`), the release branch model can be reintroduced — but cross that bridge when there's an actual reason.

### v2.0: A2A Agent Platform Line (2026-06)

The `agents/` A2A platform is the **v2.0** line — a ground-up re-architecture (a mesh of A2A servers), hence a **major** bump rather than a feature increment on v1.x. Today it is **not yet tagged or deployed**: deployment is the last milestone (D6), and it currently runs locally + via a `cloudflared` tunnel. When it's ready to ship (Cloudflare Containers, M5), it gets its own `v2.x` tags from `main`.

- **v1.x** (`v1.1.0`) — legacy `content-authoring-eval` on Oracle; **frozen backup** (D5). Its tag-triggered deploy is the only automated deploy today.
- **v2.x** — the agents platform; version tracked in `agents/package.json` (`2.0.0`). Deploy mechanics TBD at M5 (separate from the v1.x Oracle workflow — never trigger `deploy-content-authoring-eval.yml` for platform work).

## Related Documentation

- [README.md](./README.md) - Monorepo overview
- [CLAUDE.md](./CLAUDE.md) - AI context and development guide
- [.github/workflows/deploy-content-authoring-eval.yml](./.github/workflows/deploy-content-authoring-eval.yml) - Tag-triggered build + deploy
- [.github/workflows/deploy-only-content-authoring-eval.yml](./.github/workflows/deploy-only-content-authoring-eval.yml) - Manual deploy/rollback of existing image tags

---

**Last Updated**: 2026-06-08
**Current Version**: v1.1.0 (legacy line, deployed) · v2.0 = `agents/` platform (in build, not yet tagged/deployed)
**Branch Model**: Trunk-based (tag from `main`)
