# Forge Hello World

This project contains a Forge app written in JavaScript that uses a background script to send events to a homepage feed.

See the [Forge documentation](https://developer.atlassian.com/platform/forge) to learn more about Forge.

## Requirements

Set up Forge if you haven't already done so. For instructions, see [Getting started](https://developer.atlassian.com/platform/forge/getting-started/).

## Quick start
- Install top-level dependencies:
```
npm install
```
### Background Scripts
- Install dependencies (inside the `static/bg-script` directory):
```
npm install
```
- Modify your background script by editing the files in `static/bg-script/src/`.
- Build your background script (inside the `static/bg-script` directory):
```
npm run build
```
### Issue panel
- Install dependencies (inside the `static/issue-panel` directory):
```
npm install
```
- Modify your issue panel by editing the files in `static/issue-panel/src/`.
Build your issue panel (inside the `static/issue-panel` directory):
```
npm run build
```

- Deploy your app by running:
```
forge deploy
```

- Install your app on an Atlassian site by running:
```
forge install
```

### Notes
- Use the `forge deploy` command when you want to persist code changes.
- Use the `forge install` command when you want to install the app on a new site.
- Once the app is installed on a site, the site picks up the new app changes you deploy without needing to rerun the install command.

## Support

See [Get help](https://developer.atlassian.com/platform/forge/get-help/) to get help and provide feedback.
