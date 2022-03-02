#!/usr/bin/env node

// remove tokens from docker image

const fs = require('fs')
const path = require('path');

function UserProfileFolder() {
    let userProfileFolder = "~";
    if (process.env.CSIDL_PROFILE) {
        userProfileFolder = process.env.CSIDL_PROFILE;
    }
    if (process.env.HOME) {
      userProfileFolder = process.env.HOME;
    }
    return userProfileFolder;
}

const userProfileFolder = UserProfileFolder();

const vstsNpmauthRcFilePath = path.join(userProfileFolder, '.vstsnpmauthrc');
if (fs.existsSync(vstsNpmauthRcFilePath)) {
    fs.unlinkSync(vstsNpmauthRcFilePath)
}

const userNpmRcFilePath = path.join(userProfileFolder, '.npmrc');
if (fs.existsSync(userNpmRcFilePath)) {
    fs.unlinkSync(userNpmRcFilePath)
}

