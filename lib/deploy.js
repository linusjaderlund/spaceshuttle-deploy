// dependencies
const Client = require('ssh2-sftp-client');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const helper = require('./helper');
const readdir = promisify(fs.readdir);
const sftp = new Client();

// helpers
const printConfig = (config) => {
  const keys = Object.keys(config);
  const hiddenKeys = ['password', 'privateKey', 'passphrase'];
  console.log('  Deploying using configuration:');
  for (const key of keys) {
    console.log(`    ${key}: ${hiddenKeys.includes(key) ? '<hidden>' : config[key]}`);
  }
};

const printHeader = (config) => {
  console.log('\n  🚀 SPACESHUTTLE 🚀');
  console.log('  -------------------------------');
  printConfig(config);
  console.log('  -------------------------------');
};

const printFooter = () => {
  console.log('  -------------------------------');
  console.log('  🚀 DEPLOY DONE! 🚀\n');
};

const isDirectoryPath = (path) => path.replace(/[\/\\]+/, '').length > 0;

const listLocalPaths = async ({localPath}) => {
  try {
    const directories = [];
    const files = [];
    const queue = [localPath];

    while (queue.length) {
      const currentPath = queue.splice(0, 1)[0];
      const dirents = await readdir(currentPath, {withFileTypes: true});
      const paths = dirents
        .filter(dirent => dirent.isDirectory())
        .map(dirent => path.join(currentPath, dirent.name));
      
      for (const dirent of dirents) {
        const direntPath = path.join(currentPath, dirent.name);
        
        if (dirent.isDirectory()) {
          directories.push(direntPath);
          queue.push(direntPath);
          continue;
        }

        files.push(direntPath);
      }
    }

    return {directories, files};
  } catch (error) {
    helper.handle.error(error);
  }
};

const createServerDirectory = async (serverPath) => {
  try {
    if (!(await sftp.exists(serverPath))) {
      await sftp.mkdir(serverPath);
    }
  } catch (error) {
    helper.handle.error(error);
  }
};

const createServerDirectories = async ({localPath, serverPath}, {directories}) => {
  try {
    let created = 0;
    let total = directories.length;
    const print = () => `  Creating directories: ${created}/${total}\r`;
    
    if (isDirectoryPath(serverPath)) {
      total++;
      await createServerDirectory(serverPath);
      created++;
      process.stdout.write(print());
    }
    
    for (const directory of directories) {
      const currentServerPath = path.join(serverPath, directory.replace(localPath, ''));
      await createServerDirectory(currentServerPath);
      created++;
      process.stdout.write(print());
    }

    readline.clearLine(process.stdout);
    console.log('  Creating directories: ✅');
  } catch (error) {
    helper.handle.error(error);
  }
};

const uploadFiles = async ({localPath, serverPath}, {files}) => {
  try {
    let uploaded = 0;
    let total = files.length;
    const print = () => `  Uploading files: ${uploaded}/${total}\r`;
    
    for (const file of files) {
      const joinedPath = path.join(serverPath, file.replace(localPath, ''));
      const cleanedPath = joinedPath.charAt(0).match(path.sep)
        ? joinedPath.replace(path.sep,'')
        : joinedPath;

      await sftp.fastPut(file, cleanedPath);
      uploaded++;
      process.stdout.write(print());
    }

    readline.clearLine(process.stdout);
    console.log('  Uploading files: ✅');
  } catch (error) {
    helper.handle.error(error);
  }
};

// deploy library
const lib = {};

lib.init = async (config) => {
  try {
    printHeader(config);

    await sftp.connect(config);
    const localPaths = await listLocalPaths(config);
    await createServerDirectories(config, localPaths);
    await uploadFiles(config, localPaths);
    sftp.end();

    printFooter();
  } catch (error) {
    helper.handle.error(error);
  }
};

// export module
module.exports = lib;
