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

## GitHub Release on tag

The `Release` workflow runs on `v*.*.*` tags. It builds the VSIX, extracts the
matching `CHANGELOG.md` section, and creates a GitHub Release with the VSIX
attached. No Marketplace PAT or Azure subscription required.

Tag and push to trigger a release:

```bash
git tag v0.1.6
git push origin main
git push origin v0.1.6
```

Marketplace upload remains manual (see above). The GitHub Release is for
distribution, changelog visibility, and VSIX archiving.

To create a release for a tag that already exists, run the `Release` workflow
via **Actions -> Release -> Run workflow** and supply the tag name.

## Icon requirements

The Marketplace icon is configured in `package.json`:

```json
"icon": "imgs/logo.png"
```

Use a PNG icon. The image must be at least 128x128 pixels; 256x256 is preferred.
Do not point the `icon` field at an SVG.
