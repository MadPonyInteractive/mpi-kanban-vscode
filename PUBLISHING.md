# Publishing Mpi-Kanban

This extension publishes to the Visual Studio Marketplace as:

```text
MadPonyInteractive.mpi-kanban
```

## One-time setup

1. Create or sign in with a Microsoft account.
2. Create a Visual Studio Marketplace publisher at:

   ```text
   https://marketplace.visualstudio.com/manage/publishers/
   ```

3. Use this publisher identity:

   ```text
   ID: MadPonyInteractive
   Name: Madpony Interactive
   ```

   The ID becomes part of the Marketplace extension identity and cannot be
   changed later.

4. Create an Azure DevOps personal access token with the Marketplace publish
   scope.
5. In the GitHub repository, add the token as an Actions secret:

   ```text
   VSCE_PAT
   ```

## Local validation

Run these before publishing:

```bash
npm ci
npm run package
npm exec -- vsce package
```

The generated `.vsix` file is ignored by git.

## Publish a new version

1. Update `version` in `package.json`.
2. Add a matching entry to `CHANGELOG.md`.
3. Commit the change.
4. Create and push a matching version tag:

   ```bash
   git tag v0.1.0
   git push origin main
   git push origin v0.1.0
   ```

The `Publish` GitHub Actions workflow runs on `v*.*.*` tags and publishes with:

```bash
npm exec -- vsce publish --pat "$VSCE_PAT"
```

The same workflow can also be started manually from the GitHub Actions tab.

## Icon requirements

The Marketplace icon is configured in `package.json`:

```json
"icon": "imgs/logo.png"
```

Use a PNG icon. The image must be at least 128x128 pixels; 256x256 is preferred.
Do not point the `icon` field at an SVG.
