#!/usr/bin/env node

const fs = require('fs')
const { spawnSync } = require('child_process')
const path = require('path')

const azureCompanyName = "qdraw";
const azureFeedName = "demo";

if (process.env.AZURE_AUTH_TOKEN == 'default') {
    process.env.AZURE_AUTH_TOKEN = ''
}

function UserProfileFolder() {
    let userProfileFolder = '~'
    if (process.env.CSIDL_PROFILE) {
        userProfileFolder = process.env.CSIDL_PROFILE
    }
    if (process.env.HOME) {
        userProfileFolder = process.env.HOME
    }
    return userProfileFolder
}

function RunNpmCiInstall() {
    const subProjectRootFolder = path.join(__dirname, '..')

    const subProjectPackageLockPath = path.join(
        subProjectRootFolder,
        'package-lock.json'
    )

    if (
        fs.existsSync(subProjectPackageLockPath) &&
        process.env.npm_command === 'ci'
    ) {
        console.log('next step: npm ci')
        spawnSync('npm', ['ci', '--ignore-scripts'], { stdio: 'inherit' })
    } else {
        console.log('next step: npm install')
        spawnSync('npm', ['install', '--ignore-scripts'], {
            stdio: 'inherit',
        })
    }
}

function WriteFileIfChanged(filePath, fileContent, uiName) {
    if (!fs.existsSync(filePath)) {
        fs.closeSync(fs.openSync(filePath, 'w'))
    }

    const file = fs.readFileSync(filePath, 'utf8')

    let fileIsChanged = false
    // Check if .npmrc is already modified by this script
    if (file !== fileContent) {
        // Create .npmrc with azure package urls
        fs.writeFileSync(filePath, fileContent)

        // Set chmod
        fs.chmodSync(filePath, 0o600)

        fileIsChanged = true
        console.log(`[v] update ${uiName} done`)
    } else {
        console.log(`skip update ${uiName} in user folder`)
    }
    return fileIsChanged
}

let anyNpmVstsRcFileChanged = false

// project npmrc file
let projectNpmRcFileContent =
    `@qdraw-components:registry=https://pkgs.dev.azure.com/${azureCompanyName}/_packaging/${azureFeedName}/npm/registry/` +
    '\n' +
    `always-auth=true` + '\n'+
    `; do NOT manual edit this file`

const subProjectRootFolder = path.join(__dirname, '..')
const subProjectNpmRcPath = path.join(subProjectRootFolder, '.npmrc')

let azureAuthTokenNpmRcContent = ''
if (process.env.AZURE_AUTH_TOKEN) {
    azureAuthTokenNpmRcContent =
        '\n' +
        `//pkgs.dev.azure.com/${azureCompanyName}/_packaging/${azureFeedName}/npm/registry/:_authToken=${process.env.AZURE_AUTH_TOKEN}` +
        '\n' +
        `//pkgs.dev.azure.com/${azureCompanyName}/_packaging/${azureFeedName}/npm/:_authToken=${process.env.AZURE_AUTH_TOKEN}` +
        '\n' +
        '\n' +
        '; azure -- DO NOT MANUAL MODIFY THIS FILE'

    projectNpmRcFileContent += azureAuthTokenNpmRcContent

    console.log('--azure content added to project sto.fe.* npmrc file')
}

if (
    WriteFileIfChanged(
        subProjectNpmRcPath,
        projectNpmRcFileContent,
        'project sto.fe.* npmrc file'
    )
) {
    anyNpmVstsRcFileChanged = true
}

if (process.env.AZURE_AUTH_TOKEN) {
    const userProfileFolder = UserProfileFolder()
    const userProfileNpmRcPath = path.join(userProfileFolder, '.npmrc')

    if (
        WriteFileIfChanged(
            userProfileNpmRcPath,
            azureAuthTokenNpmRcContent,
            'user npmrc file [for azure]'
        )
    ) {
        anyNpmVstsRcFileChanged = true
    }

    if (anyNpmVstsRcFileChanged) {
        RunNpmCiInstall()
    }

    process.exit(0)
}

// only applies to local env
if (!process.env.DEMO_NPM_REFRESH_TOKEN) {
    console.log('no DEMO_NPM_REFRESH_TOKEN set so skip ')
    process.exit(0)
}

const userProfileFolder = UserProfileFolder()

// vstsnpmauthrc used by better-vsts-npm-auth
const vstsNpmauthRcFilePath = path.join(userProfileFolder, '.vstsnpmauthrc')

const vstsNpmauthRcFileContent =
    `clientId=DE516D90-B63E-4994-BA64-881EA988A9D2` +
    '\n' +
    `redirectUri=https://stateless-vsts-oauth.azurewebsites.net/oauth-callback` +
    '\n' +
    `tokenEndpoint=https://stateless-vsts-oauth.azurewebsites.net/token-refresh` +
    '\n' +
    `tokenExpiryGraceInMs=1800000` +
    '\n' +
    `refresh_token=` +
    process.env.DEMO_NPM_REFRESH_TOKEN +
    '\n' +
    `_do_NOT_edit_THISFILE=true`

if (
    WriteFileIfChanged(
        vstsNpmauthRcFilePath,
        vstsNpmauthRcFileContent,
        'vstsnpmauthrc file'
    )
) {
    anyNpmVstsRcFileChanged = true
}

console.log('next step: check npm if better vsts is loaded')
// check if global package is installed
var result = spawnSync('npm', ['list', '-g', 'better-vsts-npm-auth', '--no-audit'], {
    env: process.env,
    stdio: 'pipe',
    encoding: 'utf-8',
})
var betterVstsNpmAuthSavedOutput = result.stdout

if (betterVstsNpmAuthSavedOutput == null || betterVstsNpmAuthSavedOutput.indexOf('better-vsts-npm-auth') == -1) {
    const installBetterVtstNpmAuthOutput = spawnSync('npm', ['install', '-g', 'better-vsts-npm-auth'], {
        env: process.env,
        stdio: 'pipe',
        encoding: 'utf-8',
    })
    if (installBetterVtstNpmAuthOutput !== null) {
        if (installBetterVtstNpmAuthOutput.stdout) {
            console.log(installBetterVtstNpmAuthOutput.stdout)
        }
        if (installBetterVtstNpmAuthOutput.stderr) {
            console.log('FAILED: installBetterVtstNpmAuthOutput error messages');
            console.log(installBetterVtstNpmAuthOutput.stderr);
        }
    }
}

const userNpmRcFilePath = path.join(userProfileFolder, '.npmrc')

let beforeUserNpmRcFileContent = ''
if (fs.existsSync(userNpmRcFilePath)) {
    beforeUserNpmRcFileContent = fs.readFileSync(userNpmRcFilePath, 'utf8')
}

// Remove yarn.yml files due issues with better-vsts-npm-auth
const subProjectYarnRcPath = path.join(subProjectRootFolder, '.yarnrc.yml')

if (fs.existsSync(subProjectYarnRcPath)) {
    fs.rmSync(subProjectYarnRcPath)
    console.log('remove yarn configs due issues with better-vsts-npm-auth');
}
// end yarn issues

console.log('next step: run \'better-vsts-npm-auth\'')
const betterVstsNpmAuthOutput = spawnSync('better-vsts-npm-auth',{
    env: process.env,
    stdio: 'pipe',
    encoding: 'utf-8',
})

if (betterVstsNpmAuthOutput !== null) {
    if (betterVstsNpmAuthOutput.stdout) {
        console.log(betterVstsNpmAuthOutput.stdout)
    }
    if (betterVstsNpmAuthOutput.stderr) {
        console.log('better-vsts-npm-auth error messages');
        console.log(betterVstsNpmAuthOutput.stderr);
    }
}

if (!fs.existsSync(userNpmRcFilePath)) {
    console.log(`Something when wrong generating user npmrc file \n The file: ${userNpmRcFilePath} is missing \n\n npm run preinstall is FAILED \n\n`);
    process.exit(1)
}

const afterUserNpmRcFileContent = fs.readFileSync(userNpmRcFilePath, 'utf8')

if (beforeUserNpmRcFileContent !== afterUserNpmRcFileContent) {
    anyNpmVstsRcFileChanged = true
}

if (anyNpmVstsRcFileChanged) {
    RunNpmCiInstall()
}
