#!/usr/bin/env node

const fs = require('fs')
const { spawnSync } = require('child_process')
const path = require('path')
const { env } = require('process')
const https = require('https')

const authMiddlewareUrl = 'https://devopsauth.test.stichting-open.org'
const authMiddlewareClientId = '77EDFF60-98FD-45B5-992E-0E475379F987'
const nodePackageManagerTool = 'pnpm'
const devOpsOrganisationName = 'qdraw'
const refreshTokenEnvName = 'DEMO_NPM_REFRESH_TOKEN'

const packagesFeeds = [
    {
        name: 'qdraw-components',
        packageName: '@qdraw-components/components',
        url: 'https://qdraw.pkgs.visualstudio.com/_packaging/demo/npm/registry/',
        azure: [
            '//pkgs.dev.azure.com/qdraw/_packaging/demo/npm/registry/:_authToken=',
            '//pkgs.dev.azure.com/qdraw/_packaging/demo/npm/:_authToken=',
        ],
    }
]

//
//  - - - - - - - - - - - - - - - - - - - - - - - - Configuration ends here - - - - - - - - - - - - - - - - - - - - - -
//

if (process.env.AZURE_AUTH_TOKEN === "default") {
  process.env.AZURE_AUTH_TOKEN = "";
}

const argsArray = process.argv.slice(2);
const noNpmInstall = argsArray.indexOf("--no-install") >= 0;
const onlyCreateNpmRc = argsArray.indexOf("--only-create-npmrc") >= 0;

function UserProfileFolder() {
  let userProfileFolder = "~";
  if (process.env.CSIDL_PROFILE && fs.existsSync(process.env.CSIDL_PROFILE)) {
    userProfileFolder = process.env.CSIDL_PROFILE;
  }
  if (process.env.HOME && fs.existsSync(process.env.HOME)) {
    userProfileFolder = process.env.HOME;
  }

  if (process.env.USERPROFILE && fs.existsSync(process.env.USERPROFILE)) {
    userProfileFolder = process.env.USERPROFILE;
  }

  if (!fs.existsSync(userProfileFolder)) {
    console.error("userProfileFolder not found");
    console.log("ENV:");
    console.log(process.env);
    console.log("HOME:" + process.env.HOME);
    console.log("CSIDL_PROFILE:" + process.env.CSIDL_PROFILE);
    console.log("USERPROFILE:" + process.env.USERPROFILE);
    exit(1);
  }

  return userProfileFolder;
}

function RunNpmCiInstall(subProjectRootFoldersLocal) {
  if (noNpmInstall) {
    console.log("Skipping npm install/ci");
    return;
  }

  for (const folder of subProjectRootFoldersLocal) {
    if (nodePackageManagerTool === "pnpm") {
      console.log("run P(yes p)npm install");
      spawnSync("pnpm", ["install", "--ignore-scripts", "--prefer-offline"], {
        stdio: "inherit",
        cwd: folder,
      });
    } else if (nodePackageManagerTool === "npm") {
      const subProjectPackageLockPath = path.join(folder, "package-lock.json");
      if (
        fs.existsSync(subProjectPackageLockPath) &&
        process.env.npm_command === "ci"
      ) {
        console.log("next step: npm ci");
        spawnSync("npm", ["ci", "--ignore-scripts"], {
          stdio: "inherit",
          cwd: folder,
        });
      } else {
        console.log("next step: npm install");
        spawnSync("npm", ["install", "--ignore-scripts"], {
          stdio: "inherit",
          cwd: folder,
        });
      }
    }
  }
}

function WriteFileIfChanged(filePath, fileContent, uiName) {
  if (!fs.existsSync(filePath)) {
    fs.closeSync(fs.openSync(filePath, "w"));
  }

  const file = fs.readFileSync(filePath, "utf8");

  let fileIsChanged = false;
  // Check if .npmrc is already modified by this script
  if (file !== fileContent) {
    // Create .npmrc with azure package urls
    fs.writeFileSync(filePath, fileContent);

    // Set chmod
    fs.chmodSync(filePath, 0o600);

    fileIsChanged = true;
    console.log(`[v] update ${uiName} done`);
  } else {
    console.log(`skip update ${uiName} in user folder`);
  }
  return fileIsChanged;
}

let anyNpmVstsRcFileChanged = false;

// project npmrc file
let projectNpmRcFileContent = `auto-install-peers=true\n`;
for (const feed of packagesFeeds) {
  projectNpmRcFileContent += `@${feed.name}:registry=${feed.url}` + "\n";
}
projectNpmRcFileContent +=
  "\n" + `always-auth=true` + `\n; do NOT manual edit this file`;

let subProjectRootFolders = [path.join(__dirname, "..")];

// run script out of current context
if (process.env.SUB_PROJECT_DIR_PATH) {
  console.log(`use: SUB_PROJECT_DIR_PATH ${process.env.SUB_PROJECT_DIR_PATH}`);
  subProjectRootFolders = [];
  for (const folder of process.env.SUB_PROJECT_DIR_PATH.split(";")) {
    if (fs.existsSync(folder)) {
      subProjectRootFolders.push(folder);
    }
  }
} else if (process.env.SUB_PROJECT_DIR_PATH) {
  console.log(
    ` SUB_PROJECT_DIR_PATH ignored it does not exist on disk ${process.env.SUB_PROJECT_DIR_PATH}`
  );
}

for (const folder of subProjectRootFolders) {
  const subProjectNpmRcPath = path.join(folder, ".npmrc");

  let azureAuthTokenNpmRcContent = "";
  if (process.env.AZURE_AUTH_TOKEN) {
    // Only on Azure DevOPS!
    azureAuthTokenNpmRcContent = "\n";

    for (const feed of packagesFeeds) {
      for (const azureItem of feed.azure) {
        azureAuthTokenNpmRcContent +=
          `${azureItem}${process.env.AZURE_AUTH_TOKEN}` + "\n";
      }
    }
    azureAuthTokenNpmRcContent += "\n; azure -- DO NOT MANUAL MODIFY THIS FILE";
    projectNpmRcFileContent += azureAuthTokenNpmRcContent;
    console.log(
      `--azure content added to project ~ "${subProjectNpmRcPath}" ~ npmrc file`
    );
  } else if (
    process.env.TF_BUILD &&
    !process.env.AZURE_AUTH_TOKEN &&
    !onlyCreateNpmRc
  ) {
    console.log(
      "\n\nWARNING > Azure DevOPS active but no AZURE_AUTH_TOKEN\n\n"
    );
    console.log("##[warning] You should pass the env: AZURE_AUTH_TOKEN");
  }

  if (
    WriteFileIfChanged(
      subProjectNpmRcPath,
      projectNpmRcFileContent,
      `project ~ "${subProjectNpmRcPath}" ~ npmrc file`
    )
  ) {
    anyNpmVstsRcFileChanged = true;
  }

  if (process.env.AZURE_AUTH_TOKEN) {
    const userProfileFolder = UserProfileFolder();
    const userProfileNpmRcPath = path.join(userProfileFolder, ".npmrc");

    if (
      WriteFileIfChanged(
        userProfileNpmRcPath,
        azureAuthTokenNpmRcContent,
        "user npmrc file [for azure]"
      )
    ) {
      anyNpmVstsRcFileChanged = true;
    }

    if (anyNpmVstsRcFileChanged) {
      RunNpmCiInstall(subProjectRootFolders);
    }

    process.exit(0);
  }
}

const userProfileFolder = UserProfileFolder();

// vstsnpmauthrc used by better-vsts-npm-auth
const vstsNpmauthRcFilePath = path.join(userProfileFolder, ".vstsnpmauthrc");

const vstsNpmauthRcFileContent =
  `clientId=${authMiddlewareClientId}` +
  "\n" +
  `redirectUri=${authMiddlewareUrl}/oauth-callback` +
  "\n" +
  `tokenEndpoint=${authMiddlewareUrl}/token-refresh` +
  "\n" +
  `tokenExpiryGraceInMs=1800000` +
  "\n" +
  `refresh_token=` +
  process.env[refreshTokenEnvName] +
  "\n" +
  `_do_NOT_edit_THISFILE=true`;

if (
  WriteFileIfChanged(
    vstsNpmauthRcFilePath,
    vstsNpmauthRcFileContent,
    "vstsnpmauthrc file"
  )
) {
  anyNpmVstsRcFileChanged = true;
}

if (onlyCreateNpmRc) {
  console.log(`set --only-create-npmrc so skip`);
  process.exit(0);
}

// only applies to local env
if (!process.env[refreshTokenEnvName]) {
  console.log(`no ${refreshTokenEnvName} set so skip `);
  process.exit(0);
}

if (nodePackageManagerTool === "pnpm") {
  // install pnpm
  console.log("next step: check via npm if P(yes p)nmp");

  // check if global package is installed
  const resultPnpm = spawnSync("npm", ["list", "-g", "pnpm", "--no-audit"], {
    env: process.env,
    stdio: "pipe",
    encoding: "utf-8",
  });
  const listPnpmSavedOutput = resultPnpm.stdout;

  if (
    listPnpmSavedOutput == null ||
    listPnpmSavedOutput.indexOf("pnpm") === -1
  ) {
    const installPnpmSavedOutput = spawnSync(
      "npm",
      ["install", "-g", "pnpm", "--no-fund", "--no-audit"],
      {
        env: process.env,
        stdio: "pipe",
        encoding: "utf-8",
      }
    );
    if (installPnpmSavedOutput !== null) {
      if (installPnpmSavedOutput.stdout) {
        console.log(installPnpmSavedOutput.stdout);
      }
      if (installPnpmSavedOutput.stderr) {
        console.log("FAILED: pnpm error messages");
        console.log(installPnpmSavedOutput.stderr);
      }
    }
  }
  // end pnpm
}

console.log("next step: check via npm if better vsts is loaded");

// check if global package is installed
const result = spawnSync(
  "npm",
  ["list", "-g", "better-vsts-npm-auth", "--no-audit"],
  {
    env: process.env,
    stdio: "pipe",
    encoding: "utf-8",
  }
);
const betterVstsNpmAuthSavedOutput = result.stdout;

if (
  betterVstsNpmAuthSavedOutput == null ||
  betterVstsNpmAuthSavedOutput.indexOf("better-vsts-npm-auth") === -1
) {
  const installBetterVtstNpmAuthOutput = spawnSync(
    "npm",
    ["install", "-g", "better-vsts-npm-auth", "--no-audit"],
    {
      env: process.env,
      stdio: "pipe",
      encoding: "utf-8",
    }
  );
  if (installBetterVtstNpmAuthOutput !== null) {
    if (installBetterVtstNpmAuthOutput.stdout) {
      console.log(installBetterVtstNpmAuthOutput.stdout);
    }
    if (installBetterVtstNpmAuthOutput.stderr) {
      console.log(
        "FAILED/ check warnings: installBetterVtstNpmAuthOutput error messages"
      );
      console.log(installBetterVtstNpmAuthOutput.stderr);
    }
  }
}

const userNpmRcFilePath = path.join(userProfileFolder, ".npmrc");

let beforeUserNpmRcFileContent = "";
if (fs.existsSync(userNpmRcFilePath)) {
  beforeUserNpmRcFileContent = fs.readFileSync(userNpmRcFilePath, "utf8");
}

// Remove yarn.yml files due issues with better-vsts-npm-auth
for (const folder of subProjectRootFolders) {
  const subProjectYarnRcPath = path.join(folder, ".yarnrc.yml");

  if (fs.existsSync(subProjectYarnRcPath)) {
    fs.rmSync(subProjectYarnRcPath);
    console.log("remove yarn configs due issues with better-vsts-npm-auth");
  }
}

console.log("next step: run 'better-vsts-npm-auth'");

const betterVstsNpmAuthOutput = spawnSync("better-vsts-npm-auth", {
  env: process.env,
  stdio: "pipe",
  encoding: "utf-8",
});

if (betterVstsNpmAuthOutput !== null) {
  if (betterVstsNpmAuthOutput.stdout) {
    console.log(betterVstsNpmAuthOutput.stdout);
  }
  if (betterVstsNpmAuthOutput.stderr) {
    console.log("better-vsts-npm-auth error messages");
    console.log(betterVstsNpmAuthOutput.stderr);
  }
}

if (!fs.existsSync(userNpmRcFilePath)) {
  console.log(
    `Something when wrong generating user npmrc file \n The file: ${userNpmRcFilePath} is missing \n\n ${nodePackageManagerTool} run preinstall is FAILED\n`
  );
  console.log("Try to manual install: \nnpm -g install better-vsts-npm-auth\n");
  console.log("and run afterwards: \nbetter-vsts-npm-auth");
  process.exit(1);
}

const afterUserNpmRcFileContent = fs.readFileSync(userNpmRcFilePath, "utf8");

if (beforeUserNpmRcFileContent !== afterUserNpmRcFileContent) {
  anyNpmVstsRcFileChanged = true;
}

if (anyNpmVstsRcFileChanged) {
  RunNpmCiInstall(subProjectRootFolders);
}

async function httpsGetPost(url, verb, bearer) {
  let requestOptionsUrl = new URL(url);
  const requestOptions = {
    host: requestOptionsUrl.host,
    path: requestOptionsUrl.pathname + requestOptionsUrl.search,
    method: verb,
    headers: {
      "User-Agent": "Outlook-iOS/709.2226530.prod.iphone (3.24.1)",
      "Content-Type": "application/json",
    },
  };

  if (bearer) {
    requestOptions.headers.Authorization = "Bearer " + bearer;
  }

  // Promisify the https.request
  return new Promise((resolve, reject) => {
    // general request options, we defined that it's a POST request and content is JSON

    // actual request
    const req = https.request(requestOptions, (res) => {
      let response = "";

      res.on("data", (d) => {
        response += d;
      });

      // response finished, resolve the promise with data
      res.on("end", () => {
        try {
          const parsedResponse = JSON.parse(response);
          resolve(parsedResponse);
        } catch (error) {
          error.url = requestOptions.host + requestOptions.path;
          error.statusCode = res.statusCode;
          reject(error);
        }
      });
    });

    // there was an error, reject the promise
    req.on("error", (e) => {
      reject(e);
    });

    req.end();
  });
}

if (env[refreshTokenEnvName]) {
  httpsGetPost(
    authMiddlewareUrl + "/token-refresh?code=" + env[refreshTokenEnvName],
    "POST"
  )
    .then((data) => {
      const accessToken = data.access_token;
      if (accessToken) {
        httpsGetPost(
          `https://feeds.dev.azure.com/${devOpsOrganisationName}/_apis/packaging/feeds?api-version=6.0-preview.1`,
          "GET",
          accessToken
        )
          .then((data) => {
            if (data.value) {
              console.log(
                " Checking if you have the right access rights \n   You have access to: "
              );
              for (const value of data.value) {
                const packagesFeedItem = packagesFeeds.find(
                  (p) => p.name === value.fullyQualifiedName
                );
                if (packagesFeedItem) {
                  httpsGetPost(
                    `${packagesFeedItem.url}${packagesFeedItem.packageName}`,
                    "GET",
                    accessToken
                  )
                    .then((dataPackageItem) => {
                      if (dataPackageItem.success === "false") {
                        console.log(
                          " >   NO Access to:  " + value.fullyQualifiedName
                        );
                        console.log(" >   " + dataPackageItem.error);
                        console.log(
                          "In the feed settings you need give permissions to the user"
                        );
                      } else {
                        console.log(" >   OK for: ");
                        console.log(" >   " + value.fullyQualifiedName);
                      }
                    })
                    .catch((e) => {
                      console.log(e);
                    });
                } else {
                  console.log(
                    " .      skip check: " + value.fullyQualifiedName
                  );
                }
              }
            }
          })
          .catch((e) => {
            if (e.statusCode === 302) {
              console.log("---");
              console.log("FAIL: You don't have access to packaging.");
              console.log("You are probably connected to the WRONG tenant");
              console.log("FAIL: Please add a new token!");
              console.log("statusCode: ");
              console.log(e.statusCode);
              console.log("---");
            } else {
              console.log(e);
            }
          });
      } else {
        console.error(data);
      }
    })
    .catch((e) => {
      console.log("connecting to auth middleware failed");
      console.log(e);
    });
} else {
  console.log(`Env ${refreshTokenEnvName} variable not set so skip check`);
}

console.log("end of preinstall");

