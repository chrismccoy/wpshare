# WP Share

This app turns a WordPress plugin or theme .zip into a private web page you can share with a link. Anyone with the link can browse every file with highlighting, copy or view single files, and download the whole package. An admin can review and remove everything that has been shared.

## Browsing the Code

- Shows every file in the package in a folder tree you can open and close.
- Pins the main plugin or theme file to the top of the tree and opens it first.
- Colors code by language for PHP, JavaScript, TypeScript, CSS, SCSS, Less, Twig, HTML, XML, JSON, YAML, Markdown, Python, shell scripts, and more.
- Highlights the settings block at the top of Markdown files.
- Shows a small icon next to each file based on its type.
- Turns file paths mentioned inside code into links that jump straight to that file.
- Shows the current file path, its language, and its line count above the code.
- Opens a plain text view of the current file in a popup that closes with Escape or a click outside it.
- Copies the full text of the current file with one click.
- Explains why a file has no preview, such as a binary file, a file too large to show, or the package preview limit being reached.
- Spends the preview limit on the main file first, then PHP files, then other text files, and minified or map files last.
- Shows the package name, version, number of files, total size, how long ago it was uploaded, and whether it is a plugin or a theme.

## Admin Tools

- Gives the admin a sign in page using a username and password set by the site owner.
- Lists every shared package with its name, link code, file count, size, time left, and upload date.
- Marks packages that have run out of time in red.
- Shows upload dates in a time zone chosen by the site owner.
- Splits the list into pages of 20 with previous and next buttons.
- Opens any package page in a new tab from the list.
- Deletes a single package after a confirm or cancel step.
- Deletes every package at once after a confirm step that shows how many will be removed.
- Updates the list and the total count right away after a delete, without reloading the page.
- Shows a "No packages yet" message when nothing has been shared.
- Tells the admin when a delete failed because they were signed out or the page needs a reload.
- Lets the admin sign out from the dashboard.

## Uploading a Plugin or Theme

- Lets you drag and drop a .zip onto the page or pick one from your device.
- Checks that the file is a .zip and under the size limit before it is sent.
- Shows the chosen file name and size with a ready to upload note.
- Shows a progress bar while the file uploads.
- Detects a plugin from the Plugin Name line in a PHP file, or a theme from the Theme Name line in style.css.
- Works whether the files sit at the top of the zip or inside one top level folder.
- Reads the package name, version, and description from that file.
- Takes you straight to the new share page when the upload finishes.
- Explains clearly why a zip was refused, such as a missing plugin or theme header, a damaged zip, too many files, or a file over the size limit.

## Link Expiry and Cleanup

- Lets you choose for a link to expire after 1 day, 7 days, 30 days, or never, with 7 days picked by default.
- Updates the expiry note on the upload page when you change the choice.
- Shows a not found page for an expired link and removes the package when it is visited.
- Removes expired packages and leftover files automatically every hour.
- Drops hidden tool folders such as .git, .claude, and .remember from every upload.
- Drops the vendor folder when a composer.json file sits beside it, and the node_modules folder when a package.json file sits beside it.
- Drops Mac system clutter files from uploads.
- Shows a note on the share page when a dependency folder was removed, with the command to restore it.

## Security and Privacy

- Limits each visitor to 20 uploads every 15 minutes and says when they can try again.
- Limits admin sign in to 10 attempts every 15 minutes per visitor.
- Protects every form and action against requests sent from other websites.
- Keeps the admin signed in with a protected session that is cleared on sign out.
- Refuses zips that try to write outside their own folder, contain shortcuts to other files, or repeat the same file path.
- Allows pages to load scripts and styles only from the site itself.
- Shows a clear error page with a way back home when a page is missing, a request fails, or access is denied.

## Settings and Branding

- Lets the site owner set the site name and the short line under it.
- Lets the site owner change the homepage heading, its colored second part, and the paragraph under it.
- Shows words wrapped in backticks in the homepage paragraph as code.
- Lets the site owner show or hide the small label above the homepage heading and change its text.
- Lets the site owner set the public web address used in share links.
- Lets the site owner change the upload size limit, the number of files allowed, the total unpacked size, and the size of any single file.
- Lets the site owner change how large a file can be to show a preview and the total preview size per package.

## Sharing and Downloading

- Gives every upload its own short random link.
- Uses separate link styles for plugins and themes, and redirects a link that uses the wrong style.
- Copies the share link with one click.
- Downloads the whole package as a .zip named after the plugin or theme.
- Leaves out removed folders and clutter from the downloaded .zip.
- Checks that the download is still available first and shows a message if it is missing or expired.
