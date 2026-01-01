# Release Strategy

This monorepo uses **lockstep versioning** with release branches for stable releases and hotfixes.

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
- Easy hotfix management without coordination overhead

### SemVer Guidelines

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Breaking changes | MAJOR | `1.0.0` → `2.0.0` |
| New features (backward-compatible) | MINOR | `1.0.0` → `1.1.0` |
| Bug fixes | PATCH | `1.0.0` → `1.0.1` |

## Branching Model

### Main Branch

- **Branch**: `main`
- **Purpose**: Active development (future minor/major work)
- **Protection**: Should not be force-pushed
- **Merges**: All feature work merges here first

### Release Branches

- **Branch pattern**: `release/<MAJOR>.<MINOR>`
- **Example**: `release/1.0`, `release/2.0`
- **Purpose**: Stabilization and patch releases for that minor version line
- **Lifetime**: Long-lived (until minor version is EOL)
- **Allowed changes**: Bug fixes, documentation updates, version bumps only
- **No features**: New features must go to `main`, not release branches

**Current active release branches**:
- `release/1.0` - Version 1.0.x line

## Tagging Model

### Tag Format

All releases use annotated git tags with SemVer:

```
v<MAJOR>.<MINOR>.<PATCH>
```

**Examples**:
- `v1.0.0` - First release from `release/1.0`
- `v1.0.1` - First hotfix for version 1.0
- `v1.1.0` - Next minor release from `release/1.1`

### Tag Rules

1. ✅ **DO**: Use annotated tags (`git tag -a`)
2. ✅ **DO**: Create tags from release branches only
3. ✅ **DO**: Push tags to origin after creating
4. ❌ **DON'T**: Move or delete tags after publishing
5. ❌ **DON'T**: Create tags from `main` branch

## Release Workflows

### Standard Release Flow (New Minor/Major)

**Example**: Releasing version `1.0.0`

```bash
# 1. Create release branch from main
git checkout main
git pull
git checkout -b release/1.0
git push -u origin release/1.0

# 2. Stabilize on release branch
# - Only bug fixes, docs, version prep
# - No new features

# 3. Update version in all affected package.json files
# For this monorepo, update:
cd content-authoring-eval
# Edit package.json: "version": "1.0.0"
git add content-authoring-eval/package.json
git commit -m "chore: Bump version to 1.0.0"
git push

# 4. Tag the release
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0

# 5. Create GitHub Release
# - Go to https://github.com/jackzhaojin/azure-da-mcp/releases/new
# - Select tag: v1.0.0
# - Generate release notes
# - Publish release
```

### Hotfix Flow (Patch Release)

**Example**: Releasing version `1.0.1` to fix a critical bug

```bash
# 1. Checkout release branch
git checkout release/1.0
git pull

# 2. Apply fix
# - Fix the bug
# - Write tests
# - Commit changes

# 3. Update version in package.json
cd content-authoring-eval
# Edit package.json: "version": "1.0.1"
git add content-authoring-eval/package.json
git commit -m "chore: Bump version to 1.0.1"
git push

# 4. Tag the patch release
git tag -a v1.0.1 -m "Release 1.0.1"
git push origin v1.0.1

# 5. Merge/cherry-pick fix back to main
git checkout main
git cherry-pick <commit-sha>  # or merge release/1.0 into main
git push

# 6. Create GitHub Release
# - Go to https://github.com/jackzhaojin/azure-da-mcp/releases/new
# - Select tag: v1.0.1
# - Generate release notes
# - Publish release
```

## Deployment Automation

### content-authoring-eval

Deployment to Oracle Cloud VM is automated via GitHub Actions:

**Trigger conditions**:
1. ✅ Push to `main` or `release/*` branches
2. ✅ Changes in `content-authoring-eval/**` or workflow file
3. ✅ Version in `content-authoring-eval/package.json` changed

**Workflow**: `.github/workflows/deploy-content-authoring-eval.yml`

**What happens**:
1. Version check (compares with previous commit)
2. Docker build (multi-arch: amd64, arm64)
3. Push to GitHub Container Registry
4. Deploy to Oracle VM via SSH
5. Health check verification

**Manual trigger**:
```bash
# Via GitHub Actions UI: workflow_dispatch
```

### functions (Future)

Azure Functions deployment automation TBD.

## Version Bump Checklist

Before creating a new release tag, ensure:

- [ ] All tests pass on the release branch
- [ ] Version number updated in `content-authoring-eval/package.json`
- [ ] CHANGELOG.md updated (if exists)
- [ ] Breaking changes documented (for major versions)
- [ ] Migration guide written (for breaking changes)
- [ ] Documentation updated to reflect new version
- [ ] All critical bugs fixed
- [ ] No known regressions

## Release Notes

### What to Include

- **New features**: Describe what's new
- **Bug fixes**: List critical fixes
- **Breaking changes**: Highlight incompatibilities
- **Migration steps**: For major versions
- **Contributors**: Credit contributors (if any)

### Example Release Note

```markdown
# Release v1.0.0

## New Features
- ✨ Grouped strengths display by dimension (Phase 40)
- 🎨 2x2 grid layout for better visual organization
- 🔧 Lockstep versioning deployment automation

## Bug Fixes
- 🐛 Fixed duplicate React key warnings in StrengthsCard

## Breaking Changes
None

## Deployment
- Docker image: ghcr.io/jackzhaojin/azure-da-mcp/content-authoring-eval:v1.0.0
- Deployed to Oracle Cloud VM via GitHub Actions

## Contributors
- @jackzhaojin
- Claude Sonnet 4.5 (AI pair programming)
```

## Guardrails and Best Practices

### DO ✅

- Create release branches for each `MAJOR.MINOR` version
- Use SemVer tags (`vMAJOR.MINOR.PATCH`)
- Keep release branches stable (patches only)
- Merge hotfixes back to `main`
- Test thoroughly before tagging
- Document breaking changes clearly
- Use conventional commits (`feat:`, `fix:`, `chore:`)

### DON'T ❌

- Add new features to release branches
- Force-push to release branches
- Move or delete published tags
- Skip version bumps in package.json
- Release directly from `main` branch
- Forget to merge hotfixes back to `main`

## Migration from Old Strategy

### Before (Ad-hoc Releases)

- ❌ No clear version number
- ❌ No release branches
- ❌ Manual deployment
- ❌ No hotfix workflow

### After (Lockstep Versioning)

- ✅ Clear SemVer version (`v1.0.0`)
- ✅ Release branches (`release/1.0`)
- ✅ Automated deployment on version changes
- ✅ Structured hotfix workflow

## Future Considerations

As the monorepo grows, we may consider:

1. **Independent versioning**: Per-project version numbers
2. **Automated changelogs**: Using conventional commits
3. **Release automation**: Tools like semantic-release or Lerna
4. **Multiple deployment targets**: Separate workflows per project

For now, lockstep versioning provides the simplest, clearest model.

## Related Documentation

- [README.md](./README.md) - Monorepo overview
- [CLAUDE.md](./CLAUDE.md) - AI context and development guide
- [.github/workflows/deploy-content-authoring-eval.yml](./.github/workflows/deploy-content-authoring-eval.yml) - Deployment workflow

## References

- [Nx: Versioning and Releasing Packages](https://nx.dev/blog/versioning-and-releasing-packages-in-a-monorepo)
- [Streamdal: Monorepo Version Strategy](https://medium.com/streamdal/monorepos-version-tag-and-release-strategy-ce26a3fd5a03)
- [Aviator: Release Management for Monorepos](https://www.aviator.co/blog/how-to-scale-release-management-for-monorepos/)
- [Microsoft: Monorepo with Independent Cycles](https://devblogs.microsoft.com/ise/streamlining-development-through-monorepo-with-independent-release-cycles/)

---

**Established**: 2025-01-01
**Current Version**: v1.0.0
**Active Release Branch**: release/1.0
