const express = require("express");
const router = express.Router();
const path = require('path');
const fs = require("fs-extra");
const mime = require('mime-types');
const compress = require('compression');
const {
    IncomingForm
} = require('formidable');

const config = {};
const defaultConfig = require('./defaultConfigtion');
const ossConfig = require('./ossConfig');
const fileManager = require('./fileManager');

module.exports = function (options) {
    Object.assign(config, options);

    const {
        client,
        internalClient
    } = ossConfig(config);

    const api = fileManager(internalClient);

    router.use(compress());
    router.get('/', (req, res) => {
        res.status(200)
        res.send();
    })

    router.get('/initialize', (req, res) => {
        res.type('json');
        res.send(api.initialize());
    })

    router.get('/tree', (req, res) => {
        res.type('json');
        api.showDirectories("", req.query.path).then((data) => {
            res.send(data);
        });
    })

    router.get('/content', (req, res) => {
        api.content("", req.query.path)
            .then((data) => {
                res.send(data);
            })
    })

    router.get('/select-disk', (req, res) => {
        const hasDisk = defaultConfig.get('diskList').some((item) => {
            return item === api.drive(req.query.disk)
        })
        if (hasDisk) {
            return res.send({
                result: {
                    status: 'success'
                }
            })
        }
        res.send({
            result: {
                status: 'danger'
            }
        })
    });
    router.get('/download-file', (req, res) => {
        if (path.extname(path.basename(req.query.path)) === '.txt') {
            (async () => {
                try {
                    let result = await internalClient.getStream(req.query.path);
                    result.stream.pipe(res);
                } catch (e) {
                    console.error(e);
                }
            })();
        } else {
            (async () => {
                try {
                    let url = await client.signatureUrl(req.query.path, {
                        expires: 32400
                    });
                    res.setHeader("Content-Disposition", 'attachment');
                    res.send(url);
                } catch (error) {
                    console.error(error);
                }
            })();
        }
    })
    router.get("/download", (req, res) => {
        (async () => {
            try {
                let result = await internalClient.getStream(req.query.path);
                result.stream.pipe(res);
            } catch (e) {
                console.error(e);
            }
        })();
    });
    router.post('/zip', (req, res) => {
        res.send({
            result: {
                status: 'success',
                message: '该功能暂未开放,敬请期待!'
            }
        })
    })
    router.post('/unzip', (req, res) => {
        res.send({
            result: {
                status: 'success',
                message: '该功能暂未开放,敬请期待!'
            }
        })
    })
    router.post('/update-file', (req, res) => {
        const form = new IncomingForm({
            uploadDir: './tempfile',
            keepExtensions: true,
            maxFileSize: 512 * 1024 * 1024,
            maxFields: 0, // default 1000,set 0 for unlimited
            maxFieldsSize: 20 * 1024 * 1024, //default
            hash: false, //default
        });
        form.on('error', (err) => {
            res.send({
                result: {
                    status: "danger",
                    message: "更新时发生错误!"
                }
            })
        });
        form.parse(req, (err, fields, files) => {
            if (err) console.error(err);
            (async () => {
                try {
                    let stream = fs.createReadStream(files.file.path);
                    let size = fs.statSync(files.file.path).size;
                    let result = await internalClient.putStream(
                        fields.path, stream, {
                            contentLength: size
                        });
                    if (result.res.status === 200) {
                        api.updateOssFileProperty(fields.path).then((prop) => {
                            res.send({
                                result: {
                                    status: 'success',
                                    message: '更新成功!'
                                },
                                file: prop
                            })
                        })
                    } else {
                        res.send({
                            result: {
                                status: 'danger',
                                message: '更新失败!'
                            }
                        })
                    }
                } catch (e) {
                    res.send({
                        result: {
                            status: 'danger',
                            message: '更新失败!'
                        }
                    })
                }
                //更新完之后删除文件
                try {
                    fs.unlink(files.file.path, (err) => {
                        if (err) console.error(err);
                    })
                } catch (error) {
                    console.error(error);
                }
            })();
        })
    })

    router.get("/thumbnails-link", (req, res) => {
        (async () => {
            try {
                let url = await client.signatureUrl(req.query.path, {
                    expires: 32400
                });
                res.setHeader('content-type', mime.lookup(req.query.path));
                res.send(url);
            } catch (error) {
                console.error(error);
            }
        })();
    })
    router.get("/preview", (req, res) => {
        (async () => {
            let result = await internalClient.getStream(req.query.path);
            res.setHeader('content-type', mime.lookup(req.query.path));
            result.stream.pipe(res);
        })();
    });
    router.get('/stream-file', (req, res) => {
        (async () => {
            let url = await client.signatureUrl(req.query.path, {
                expires: 32400
            });
            res.setHeader('content-type', mime.lookup(req.query.path));
            res.setHeader('Accept-Ranges', 'bytes');
            res.send(url);
        })();
    })
    router.get('/url', (req, res) => {
        (async () => {
            let url = await client.signatureUrl(req.query.path, {
                expires: 32400
            });
            res.send({
                result: {
                    status: "success",
                    message: ""
                },
                url
            })
        })();
    })
    router.post('/create-file', (req, res) => {
        /**
         * 注册data事件接收数据
         * @param {string} chunk默认是一个二进制数据和data拼接会自动toString
         */
        req.on('data', (chunk) => {
            let data = "";
            let currentFile = "";
            data += chunk;
            data = JSON.parse(data);
            const reg = new RegExp('[\\\\/:*?"<>|]');
            if (reg.test(data.name.toString())) {
                return res.send({
                    result: {
                        'status': 'danger',
                        'message': "文件创建失败,含有非法字符有\\/:*?\"<>|"
                    }
                });
            }
            if (data.name.toString().indexOf(".") === -1) {
                return res.send({
                    result: {
                        'status': 'danger',
                        'message': "文件创建失败,请添加文件扩展名!"
                    }
                });
            }
            currentFile = data.path ? `${data.path}/${data.name}` : `${data.name}`;
            api.createOssFile(currentFile).then(result => {
                if (result === 'createErr') {
                    res.send({
                        result: {
                            'status': 'danger',
                            'message': "文件创建失败!"
                        }
                    });
                } else if (result === 'exist') {
                    res.send({
                        result: {
                            'status': 'danger',
                            'message': "文件已存在!"
                        }
                    });
                } else {
                    res.send({
                        result: {
                            'status': 'success',
                            'message': "文件创建成功!"
                        },
                        file: result
                    })

                }
            })
        })
    });
    router.post("/create-directory", (req, res) => {
        req.on('data', (chunk) => {
            let data = "";
            data += chunk;
            data = JSON.parse(data);
            let currentFile = "";
            currentFile = data.path ? `${data.path}/${data.name}/` : `${data.name}/`;
            const reg = new RegExp('[\\\\/:*?"<>|]');
            if (reg.test(data.name.toString())) {
                return res.send({
                    result: {
                        'status': 'danger',
                        'message': "目录创建失败,含有非法字符有\\/:*?\"<>|"
                    }
                });
            }
            api.createOssDirectory(currentFile).then((result) => {
                if (result === 'createErr') {
                    res.send({
                        result: {
                            'status': 'danger',
                            'message': "目录创建失败!"
                        }
                    });
                } else if (result === 'exist') {
                    res.send({
                        result: {
                            'status': 'danger',
                            'message': "目录已存在!"
                        }
                    });
                } else {
                    res.send({
                        result: {
                            'status': 'success',
                            'message': "目录创建成功!"
                        },
                        directory: result,
                        tree: [result]
                    })
                }
            });
        })
    });

    /**
     * 删除文件
     */
    router.post("/delete", (req, res) => {
        req.on("data", function (chunk) {
            let data = "";
            data += chunk;
            data = JSON.parse(data);
            api.deleteOssAllFile(data).then((isTrue) => {
                if (isTrue) {
                    res.status(200);
                    res.send({
                        result: {
                            'status': 'success',
                            'message': "文件已成功删除!"
                        }
                    });
                } else {
                    res.status(200);
                    res.send({
                        result: {
                            'status': 'danger',
                            'message': "文件删除失败!"
                        }
                    });
                }
            })
        })
    });

    /**
     * 复制粘贴
     */
    router.post('/paste', (req, res) => {
        req.on("data", (chunk) => {
            let data = "";
            data += chunk;
            data = JSON.parse(data);
            const isCut = data.clipboard.type === "cut";
            const promiseArr = [];
            let toPath = data.path ? data.path + '/' : '';
            data.clipboard.directories.forEach(sourceDir => {
                let destDir = toPath + path.basename(sourceDir) + '/';
                (async () => {
                    try {
                        let message = await api.copyOssFolder(destDir, sourceDir + '/');
                        message === 'err' ? promiseArr.push(Promise.resolve(false)) : promiseArr.push(Promise.resolve(true));
                    } catch (error) {
                        console.error(error);
                    }
                })();
            })
            data.clipboard.files.forEach(sourceDir => {
                let destDir = toPath + path.basename(sourceDir);
                promiseArr.push(internalClient.copy(destDir, sourceDir));
            })
            Promise.all(promiseArr).then((isTrue) => {
                if (isTrue) {
                    res.status(200);
                    res.send({
                        result: {
                            status: "success",
                            message: isCut ? "文件剪切成功!" : "文件复制成功"
                        }
                    });
                    if (isCut) {
                        api.getAllFilePath(data.clipboard.directories, data.clipboard.files).then((arr) => {
                            if (arr === 'NoSuchKey') {
                                console.error('NoSuchKey');
                            }
                            arr.forEach((item) => {
                                (async () => {
                                    try {
                                        await internalClient.delete(item);
                                    } catch (error) {
                                        console.error(error);
                                    }
                                })();
                            });
                        });
                    }
                } else {
                    res.status(200);
                    res.send({
                        result: {
                            status: "danger",
                            message: isCut ? "文件剪切失败!" : "文件复制失败"
                        }
                    })
                }
            }).catch(e => {
                res.status(200);
                res.send({
                    result: {
                        status: "danger",
                        message: isCut ? "文件剪切失败!" : "文件复制失败"
                    }
                })
            })
        });
    });
    router.post("/rename", (req, res) => {
        req.on("data", (chunk) => {
            let data = "";
            data += chunk;
            data = JSON.parse(data);
            const fileName = path.basename(data.newName);
            const reg = new RegExp('[\\\\/:*?"<>|]');
            const isValiate = reg.test(fileName);
            if (!isValiate) {
                let isFile = path.basename(data.oldName).indexOf('.') !== -1;
                if (isFile && path.basename(fileName).indexOf(".") === -1) {
                    return res.send({
                        result: {
                            status: "danger",
                            message: "重命名失败,请添加扩展名"
                        }
                    })
                }
                let Slash = isFile ? '' : '/';
                let newName = data.oldName.split('/');
                newName.pop();
                newName = newName.join('/') + '/' + fileName;
                if (isFile) {
                    (async () => {
                        try {
                            let info = await internalClient.copy(newName, data.oldName);
                            if (info.res.status === 200) {
                                let result = await internalClient.delete(data.oldName);
                                if (result.res.status === 200) {
                                    return res.send({
                                        result: {
                                            status: "success",
                                            message: "重命名成功!"
                                        }
                                    })
                                }
                                return res.send({
                                    result: {
                                        status: "danger",
                                        mesage: "重命名失败!"
                                    }
                                })
                            }
                        } catch (error) {
                            return res.send({
                                result: {
                                    status: "danger",
                                    mesage: "重命名失败!"
                                }
                            })
                        }
                    })();
                } else {
                    try {
                        api.copyOssFolder(`${newName}${Slash}`, `${data.oldName}${Slash}`).then(message => {
                            if (message === 'err') {
                                return res.send({
                                    result: {
                                        status: "danger",
                                        mesage: "重命名失败!"
                                    }
                                })
                            }
                            api.getAllFilePath([`${data.oldName}${Slash}`], []).then((arr) => {
                                if (arr === 'NoSuchKey') {
                                    return res.send({
                                        result: {
                                            status: "danger",
                                            message: "源文件删除失败！"
                                        }
                                    })
                                }
                                arr.forEach((item, index) => {
                                    (async () => {
                                        try {
                                            await internalClient.delete(item);
                                        } catch (error) {
                                            console.error(error);
                                        }
                                        if (arr.length - 1 == index) {
                                            res.send({
                                                result: {
                                                    status: "success",
                                                    message: "重命名成功!"
                                                }
                                            })
                                        }
                                    })();
                                });
                            });
                        });
                    } catch (error) {
                        return res.send({
                            result: {
                                status: "danger",
                                mesage: "重命名失败!"
                            }
                        })
                    }
                }
            } else {
                return res.send({
                    result: {
                        status: "danger",
                        message: "重命名失败,含有非法字符有\\/:*?\"<>|"
                    }
                })
            }
        })
    });

    router.post("/upload", (req, res) => {
        let savePath = ""; //当前要存储文件的地址
        let overwrite = 0; //文件是否覆盖，0 为否,1 为覆盖
        const fromPath = []; //临时文件地址
        const fileName = []; //上传的文件名
        const form = new IncomingForm({
            multiples: true,
            encoding: 'utf-8',
            uploadDir: './tempfile',
            keepExtensions: true,
            maxFileSize: 1 * 1024 * 1024 * 1024, //512MB
            maxFields: 20, // default 1000,set 0 for unlimited
            maxFieldsSize: 20 * 1024 * 1024, //default
            hash: false, //default
        });
        form.on('error', (err) => {
            console.error(err);
            res.send({
                result: {
                    status: "danger",
                    message: "上传时发生错误!"
                }
            })
        });

        form.parse(req, (err, fields, files) => {
            let file = JSON.parse(JSON.stringify(files['files[]']));
            file = file instanceof Array ? file : [file];
            let ossFilePath = [];
            let renamePromiseArr = [];
            savePath = fields.path ? fields.path + '/' : '';
            overwrite = Number(fields.overwrite);
            for (let index in file) {
                fileName[index] = (file[index]).name;
                fromPath[index] = (file[index]).path;
            }
            if (err) {
                return;
            }
            if (overwrite) {
                try {
                    fileName.forEach((item, index) => {
                        renamePromiseArr.push(putStream(fromPath[index], `${savePath}${item}`, file[index].size));
                    })
                    Promise.all(renamePromiseArr).then(result => {
                        if (result) {
                            return res.send({
                                result: {
                                    status: "success",
                                    message: "上传成功!"
                                }
                            })
                        }
                        return res.send({
                            result: {
                                status: "danger",
                                message: "上传失败!"
                            }
                        })
                    }).catch(e => e)
                } catch (error) {
                    console.error(error);
                }
            }

            // 不覆盖源文件
            internalClient.list({
                prefix: savePath, //只列出符合特定前缀的文件
                delimiter: '/'
            }).then((filesList) => {
                //该目录下无文件
                if (!filesList.objects) {
                    try {
                        fileName.forEach((item, index) => {
                            renamePromiseArr.push(putStream(fromPath[index], `${savePath}${item}`, file[index].size));
                        })
                        Promise.all(renamePromiseArr).then(result => {
                            if (result) {
                                return res.send({
                                    result: {
                                        status: "success",
                                        message: "上传成功!"
                                    }
                                })
                            }
                            return res.send({
                                result: {
                                    status: "danger",
                                    message: "上传失败!"
                                }
                            })
                        }).catch(e => e)
                    } catch (error) {
                        console.error(error);
                    }
                }
                //该目录下有文件
                try {
                    fileName.forEach((name, index) => {
                        let filePath = `${savePath}${name}`;
                        let suffixNum = 0,
                            flag = false;
                        ossFilePath.push(filePath);
                        (filesList.objects || []).forEach((item) => {
                            if (item.name.lastIndexOf('/') === item.name.length - 1) return;
                            let suffix = path.basename(item.name, path.extname(name));
                            //文件名和扩展名都相同
                            if (name.replace(/\.(?<=\.).*/g, "") === suffix.replace(/\(.*\)/, "") && path.extname(name) === path.extname(path.basename(item.name))) {
                                if (!suffix.match(/\(.*\)/)) { //is null
                                    suffixNum = 0;
                                    flag = true;
                                    return;
                                }
                                let numMatch = suffix.match(/\(.*\)/)[0].match(/\d+/);
                                let num = suffix.match(/\(.*\)/) ? Number(numMatch ? numMatch[0] : 0) : 0;
                                suffixNum = num > suffixNum ? num : suffixNum; //文件括号中的数值
                                flag = true;
                            }
                        })
                        let suffixName = !flag ? name : name.replace(/(.*)(?=\.)/, `$1(${suffixNum+1})`);
                        renamePromiseArr.push(putStream(fromPath[index], `${savePath}${suffixName}`, file[index].size));
                    });
                } catch (error) {
                    console.error(error);
                }
                Promise.all(renamePromiseArr).then(() => {
                    res.send({
                        result: {
                            status: "success",
                            message: "上传成功!"
                        }
                    })
                    deleteFiles(fromPath);
                }).catch(e => {
                    res.send({
                        result: {
                            status: "danger",
                            message: "上传失败!"
                        }
                    });
                    deleteFiles(fromPath);
                })
            }).catch(e => {
                res.send({
                    result: {
                        status: "danger",
                        message: "上传路径错误!"
                    }
                });
                deleteFiles(fromPath);
            });

            function deleteFiles(fileArr) {
                fileArr.forEach(filepath => {
                    fs.unlink(filepath, function (err) {
                        if (err) {
                            console.error(err);
                        }
                    })
                })
            }

            async function putStream(localfile, ossfile, size) {
                try {
                    let stream = fs.createReadStream(localfile);
                    let result = await internalClient.putStream(
                        ossfile, stream, {
                            contentLength: size
                        });
                    if (result.res.status === 200) {
                        return true;
                    }
                } catch (err) {
                    return false;
                }
            }
        });
    })

    return router;
};