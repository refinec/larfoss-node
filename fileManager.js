const defaultConfig = require('./defaultConfigtion');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const unzip = require('unzip');

module.exports = function (internalClient) {
    const api = {};
    /**
     * 初始化配置
     * @return {object}
     */
    api.initialize = function () {
        if (defaultConfig.get('routePrefix') !== '/') {
            return {
                'result': {
                    'status': 'danger',
                    'message': 'noConfig'
                }
            }
        }
        let config = {
            'acl': defaultConfig.get('acl'),
            'leftDisk': defaultConfig.get('leftDisk'),
            'rightDisk': defaultConfig.get('rightDisk'),
            'leftPath': defaultConfig.get('leftPath'),
            'rightPath': defaultConfig.get('rightPath'),
            'windowsConfig': defaultConfig.get('windowsConfig'),
            'hiddenFiles': defaultConfig.get('hiddenFiles'),
            'disks': {
                'local': {
                    local: defaultConfig.get('diskList')[0],
                    driver: 'local'
                },
            }
        }
        return {
            'result': {
                'status': 'success',
                'message': null
            },
            'config': config
        }
    }

    /**
     * 左侧目录栏显示所有目录
     * @param {string} disk 
     * @param {string} dir 
     */
    api.showDirectories = async function (disk = "", dir = "") {
        const filesList = [];
        dir = dir.lastIndexOf('/') === dir.length - 1 ? dir : dir + '/';
        try {
            return await internalClient.list({
                prefix: dir,
                delimiter: '/'
            }).then((obj) => {
                (obj.prefixes || []).forEach((item, index) => {
                    let tempDir = {};
                    tempDir.id = index;
                    tempDir.basename = path.basename(item);
                    tempDir.dirname = item;
                    tempDir.path = item.replace(/\/$/g, "");
                    tempDir.type = "dir";
                    tempDir.props = {
                        hasSubdirectories: true,
                        subdirectoriesLoaded: false,
                        showSubdirectories: true
                    };
                    tempDir.parentId = index;
                    filesList.push(tempDir);
                })
                return {
                    result: {
                        'status': 'success',
                        'message': null
                    },
                    directories: filesList
                };
            }).catch(err => {
                console.log(err);
                return {
                    result: {
                        'status': 'danger',
                        'message': null
                    },
                    directories: []
                };
            })
        } catch (err_1) {
            console.error(err_1);
        }
    }

    api.getTimeStamp = function (prefixes) {
        const timeStamp = [];
        const promiseTime = [];
        (prefixes || []).forEach((item, index) => {
            promiseTime.push(internalClient.head(item).catch(e => e));
        });
        return Promise.all(promiseTime).then((res) => {
            res.forEach((item, index) => {
                if (item.code === 'NoSuchKey') {
                    timeStamp.push(0);
                    return;
                }
                timeStamp.push(new Date(item.res.headers['last-modified']).getTime() / 1000);
            })
            return timeStamp;
        })
    }

    api.content = async function (disk = "", dirPath = "") {
        try {
            const dir = dirPath.lastIndexOf('/') === dirPath.length - 1 ? dirPath : dirPath + '/';
            const directories = [];
            const file = [];
            let fileObj = await internalClient.list({
                prefix: dir,
                delimiter: '/'
            });
            if (!fileObj.objects && !fileObj.prefixes) {
                return {
                    result: {
                        'status': 'success',
                        'message': "该目录还没存货呢"
                    },
                    directories: [],
                    files: []
                };
            }
            return this.getTimeStamp(fileObj.prefixes).then(timeStamp => {
                (fileObj.prefixes || []).forEach((item, index) => {
                    try {
                        let tempDir = {};
                        tempDir.id = index;
                        tempDir.basename = path.basename(item);
                        tempDir.dirname = item;
                        tempDir.path = item.replace(/\/$/g, "");
                        tempDir.parentId = index;
                        tempDir.timestamp = timeStamp[index];
                        tempDir.size = 0;
                        tempDir.type = "dir";
                        tempDir.props = {
                            hasSubdirectories: true,
                            subdirectoriesLoaded: false,
                            showSubdirectories: true
                        };
                        directories.push(tempDir);
                    } catch (error) {
                        console.log(error);
                    }
                });
                (fileObj.objects || []).forEach((item, index) => {
                    if (item.name.lastIndexOf('/') === item.name.length - 1) {
                        return;
                    }
                    let tempDir = {};
                    tempDir.id = index;
                    tempDir.basename = path.basename(item.name);
                    tempDir.filename = path.basename(item.name, path.extname(item.name));
                    tempDir.dirname = item.name;
                    tempDir.path = item.name;
                    tempDir.parentId = index;
                    tempDir.timestamp = new Date(item.lastModified).getTime() / 1000;
                    tempDir.size = item.size;
                    tempDir.type = "file";
                    tempDir.extension = path.extname(item.name).replace(/\./, "");
                    tempDir.props = {
                        hasSubdirectories: false,
                        subdirectoriesLoaded: true,
                        showSubdirectories: false
                    };
                    file.push(tempDir);
                })
                return {
                    result: {
                        'status': 'success',
                        'message': null
                    },
                    directories: directories,
                    files: file
                };
            });
        } catch (err_1) {
            console.error(err_1);
        }
    }

    /**
     * 创建oss目录
     * @param {string} dir 
     */
    api.createOssDirectory = function (dir) {
        return new Promise((resolve) => {
            internalClient.get(dir).then((result) => {
                if (result.res.status == 200) {
                    return 'exist';
                }
            }).catch((e) => {
                // 目录不存在则创建目录
                if (e.code == 'NoSuchKey') {
                    resolve(internalClient.put(dir, Buffer.from('')).then((result) => {
                        if (result.res.status == 200) {
                            return internalClient.get(dir)
                        }
                    }).then((info) => {
                        return Promise.resolve({
                            time: new Date(info.res.headers['last-modified']).getTime(),
                            size: info.res.size
                        })
                    }).then(result => {
                        const tempDir = {};
                        tempDir.path = dir.replace(/\/$/g, "");
                        tempDir.timestamp = result.time / 1000;
                        tempDir.size = result.size;
                        tempDir.basename = path.basename(dir);
                        tempDir.type = "dir";
                        tempDir.props = {
                            hasSubdirectories: true,
                            subdirectoriesLoaded: false,
                            showSubdirectories: true
                        };
                        return tempDir;
                    }).catch(e => {
                        return 'createErr'
                    }));
                }
            })
        }).catch(e => e);
    }

    api.createOssFile = function (dir) {
        return new Promise((resolve) => {
            internalClient.get(dir).then((result) => {
                if (result.res.status == 200) {
                    return 'exist';
                }
            }).catch((e) => {
                // 文件不存在则创建文件
                if (e.code == 'NoSuchKey') {
                    resolve(internalClient.put(dir, Buffer.from('')).then((result) => {
                        if (result.res.status == 200) {
                            return internalClient.get(dir)
                        }
                    }).then((info) => {
                        return Promise.resolve({
                            time: new Date(info.res.headers['last-modified']).getTime(),
                            size: info.res.size
                        })
                    }).then(result => {
                        const tempDir = {};
                        tempDir.path = dir;
                        tempDir.timestamp = result.time / 1000;
                        tempDir.size = result.size;
                        tempDir.basename = path.basename(dir);
                        tempDir.filename = path.basename(dir, path.extname(dir));
                        tempDir.dirname = dir;
                        tempDir.type = "file";
                        tempDir.extension = path.extname(path.basename(dir)).replace(/\./, "");
                        tempDir.props = {
                            hasSubdirectories: false,
                            subdirectoriesLoaded: true,
                            showSubdirectories: false
                        };
                        return tempDir;
                    }).catch(e => {
                        return 'createErr'
                    }));
                }
            })
        })
    }

    /**
     * 更新oss文件属性
     * @param {string} dir 
     */
    api.updateOssFileProperty = function (dir = '') {
        return internalClient.get(dir).then((info) => {
            return Promise.resolve({
                time: new Date(info.res.headers['last-modified']).getTime(),
                size: info.res.size
            }).then(result => {
                const tempDir = {};
                tempDir.path = dir;
                tempDir.dirname = dir;
                tempDir.basename = path.basename(dir);
                tempDir.filename = path.basename(dir, path.extname(dir));
                tempDir.timestamp = result.time / 1000;
                tempDir.size = result.size;
                tempDir.type = "file";
                tempDir.extension = path.extname(path.basename(dir)).replace(/\./, "");
                tempDir.props = {
                    hasSubdirectories: false,
                    subdirectoriesLoaded: true,
                    showSubdirectories: false
                };
                return tempDir;
            }).catch(e => {
                console.error(e);
            })
        }).catch(e => e);
    }

    /**
     * 更新文件
     * @param {string} dirname 
     * @param {ArrayBuffer} content 
     */
    api.updateFile = async function (dirname, content) {
        return await new Promise((resolve, reject) => {
            let ws = fs.createWriteStream(dirname, {
                flags: 'w+',
                encoding: 'blob',
                fd: null,
                mode: 0666,
                autoClose: true
            })
            ws.on('error', (err) => {
                reject(err);
            });
            ws.on('finish', () => {
                resolve(true);
            });
            ws.write(content);
            ws.end();
        }).catch(e => e)
    }

    api.deleteOssAllFile = function (data) {
        return new Promise((resolve) => {
            if (data.items.length) {
                let fileArr = [],
                    directories = [];
                for (let dir of data.items) {
                    if (dir.type === 'dir') {
                        directories.unshift(dir.path);
                    } else {
                        fileArr.unshift(dir.path);
                    }
                }
                this.getAllFilePath(directories, fileArr).then((arr) => {
                    if (arr === 'NoSuchKey') {
                        return resolve(false);
                    }
                    arr.forEach((item, index) => {
                        (async () => {
                            try {
                                await internalClient.delete(item);
                            } catch (error) {
                                return resolve(false);
                            }
                        })();
                        if (index === fileArr.length - 1) {
                            return resolve(true);
                        }
                    });
                });
            }
        }).catch(e => false);
    }

    api.getAllFilePath = async function (directories, fileArr) {
        return await new Promise((resolve) => {
            (function getPath() {
                let popPath = "";
                if (directories.length) {
                    popPath = directories.pop();
                    popPath = popPath.lastIndexOf('/') === popPath.length - 1 ? popPath : popPath + '/';
                    fileArr.unshift(popPath);
                } else {
                    return resolve(fileArr);
                }
                internalClient.get(popPath).then((result) => {
                    if (result.res.status == 200) {
                        internalClient.list({
                            prefix: popPath,
                            delimiter: '/'
                        }).then((result) => {
                            (result.objects || []).forEach((item) => {
                                if (item.name.lastIndexOf('/') === item.name.length - 1) {
                                    return;
                                }
                                fileArr.unshift(item.name);
                            })
                            directories.unshift(...(result.prefixes || []));
                            return getPath(directories, fileArr);
                        })
                    }
                }).catch((e) => {
                    if (e.code == 'NoSuchKey') {
                        return resolve('NoSuchKey');
                    }
                })
            })();
        }).catch(e => e)
    }

    api.copyOssFolder = async function (destDir, sourceDir) {
        try {
            let result = await internalClient.put(destDir, Buffer.from('')); //创建文件
            if (result.res.status === 200) {
                let fileObj = await internalClient.list({
                    prefix: sourceDir,
                    delimiter: '/' //用于获取文件的公共前缀。
                });
                if (!fileObj.objects && !fileObj.prefixes) {
                    return 'end';
                }
                (fileObj.objects || []).forEach(item => {
                    if (item.name.lastIndexOf('/') === item.name.length - 1) {
                        return;
                    }
                    let dirPath = `${destDir}${path.basename(item.name)}`;
                    internalClient.copy(dirPath, item.name).catch(error => {
                        return 'err';
                    });
                });
                (fileObj.prefixes || []).forEach((item, index) => {
                    let dirPath = `${destDir}${path.basename(item)}/`;
                    (async () => {
                        try {
                            await this.copyOssFolder(dirPath, item);
                            if (fileObj.prefixes.length - 1 === index) {
                                return 'end';
                            }
                        } catch (error) {
                            return 'err';
                        }
                    })();
                });
            }
        } catch (e) {
            console.log(e);
            return 'err';
        }
    }

    /**
     * 返回选择的盘符
     */
    api.drive = function (disk) {
        return defaultConfig.get('diskList')[0];
    }
    return api;
}