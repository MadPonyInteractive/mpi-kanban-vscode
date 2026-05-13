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
   Name: MadPonyInteractive
   ```

   The ID becomes part of the Marketplace extension identity and cannot be
   changed later.

## Manual publishing

Manual Marketplace updates are the default release process for this extension.
The Azure DevOps/GitHub Actions flow is optional and not currently required.

Run these before publishing:

```bash
npm ci
npm run package
npm exec -- vsce package
```

The generated `.vsix` file is ignored by git.

For a new Marketplace version:

1. Update `version` in `package.json`.
2. Add a matching entry to `CHANGELOG.md`.
3. Run `npm exec -- vsce package`.
4. Open the publisher page:

   ```text
   https://marketplace.visualstudio.com/manage/publishers/MadPonyInteractive
   ```

5. Open the `Mpi-Kanban` extension menu.
6. Choose `Update`.
7. Upload the new `.vsix`, for example:

   ```text
   mpi-kanban-0.1.1.vsix
   ```

8. Wait for Marketplace verification to complete.

## Optional GitHub Actions publishing

The repository includes a `Publish` workflow, but it requires a Marketplace
Personal Access Token. Do not create an Azure subscription just for this. If
Azure DevOps asks for billing/subscription setup, skip automation and use the
manual process above.

To enable automation later:

1. Create an Azure DevOps personal access token with the Marketplace publish
   scope.
2. In the GitHub repository, add the token as an Actions secret:

   ```text
   VSCE_PAT
   ```

3. Commit the version bump and changelog update.
4. Create and push a matching version tag:

   ```bash
   git tag v0.1.2
   git push origin main
   git push origin v0.1.2
   ```

The `Publish` GitHub Actions workflow runs on `v*.*.*` tags and publishes with:

```bash
npm exec -- vsce publish --pat "$VSCE_PAT"
```

## Icon requirements

The Marketplace icon is configured in `package.json`:

```json
"icon": "imgs/logo.png"
```

Use a PNG icon. The image must be at least 128x128 pixels; 256x256 is preferred.
Do not point the `icon` field at an SVG.
