#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const subProjectRootFolder = path.join(__dirname, '..');
const subProjectNpmRcPath = path.join(subProjectRootFolder, '.npmrc');

if (!fs.existsSync(subProjectNpmRcPath)) {
    console.log(`.npmrc file does not exists`);
    process.exit(1)
}

const subProjectNpmRcFileContent = fs.readFileSync(subProjectNpmRcPath, 'utf8');

const subProjectNpmRcMatches = subProjectNpmRcFileContent.match(new RegExp("_authToken=.+", "ig"))

if (!subProjectNpmRcMatches || subProjectNpmRcMatches.length === 0) {
    console.log(`match does not contain anything`);
    process.exit(1);
}

let authTokenResult = subProjectNpmRcMatches[0];
authTokenResult = authTokenResult.replace("_authToken=","");

const npmBuildArg = " --build-arg AZURE_AUTH_TOKEN=" + authTokenResult

console.log(`##vso[task.setvariable variable=npmBuildArg]${npmBuildArg}`);

// only for debugging
if (process.env.TF_BUILD) {
    console.log(npmBuildArg);
}


