# Dockerfile for helping with testing custom builds without having to set up a
# project.
#
# Build:
#   docker build -t exifreader .
# You can select whether to use npm (default) or yarn by passing in `--build-arg pkg_mgr=<npm|yarn|yarn1>`:
#   docker build -t exifreader . --build-arg pkg_mgr=yarn
# Add `--no-cache` to force a rebuild, e.g. when there is a new version of exifreader (when using a locally built package this is not necessary).
#
# Run:
#   docker run -it --rm -v /path/to/image.jpg:/image -v [/path/to/file/with/custom/config.json:/custom.json] [-v /path/to/locally/built/package.tgz:/exifreader.tgz] exifreader
# The JSON file should contain what would be placed in package.json for the `exifreader` property, e.g. {include: {jpeg: true, exif: ["DateTimeDigitized"]}}.
# Build a local package with `npm pack`.

ARG pkg_mgr=npm

FROM node:22 AS base
WORKDIR /app

# npm
FROM base AS pkg-mgr-npm
RUN npm init -y
RUN npm pkg set type="module"
RUN npm install --save exifreader

# yarn 2+
FROM base AS pkg-mgr-yarn
RUN yarn set version stable
RUN yarn config set nodeLinker node-modules
RUN yarn init -y
RUN npm pkg set type="module"
RUN yarn add exifreader

# yarn 1
FROM base AS pkg-mgr-yarn1
RUN yarn set version classic
RUN yarn init -y
RUN npm pkg set type="module"
RUN yarn add exifreader

# Common for all package managers.
FROM pkg-mgr-${pkg_mgr} AS final
ARG pkg_mgr

# Create scripts for later use inside container.

RUN cat <<EOF > /app/run.sh
#!/bin/bash
set -e
# Install locally built package if available.
if [ -f /exifreader.tgz ]; then
    echo "Using locally built package."
    PACKAGE_NAME=/exifreader.tgz
    if [ "$pkg_mgr" = "yarn" ] || [ "$pkg_mgr" = "yarn1" ]; then
        yarn add \$PACKAGE_NAME
    else
        $pkg_mgr install \$PACKAGE_NAME
    fi
fi
# Load custom config file if it exists.
node custom-config.js
# Rebuild if there was a custom config file.
if [ -f /custom.json ]; then
    if [ "$pkg_mgr" = "yarn" ]; then
        yarn rebuild exifreader || (cat /tmp/*/build.log && false)
    elif [ "$pkg_mgr" = "yarn1" ]; then
        if [ -f /exifreader.tgz ]; then
            # There doesn't seem to be any way to rebuild a locally built package with yarn 1.
            yarn remove exifreader
        fi
        yarn add exifreader
    else
        npm rebuild exifreader
    fi
fi
# List size of custom-built bundle.
ls -l node_modules/exifreader/dist/exif-reader.js
# Extract and print image tags.
node exif.js
EOF
RUN cat /app/run.sh
RUN chmod +x /app/run.sh

RUN cat <<EOF > /app/custom-config.js
import {existsSync, writeFileSync} from 'fs';

if (existsSync('/custom.json')) {
    console.log('Using custom config file.');
    const customConfig = (await import('/custom.json', {with: {type: 'json'}})).default;
    const packageJson = (await import('./package.json', {with: {type: 'json'}})).default;
    packageJson.exifreader = customConfig;
    writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
}
EOF

RUN cat <<EOF > /app/exif.js
import ExifReader from 'exifreader';
const tags = await ExifReader.load('/image', {expanded: true, async: true});
console.log(tags);
EOF

ENTRYPOINT ["/app/run.sh"]
